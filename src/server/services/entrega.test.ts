import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { PermissionError } from "@/server/auth/permissions";
import { pedidoVendaSchema } from "@/lib/schemas/pedidoVenda";
import { entregaSchema } from "@/lib/schemas/entrega";
import { hojeDeCalendario } from "@/lib/producao/periodo";
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
import { cancelarPedido, criarPedido } from "./pedidoVenda";
import { atualizarEntrega, listarEntregas } from "./entrega";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("entregas", () => {
  let fx: FixtureProducao;
  let cat: CatalogoDeTeste;
  let cad: CadastrosDeVenda;
  let loteId: string;

  /** Pedido a prazo com entrega, na data informada. */
  const novoPedido = async (data = "2026-11-10") => {
    const r = await criarPedido(
      fx.sessao("VENDAS"),
      pedidoVendaSchema.parse({
        data,
        clienteId: cad.clienteId,
        formaPagamento: "A_PRAZO",
        vencimento: "2026-12-10",
        retiraNaPropriedade: "false",
        itens: JSON.stringify([{ loteId, quantidadeKg: 1, precoKg: 5 }]),
      }),
    );
    return r.pedidoId;
  };
  const entregaDe = (pedidoId: string) => prisma.entrega.findUniqueOrThrow({ where: { pedidoId } });

  beforeAll(async () => {
    fx = await criarFixtureProducao("entrega");
    cat = await criarCatalogoDeTeste(fx);
    cad = await criarCadastrosDeVenda(fx);
    const lote = await criarLoteDeTeste(fx, {
      produtoId: cat.produtoPolpaId,
      localId: cat.localCamaraId,
      kg: 1000,
      custoKg: 2,
      data: d("2026-11-01"),
      validade: d("2027-11-01"),
    });
    loteId = lote.id;
  });
  afterAll(async () => {
    await fx.limpar();
  });
  beforeEach(async () => {
    await configurarVendas(fx, cad);
  });

  test("ENTREGUE sem data grava hoje; com data e recebido por grava os dois", async () => {
    const semData = await novoPedido();
    await atualizarEntrega(fx.sessao("VENDAS"), semData, entregaSchema.parse({ status: "ENTREGUE" }));
    const entregue = await entregaDe(semData);
    expect(entregue.status).toBe("ENTREGUE");
    expect(entregue.dataRealizada?.toISOString()).toBe(hojeDeCalendario().toISOString());

    const comData = await novoPedido();
    await atualizarEntrega(
      fx.sessao("VENDAS"),
      comData,
      entregaSchema.parse({ status: "ENTREGUE", dataRealizada: "2026-11-12", recebidoPor: "Maria" }),
    );
    const entrega = await entregaDe(comData);
    expect(entrega.dataRealizada?.toISOString().slice(0, 10)).toBe("2026-11-12");
    expect(entrega.recebidoPor).toBe("Maria");
  });

  test("voltar para EM_ROTA limpa data realizada e recebido por", async () => {
    const pedidoId = await novoPedido();
    await atualizarEntrega(
      fx.sessao("VENDAS"),
      pedidoId,
      entregaSchema.parse({ status: "ENTREGUE", dataRealizada: "2026-11-12", recebidoPor: "Maria" }),
    );
    await atualizarEntrega(fx.sessao("VENDAS"), pedidoId, entregaSchema.parse({ status: "EM_ROTA" }));
    expect(await entregaDe(pedidoId)).toMatchObject({ status: "EM_ROTA", dataRealizada: null, recebidoPor: null });
  });

  test("edita os dados; campo omitido não muda e campo vazio apaga", async () => {
    const pedidoId = await novoPedido();
    await atualizarEntrega(
      fx.sessao("VENDAS"),
      pedidoId,
      entregaSchema.parse({
        dataPrevista: "2026-11-15",
        endereco: "Rua B, 20",
        responsavel: "João",
        observacao: "Portão azul",
      }),
    );
    await atualizarEntrega(fx.sessao("VENDAS"), pedidoId, entregaSchema.parse({ observacao: "" }));
    const entrega = await entregaDe(pedidoId);
    expect(entrega).toMatchObject({ endereco: "Rua B, 20", responsavel: "João", observacao: null, status: "PENDENTE" });
    expect(entrega.dataPrevista.toISOString().slice(0, 10)).toBe("2026-11-15");
    expect(await prisma.auditLog.count({ where: { entidade: "Entrega", entidadeId: pedidoId } })).toBe(2);
  });

  test("entrega de pedido cancelado não muda", async () => {
    const pedidoId = await novoPedido();
    await cancelarPedido(fx.sessao("FINANCEIRO"), pedidoId, "Cliente desistiu");
    await expect(
      atualizarEntrega(fx.sessao("VENDAS"), pedidoId, entregaSchema.parse({ status: "ENTREGUE" })),
    ).rejects.toThrow("Entrega cancelada não pode ser alterada");
  });

  test("permissões e escopo da filial", async () => {
    const pedidoId = await novoPedido();
    await expect(
      atualizarEntrega(fx.sessao("CONSULTA"), pedidoId, entregaSchema.parse({ status: "EM_ROTA" })),
    ).rejects.toThrow(PermissionError);
    await expect(
      atualizarEntrega(fx.sessao("VENDAS", { filial: "B" }), pedidoId, entregaSchema.parse({ status: "EM_ROTA" })),
    ).rejects.toThrow("Entrega não encontrada");
  });

  test("listarEntregas: padrão pendente e em rota; filtro de status e período; atraso", async () => {
    const pendente = await novoPedido("2026-10-01");
    const emRota = await novoPedido("2026-10-02");
    const entregue = await novoPedido("2026-10-03");
    await atualizarEntrega(fx.sessao("VENDAS"), emRota, entregaSchema.parse({ status: "EM_ROTA" }));
    await atualizarEntrega(
      fx.sessao("VENDAS"),
      entregue,
      entregaSchema.parse({ status: "ENTREGUE", dataRealizada: "2026-10-05" }),
    );
    const outubro = { inicio: d("2026-10-01"), fim: d("2026-10-31") };
    const hoje = d("2026-10-10");

    const padrao = await listarEntregas(fx.filialAId, outubro, hoje);
    expect(padrao.map((e) => e.pedidoId)).toEqual([pendente, emRota]);
    expect(padrao[0]).toMatchObject({ atraso: 9, pedido: { cliente: { nome: "Cliente exemplo" } } });

    const entregues = await listarEntregas(fx.filialAId, { ...outubro, status: ["ENTREGUE"] }, hoje);
    expect(entregues.map((e) => [e.pedidoId, e.atraso])).toEqual([[entregue, 2]]);

    expect(await listarEntregas(fx.filialAId, { inicio: d("2026-09-01"), fim: d("2026-09-30") }, hoje)).toHaveLength(0);
  });
});
