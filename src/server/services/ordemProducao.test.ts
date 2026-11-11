import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { FilialSomenteLeituraError, PermissionError } from "@/server/auth/permissions";
import { cabecalhoOPSchema, consumoSchema, processoOPSchema } from "@/lib/schemas/ordemProducao";
import { recepcaoSchema } from "@/lib/schemas/recepcao";
import {
  criarCatalogoDeTeste,
  criarFixtureProducao,
  criarLoteDeTeste,
  type CatalogoDeTeste,
  type FixtureProducao,
} from "./producaoTestFixtures";
import {
  adicionarConsumo,
  atualizarCabecalhoOP,
  atualizarProcessoOP,
  criarOP,
  lotesParaConsumo,
  removerConsumo,
} from "./ordemProducao";
import { cancelarRecepcao, criarRecepcao } from "./recepcaoFruto";
import { registrarMovimento } from "./estoque";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("ordem de produção", () => {
  let fx: FixtureProducao;
  let cat: CatalogoDeTeste;

  const adm = () => fx.sessao("ADMINISTRADOR");

  /** Fruto de açaí, 100 kg a R$ 1,50/kg, recebido em 10/11 e válido até 11/11. */
  const fruto = (kg = 100, extra: Partial<Parameters<typeof criarLoteDeTeste>[1]> = {}) =>
    criarLoteDeTeste(fx, {
      produtoId: cat.produtoFrutoId,
      localId: cat.localRecepcaoId,
      kg,
      custoKg: 1.5,
      data: d("2026-11-10"),
      validade: d("2026-11-11"),
      ...extra,
    });

  const nova = (extra: Record<string, unknown> = {}) =>
    criarOP(adm(), cabecalhoOPSchema.parse({ data: "2026-11-10", frutaId: cat.frutaId, ...extra }));

  const consumo = (loteId: string, quantidadeKg: number | string, motivo?: string) =>
    consumoSchema.parse({ loteId, quantidadeKg, motivoLiberacaoVencido: motivo ?? "" });

  const saldo = async (loteId: string) =>
    Number((await prisma.lote.findUniqueOrThrow({ where: { id: loteId } })).saldoKg);

  beforeAll(async () => {
    fx = await criarFixtureProducao("op");
    cat = await criarCatalogoDeTeste(fx);
  });

  afterAll(async () => {
    await fx.limpar();
  });

  test("numera OP-261110-01 e depois -02", async () => {
    const a = await nova();
    const b = await nova();
    expect(a.numero).toBe("OP-261110-01");
    expect(b.numero).toBe("OP-261110-02");
    const op = await prisma.ordemProducao.findUniqueOrThrow({ where: { id: a.id } });
    expect(op.status).toBe("ABERTA");
    expect(op.usuarioId).toBe(fx.usuarioId);
  });

  test("consumo baixa o fruto com o custo do lote", async () => {
    const op = await nova();
    const lote = await fruto();
    const linha = await adicionarConsumo(adm(), op.id, consumo(lote.id, 30));

    expect(await saldo(lote.id)).toBe(70);
    const consumoOP = await prisma.consumoOP.findUniqueOrThrow({ where: { id: linha.id } });
    expect(Number(consumoOP.custoKg)).toBe(1.5);
    expect(consumoOP.motivoLiberacaoVencido).toBeNull();
    const movimentos = await prisma.movimentoEstoque.findMany({ where: { consumoOpId: linha.id } });
    expect(movimentos).toHaveLength(1);
    expect(movimentos[0].tipo).toBe("CONSUMO_OP");
    expect(Number(movimentos[0].quantidadeKg)).toBe(-30);
    expect(movimentos[0].data).toEqual(d("2026-11-10"));
  });

  test("falha não grava nada", async () => {
    const op = await nova();
    const lote = await fruto();
    const antes = await prisma.movimentoEstoque.count({ where: { loteId: lote.id } });

    await expect(adicionarConsumo(adm(), op.id, consumo(lote.id, 101))).rejects.toThrow(
      `Saldo insuficiente no lote ${lote.codigo}`,
    );
    expect(await prisma.consumoOP.count({ where: { ordemProducaoId: op.id } })).toBe(0);
    expect(await prisma.movimentoEstoque.count({ where: { loteId: lote.id } })).toBe(antes);
    expect(await saldo(lote.id)).toBe(100);
  });

  test("recusas no consumo", async () => {
    const op = await nova();

    const polpa = await criarLoteDeTeste(fx, { produtoId: cat.produtoPolpaId, localId: cat.localCamaraId, kg: 10 });
    await expect(adicionarConsumo(adm(), op.id, consumo(polpa.id, 1))).rejects.toThrow(
      `O lote ${polpa.codigo} não é de fruto`,
    );

    const cupuacu = await fruto(10, { produtoId: cat.produtoFrutoOutraId });
    await expect(adicionarConsumo(adm(), op.id, consumo(cupuacu.id, 1))).rejects.toThrow(
      `O lote ${cupuacu.codigo} é de outra fruta`,
    );

    const lote = await fruto();
    await adicionarConsumo(adm(), op.id, consumo(lote.id, 1));
    await expect(adicionarConsumo(adm(), op.id, consumo(lote.id, 1))).rejects.toThrow(
      `O lote ${lote.codigo} já está nesta OP`,
    );

    const recepcao = await criarRecepcao(
      fx.sessao("PRODUCAO"),
      recepcaoSchema.parse({
        data: "2026-11-10",
        produtoId: cat.produtoFrutoId,
        origem: "PROPRIA",
        talhaoId: cat.talhaoId,
        localId: cat.localRecepcaoId,
        unidade: "KG",
        pesoBruto: "50",
        descarte: "0",
      }),
    );
    await cancelarRecepcao(fx.sessao("PRODUCAO"), recepcao.recepcaoId, "Lançada por engano");
    // Saldo devolvido à mão: a regra é a recepção excluída, não o saldo.
    await prisma.$transaction((tx) =>
      registrarMovimento(tx, {
        filialId: fx.filialAId,
        loteId: recepcao.loteId,
        data: d("2026-11-10"),
        tipo: "AJUSTE",
        quantidadeKg: 10,
        usuarioId: fx.usuarioId,
      }),
    );
    await expect(adicionarConsumo(adm(), op.id, consumo(recepcao.loteId, 1))).rejects.toThrow(
      `O lote ${recepcao.codigoLote} é de uma recepção excluída`,
    );

    const localB = await prisma.localArmazenamento.create({
      data: { filialId: fx.filialBId, nome: "Recepção B", tipo: "RECEPCAO" },
    });
    const deOutraFilial = await fruto(10, { filialId: fx.filialBId, localId: localB.id });
    await expect(adicionarConsumo(adm(), op.id, consumo(deOutraFilial.id, 1))).rejects.toThrow("Lote não encontrado");
  });

  test("fruto vencido: bloqueado, salvo liberação com motivo", async () => {
    const op = await nova();
    const vencido = await fruto(100, { validade: d("2026-11-09") });

    await expect(
      adicionarConsumo(fx.sessao("PRODUCAO"), op.id, consumo(vencido.id, 10, "Processar hoje")),
    ).rejects.toThrow(`O lote ${vencido.codigo} venceu em 09/11/2026`);
    await expect(adicionarConsumo(adm(), op.id, consumo(vencido.id, 10))).rejects.toThrow(
      `O lote ${vencido.codigo} venceu em 09/11/2026`,
    );

    const liberado = await adicionarConsumo(adm(), op.id, consumo(vencido.id, 10, "Processar hoje"));
    const linha = await prisma.consumoOP.findUniqueOrThrow({ where: { id: liberado.id } });
    expect(linha.motivoLiberacaoVencido).toBe("Processar hoje");

    const noLimite = await fruto(100, { validade: d("2026-11-10") });
    const aceito = await adicionarConsumo(fx.sessao("PRODUCAO"), op.id, consumo(noLimite.id, 10, "Desnecessário"));
    const linhaNoLimite = await prisma.consumoOP.findUniqueOrThrow({ where: { id: aceito.id } });
    expect(linhaNoLimite.motivoLiberacaoVencido).toBeNull();
  });

  test("remover consumo estorna e permite lançar de novo", async () => {
    const op = await nova();
    const lote = await fruto();
    const linha = await adicionarConsumo(adm(), op.id, consumo(lote.id, 30));

    await removerConsumo(adm(), linha.id);
    expect(await saldo(lote.id)).toBe(100);
    const removida = await prisma.consumoOP.findUniqueOrThrow({ where: { id: linha.id } });
    expect(removida.removidoEm).not.toBeNull();
    const tipos = (
      await prisma.movimentoEstoque.findMany({ where: { consumoOpId: linha.id }, orderBy: { criadoEm: "asc" } })
    ).map((m) => [m.tipo, Number(m.quantidadeKg)]);
    expect(tipos).toEqual([
      ["CONSUMO_OP", -30],
      ["ESTORNO_CONSUMO_OP", 30],
    ]);

    await expect(removerConsumo(adm(), linha.id)).rejects.toThrow("Linha já removida");
    await adicionarConsumo(adm(), op.id, consumo(lote.id, 20));
    expect(await saldo(lote.id)).toBe(80);
  });

  test("cabeçalho e processo", async () => {
    const op = await nova({ responsavel: "Fulano" });
    await atualizarProcessoOP(
      adm(),
      op.id,
      processoOPSchema.parse({
        branqueamentoTemperaturaC: "85",
        branqueamentoTempoS: "12",
        aguaLitros: "40",
        carocoResiduoKg: "",
        perdaKg: "2,5".replace(",", "."),
        observacao: "Batelada da manhã",
      }),
    );
    const gravada = await prisma.ordemProducao.findUniqueOrThrow({ where: { id: op.id } });
    expect(Number(gravada.branqueamentoTemperaturaC)).toBe(85);
    expect(gravada.branqueamentoTempoS).toBe(12);
    expect(Number(gravada.aguaLitros)).toBe(40);
    expect(Number(gravada.carocoResiduoKg)).toBe(0);
    expect(Number(gravada.perdaKg)).toBe(2.5);
    expect(gravada.observacao).toBe("Batelada da manhã");
    expect(gravada.responsavel).toBe("Fulano");

    // Sem linhas: muda data e fruta.
    await atualizarCabecalhoOP(
      adm(),
      op.id,
      cabecalhoOPSchema.parse({ data: "2026-11-11", frutaId: cat.outraFrutaId, responsavel: "Beltrano" }),
    );
    const mudada = await prisma.ordemProducao.findUniqueOrThrow({ where: { id: op.id } });
    expect(mudada.frutaId).toBe(cat.outraFrutaId);
    expect(mudada.responsavel).toBe("Beltrano");
    expect(mudada.numero).toBe(op.numero);

    // Com linha ativa: só o responsável muda.
    const lote = await fruto(10, { produtoId: cat.produtoFrutoOutraId, validade: d("2026-11-12") });
    await adicionarConsumo(adm(), op.id, consumo(lote.id, 1));
    await expect(
      atualizarCabecalhoOP(adm(), op.id, cabecalhoOPSchema.parse({ data: "2026-11-11", frutaId: cat.frutaId })),
    ).rejects.toThrow("Remova as linhas antes de mudar a data ou a fruta");
    await atualizarCabecalhoOP(
      adm(),
      op.id,
      cabecalhoOPSchema.parse({ data: "2026-11-11", frutaId: cat.outraFrutaId, responsavel: "Ciclano" }),
    );
    expect((await prisma.ordemProducao.findUniqueOrThrow({ where: { id: op.id } })).responsavel).toBe("Ciclano");
  });

  test("permissões", async () => {
    const dados = cabecalhoOPSchema.parse({ data: "2026-11-10", frutaId: cat.frutaId });
    await expect(criarOP(fx.sessao("VENDAS"), dados)).rejects.toThrow(PermissionError);
    await expect(criarOP(fx.sessao("CONSULTA"), dados)).rejects.toThrow(PermissionError);
    await expect(criarOP(fx.sessao("PRODUCAO", { somenteLeitura: true }), dados)).rejects.toThrow(
      FilialSomenteLeituraError,
    );
    await expect(
      criarOP(adm(), cabecalhoOPSchema.parse({ data: "2026-11-10", frutaId: "nao-existe" })),
    ).rejects.toThrow("Fruta não encontrada ou inativa");
  });

  test("lotesParaConsumo: fruto da fruta, com saldo, em ordem FEFO", async () => {
    const tarde = await fruto(5, { validade: d("2026-12-20") });
    const cedo = await fruto(5, { validade: d("2026-12-18") });
    const vazio = await fruto(0, { validade: d("2026-12-17") });
    const outra = await fruto(5, { produtoId: cat.produtoFrutoOutraId, validade: d("2026-12-17") });

    const lotes = await lotesParaConsumo(fx.filialAId, cat.frutaId, d("2026-12-19"));
    const ids = lotes.map((l) => l.id);
    expect(ids.indexOf(cedo.id)).toBeLessThan(ids.indexOf(tarde.id));
    expect(ids).not.toContain(vazio.id);
    expect(ids).not.toContain(outra.id);
    expect(lotes.find((l) => l.id === cedo.id)?.vencido).toBe(true);
    expect(lotes.find((l) => l.id === tarde.id)?.vencido).toBe(false);
  });
});
