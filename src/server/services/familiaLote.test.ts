import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { recepcaoSchema } from "@/lib/schemas/recepcao";
import { cabecalhoOPSchema, consumoSchema, processoOPSchema, producaoSchema } from "@/lib/schemas/ordemProducao";
import { pedidoVendaSchema } from "@/lib/schemas/pedidoVenda";
import { ajusteSchema } from "@/lib/schemas/ajusteEstoque";
import {
  configurarVendas,
  criarCadastrosDeVenda,
  criarCatalogoDeTeste,
  criarFixtureProducao,
  parcelaUnicaAPrazo,
  type CadastrosDeVenda,
  type CatalogoDeTeste,
  type FixtureProducao,
} from "./producaoTestFixtures";
import { cancelarRecepcao, criarRecepcao } from "./recepcaoFruto";
import {
  adicionarConsumo,
  adicionarProducao,
  atualizarProcessoOP,
  cancelarOP,
  criarOP,
  encerrarOP,
  lotesParaConsumo,
  reabrirOP,
} from "./ordemProducao";
import { criarPedido, lotesParaVenda } from "./pedidoVenda";
import { criarAjuste } from "./ajusteEstoque";
import { transferirLote } from "./estoque";

/** Fruto recebido e transferido em parte; polpa de OP encerrada transferida em parte (D-36). */
describe("lote filho segue o original (D-36)", () => {
  let fx: FixtureProducao;
  let cat: CatalogoDeTeste;
  let cad: CadastrosDeVenda;
  let camara2: string;
  const adm = () => fx.sessao("ADMINISTRADOR");
  const hoje = new Date("2026-11-10T00:00:00.000Z");
  const ids = { recepcao: "", fruto: "", frutoFilho: "", op: "", polpa: "", polpaFilho: "" };

  beforeAll(async () => {
    fx = await criarFixtureProducao("familia");
    cat = await criarCatalogoDeTeste(fx);
    cad = await criarCadastrosDeVenda(fx);
    await configurarVendas(fx, cad);
    await prisma.configuracaoProducao.update({
      where: { filialId: fx.filialAId },
      data: { categoriaCompraFrutoId: cat.categoriaCompraId, prazoPagamentoProdutorDias: 7 },
    });
    camara2 = (
      await prisma.localArmazenamento.create({ data: { filialId: fx.filialAId, nome: "Câmara 02", tipo: "CAMARA_FRIA" } })
    ).id;

    const recepcao = await criarRecepcao(
      adm(),
      recepcaoSchema.parse({
        data: "2026-11-10",
        produtoId: cat.produtoFrutoId,
        localId: cat.localRecepcaoId,
        unidade: "KG",
        descarte: "0",
        origem: "PROPRIA",
        talhaoId: cat.talhaoId,
        pesoBruto: "100",
      }),
    );
    ids.recepcao = recepcao.recepcaoId;
    ids.fruto = recepcao.loteId;
    ids.frutoFilho = (await transferirLote(adm(), recepcao.loteId, camara2, 40, hoje)).loteDestinoId;

    const op = await criarOP(adm(), cabecalhoOPSchema.parse({ data: "2026-11-10", frutaId: cat.frutaId }));
    ids.op = op.id;
    await adicionarConsumo(adm(), op.id, consumoSchema.parse({ loteId: ids.frutoFilho, quantidadeKg: 30 }));
    const polpa = await adicionarProducao(
      adm(),
      op.id,
      producaoSchema.parse({ produtoId: cat.produtoPolpaId, quantidadeKg: 20, localId: cat.localCamaraId }),
    );
    ids.polpa = polpa.loteId;
    await atualizarProcessoOP(
      adm(),
      op.id,
      processoOPSchema.parse({
        branqueamentoTemperaturaC: "85",
        branqueamentoTempoS: "12",
        aguaLitros: "0",
        carocoResiduoKg: "9",
        perdaKg: "1",
      }),
    );
    await encerrarOP(adm(), op.id, { confirmarVerificar: true });
    ids.polpaFilho = (await transferirLote(adm(), polpa.loteId, camara2, 5, hoje)).loteDestinoId;
  });
  afterAll(async () => {
    await fx.limpar();
  });

  test("filho de fruto aparece para consumo e é consumido na OP", async () => {
    const lotes = await lotesParaConsumo(fx.filialAId, cat.frutaId, hoje);
    expect(lotes.map((l) => l.id)).toContain(ids.frutoFilho);
    expect(Number((await prisma.lote.findUniqueOrThrow({ where: { id: ids.frutoFilho } })).saldoKg)).toBe(10);
  });

  test("filhos de fruto e de polpa de OP encerrada saem na venda e no ajuste", async () => {
    const paraVenda = (await lotesParaVenda(fx.filialAId, hoje)).map((l) => l.id);
    expect(paraVenda).toEqual(expect.arrayContaining([ids.frutoFilho, ids.polpaFilho]));

    await criarPedido(
      adm(),
      pedidoVendaSchema.parse({
        data: "2026-11-10",
        clienteId: cad.clienteId,
        formaPagamento: "A_PRAZO",
        parcelas: parcelaUnicaAPrazo([{ quantidadeKg: 2, precoKg: 10 }]),
        retiraNaPropriedade: "true",
        itens: JSON.stringify([{ loteId: ids.polpaFilho, quantidadeKg: 2, precoKg: 10 }]),
      }),
    );
    await criarAjuste(
      adm(),
      ajusteSchema.parse({
        loteId: ids.frutoFilho,
        data: "2026-11-10",
        sentido: "SAIDA",
        quantidadeKg: "1",
        motivo: "AMOSTRA",
      }),
    );
    expect(Number((await prisma.lote.findUniqueOrThrow({ where: { id: ids.polpaFilho } })).saldoKg)).toBe(3);
  });

  test("recepção com lote transferido não pode ser excluída", async () => {
    await expect(cancelarRecepcao(adm(), ids.recepcao, "Teste")).rejects.toThrow("O lote já teve movimentação");
  });

  test("OP com polpa transferida não reabre nem cancela", async () => {
    const polpa = await prisma.lote.findUniqueOrThrow({ where: { id: ids.polpa } });
    const mensagem = `O lote ${polpa.codigo} já teve venda, ajuste ou transferência`;
    await expect(reabrirOP(adm(), ids.op, "Teste")).rejects.toThrow(mensagem);
    await expect(cancelarOP(adm(), ids.op, "Teste")).rejects.toThrow(mensagem);
  });

  test("filho de polpa de OP aberta não sai na venda (regra pela OP do original)", async () => {
    const op = await criarOP(adm(), cabecalhoOPSchema.parse({ data: "2026-11-10", frutaId: cat.frutaId }));
    const polpa = await adicionarProducao(
      adm(),
      op.id,
      producaoSchema.parse({ produtoId: cat.produtoPolpaId, quantidadeKg: 8, localId: cat.localCamaraId }),
    );
    // Filho criado à mão: pelo serviço, polpa de OP aberta não é transferida em parte.
    const original = await prisma.lote.findUniqueOrThrow({ where: { id: polpa.loteId } });
    const filho = await prisma.lote.create({
      data: {
        filialId: fx.filialAId,
        codigo: `${original.codigo}/1`,
        produtoId: original.produtoId,
        origem: original.origem,
        data: original.data,
        validade: original.validade,
        localId: camara2,
        quantidadeInicialKg: 1,
        saldoKg: 1,
        custoKg: 0,
        loteOrigemId: original.id,
      },
    });
    expect((await lotesParaVenda(fx.filialAId, hoje)).map((l) => l.id)).not.toContain(filho.id);
    await expect(
      criarAjuste(
        adm(),
        ajusteSchema.parse({ loteId: filho.id, data: "2026-11-10", sentido: "SAIDA", quantidadeKg: "1", motivo: "AMOSTRA" }),
      ),
    ).rejects.toThrow(`O lote ${filho.codigo} está numa OP aberta`);
  });
});
