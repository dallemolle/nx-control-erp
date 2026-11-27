import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { pedidoVendaSchema } from "@/lib/schemas/pedidoVenda";
import {
  configurarVendas,
  criarCadastrosDeVenda,
  criarCatalogoDeTeste,
  criarFixtureProducao,
  criarLoteDeTeste,
  type CadastrosDeVenda,
  type CatalogoDeTeste,
  type FixtureProducao,
} from "./producaoTestFixtures";
import { criarOperadoraDeTeste } from "./cartaoTestFixtures";
import { cancelarPedido, criarPedido, situacaoParaCancelar } from "./pedidoVenda";
import { confirmarRepasses, desfazerRepasse, listarRepasses } from "./repasseCartao";
import { estornarBaixa, MSG_BAIXA_MAQUININHA, MSG_ESTORNO_REPASSE, registrarBaixa } from "./baixa";
import { conciliarEmGrupo } from "./conciliacao";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("repasses de cartão", () => {
  let fx: FixtureProducao;
  let cat: CatalogoDeTeste;
  let cad: CadastrosDeVenda;
  let op: Awaited<ReturnType<typeof criarOperadoraDeTeste>>;

  /** Crédito 3x de R$ 100 em 2026-11-10: repasses de 33,33/33,33/33,34 com taxa 0,99/0,99/1,02. */
  async function vendaParcelada() {
    const lote = await criarLoteDeTeste(fx, {
      produtoId: cat.produtoPolpaId,
      localId: cat.localCamaraId,
      kg: 100,
      custoKg: 2,
      data: d("2026-11-01"),
      validade: d("2027-11-01"),
    });
    const r = await criarPedido(
      fx.sessao("VENDAS"),
      pedidoVendaSchema.parse({
        data: "2026-11-10",
        clienteId: cad.clienteId,
        formaPagamento: "CARTAO",
        operadoraCartaoId: op.id,
        modalidadeCartao: "CREDITO_PARCELADO",
        parcelasCartao: "3",
        retiraNaPropriedade: "true",
        itens: JSON.stringify([{ loteId: lote.id, quantidadeKg: 10, precoKg: 10 }]),
      }),
    );
    const pedido = await prisma.pedidoVenda.findUniqueOrThrow({
      where: { id: r.pedidoId },
      include: {
        titulo: { include: { parcelas: { orderBy: { numero: "asc" } } } },
        tituloTaxa: { include: { parcelas: { orderBy: { numero: "asc" } } } },
      },
    });
    return { ...r, parcelas: pedido.titulo!.parcelas, parcelasTaxa: pedido.tituloTaxa!.parcelas };
  }

  const lancamentosDa = (baixaId: string) => prisma.lancamentoBancario.findMany({ where: { baixaId } });

  beforeAll(async () => {
    fx = await criarFixtureProducao("repasse");
    cat = await criarCatalogoDeTeste(fx);
    cad = await criarCadastrosDeVenda(fx);
    op = await criarOperadoraDeTeste(fx, cat, cad);
  });
  afterAll(async () => {
    await fx.limpar();
  });
  beforeEach(async () => {
    await configurarVendas(fx, cad);
  });

  test("confirmar baixa o bruto e a taxa na conta da operadora", async () => {
    const v = await vendaParcelada();
    await confirmarRepasses(fx.sessao("FINANCEIRO"), [v.parcelas[0].id], d("2026-11-11"));

    const repasse = await prisma.repasseCartaoConfirmado.findUniqueOrThrow({ where: { parcelaId: v.parcelas[0].id } });
    const [entrada] = await lancamentosDa(repasse.baixaRecebimentoId);
    const [saida] = await lancamentosDa(repasse.baixaTaxaId!);
    expect(entrada).toMatchObject({ tipo: "ENTRADA", contaBancariaId: op.contaId });
    expect(Number(entrada.valor)).toBe(33.33);
    expect(saida).toMatchObject({ tipo: "SAIDA", contaBancariaId: op.contaId });
    expect(Number(saida.valor)).toBe(0.99);
    const parcelas = await prisma.parcela.findMany({ where: { id: { in: [v.parcelas[0].id, v.parcelasTaxa[0].id] } } });
    expect(parcelas.every((p) => p.status === "PAGO")).toBe(true);
  });

  test("confirmar duas vezes recusa a transação inteira", async () => {
    const v = await vendaParcelada();
    await confirmarRepasses(fx.sessao("FINANCEIRO"), [v.parcelas[0].id], d("2026-11-11"));
    await expect(
      confirmarRepasses(fx.sessao("FINANCEIRO"), [v.parcelas[1].id, v.parcelas[0].id], d("2026-11-11")),
    ).rejects.toThrow(`O repasse 1 do PV-${v.numero} já foi confirmado`);
    expect(await prisma.repasseCartaoConfirmado.count({ where: { parcelaId: v.parcelas[1].id } })).toBe(0);
  });

  test("recusa data futura, parcela de título comum e baixa manual", async () => {
    const v = await vendaParcelada();
    await expect(confirmarRepasses(fx.sessao("FINANCEIRO"), [v.parcelas[0].id], d("2999-01-01"))).rejects.toThrow(
      "A data do recebimento não pode ser futura",
    );
    await expect(confirmarRepasses(fx.sessao("FINANCEIRO"), [v.parcelasTaxa[0].id], d("2026-11-11"))).rejects.toThrow(
      "Esta parcela não é repasse de venda na maquininha",
    );
    const baixa = {
      data: d("2026-11-11"),
      valorPago: 33.33,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: op.contaId,
    };
    await expect(registrarBaixa(fx.sessao("FINANCEIRO"), v.parcelas[1].id, baixa)).rejects.toThrow(
      MSG_BAIXA_MAQUININHA,
    );
    await expect(registrarBaixa(fx.sessao("FINANCEIRO"), v.parcelasTaxa[1].id, baixa)).rejects.toThrow(
      MSG_BAIXA_MAQUININHA,
    );
  });

  test("baixa de repasse não é estornada: o caminho é Desfazer repasse", async () => {
    const v = await vendaParcelada();
    await confirmarRepasses(fx.sessao("FINANCEIRO"), [v.parcelas[0].id], d("2026-11-11"));
    const repasse = await prisma.repasseCartaoConfirmado.findUniqueOrThrow({ where: { parcelaId: v.parcelas[0].id } });

    await expect(estornarBaixa(fx.sessao("TESOURARIA"), repasse.baixaRecebimentoId, "teste")).rejects.toThrow(
      MSG_ESTORNO_REPASSE,
    );
    await expect(estornarBaixa(fx.sessao("TESOURARIA"), repasse.baixaTaxaId!, "teste")).rejects.toThrow(
      MSG_ESTORNO_REPASSE,
    );
  });

  test("desfazer volta a parcela para aberto; conciliado recusa", async () => {
    const v = await vendaParcelada();
    await confirmarRepasses(fx.sessao("FINANCEIRO"), [v.parcelas[0].id, v.parcelas[1].id], d("2026-11-11"));
    await desfazerRepasse(fx.sessao("FINANCEIRO"), v.parcelas[0].id);
    expect(await prisma.repasseCartaoConfirmado.count({ where: { parcelaId: v.parcelas[0].id } })).toBe(0);
    const [p, t] = await Promise.all([
      prisma.parcela.findUniqueOrThrow({ where: { id: v.parcelas[0].id } }),
      prisma.parcela.findUniqueOrThrow({ where: { id: v.parcelasTaxa[0].id } }),
    ]);
    expect(p.status).not.toBe("PAGO");
    expect(t.status).not.toBe("PAGO");

    // Conciliação em grupo do 2º repasse: depósito líquido de 32,34 = 33,33 − 0,99.
    const repasse = await prisma.repasseCartaoConfirmado.findUniqueOrThrow({ where: { parcelaId: v.parcelas[1].id } });
    const lancamentos = await prisma.lancamentoBancario.findMany({
      where: { baixaId: { in: [repasse.baixaRecebimentoId, repasse.baixaTaxaId!] } },
    });
    const extrato = await prisma.extratoImportado.create({
      data: {
        filialId: fx.filialAId,
        contaBancariaId: op.contaId,
        nomeArquivo: "teste.ofx",
        totalLinhas: 1,
        linhasNovas: 1,
        linhasIgnoradas: 0,
        usuarioId: fx.usuarioId,
      },
    });
    const linha = await prisma.linhaExtrato.create({
      data: {
        extratoImportadoId: extrato.id,
        contaBancariaId: op.contaId,
        data: d("2026-11-11"),
        valor: 32.34,
        tipo: "ENTRADA",
        historico: "STONE",
        identificadorBancario: `REP-${Date.now()}`,
      },
    });
    await conciliarEmGrupo(fx.sessao("ADMINISTRADOR"), {
      linhaIds: [linha.id],
      lancamentoIds: lancamentos.map((l) => l.id),
    });
    await expect(desfazerRepasse(fx.sessao("FINANCEIRO"), v.parcelas[1].id)).rejects.toThrow(
      "O repasse já foi conciliado. Desconcilie na Conciliação antes",
    );
  });

  test("lista com situação, taxa e líquido", async () => {
    const v = await vendaParcelada();
    await confirmarRepasses(fx.sessao("FINANCEIRO"), [v.parcelas[0].id], d("2026-11-11"));
    // Hoje = 20/01/2027: o 2º (09/01) está atrasado e o 3º (08/02) ainda a receber.
    const lista = await listarRepasses(fx.filialAId, { operadoraId: op.id }, d("2027-01-20"));
    const doPedido = lista.filter((r) => r.pedidoNumero === v.numero);
    expect(doPedido.map((r) => [r.numero, r.situacao, r.taxa, r.liquido])).toEqual([
      [1, "RECEBIDO", 0.99, 32.34],
      [2, "ATRASADO", 0.99, 32.34],
      [3, "A_RECEBER", 1.02, 32.32],
    ]);
    expect(doPedido[0].recebidoEm?.toISOString().slice(0, 10)).toBe("2026-11-11");
    const pendentes = await listarRepasses(
      fx.filialAId,
      { operadoraId: op.id, situacao: "PENDENTES" },
      d("2027-01-20"),
    );
    expect(pendentes.some((r) => r.parcelaId === v.parcelas[0].id)).toBe(false);
  });

  test("cancelar sem repasse confirmado cancela os dois títulos", async () => {
    const v = await vendaParcelada();
    await cancelarPedido(fx.sessao("FINANCEIRO"), v.pedidoId, "Cliente desistiu");
    const parcelas = await prisma.parcela.findMany({
      where: { id: { in: [...v.parcelas, ...v.parcelasTaxa].map((p) => p.id) } },
    });
    expect(parcelas.every((p) => p.status === "CANCELADO")).toBe(true);
  });

  test("com repasse confirmado o cancelamento é recusado", async () => {
    const v = await vendaParcelada();
    await confirmarRepasses(fx.sessao("FINANCEIRO"), [v.parcelas[0].id], d("2026-11-11"));
    const pedido = await prisma.pedidoVenda.findUniqueOrThrow({ where: { id: v.pedidoId } });
    expect(await situacaoParaCancelar(pedido)).toEqual({
      pode: false,
      motivo: "Desfaça a confirmação dos repasses antes de cancelar",
    });
    await expect(cancelarPedido(fx.sessao("FINANCEIRO"), v.pedidoId, "Cliente desistiu")).rejects.toThrow(
      "Desfaça a confirmação dos repasses antes de cancelar",
    );
  });
});
