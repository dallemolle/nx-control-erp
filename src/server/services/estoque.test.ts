import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { FilialSomenteLeituraError, PermissionError } from "@/server/auth/permissions";
import {
  configurarVendas,
  criarCadastrosDeVenda,
  criarCatalogoDeTeste,
  criarFixtureProducao,
  criarLoteDeTeste,
  type CatalogoDeTeste,
  type FixtureProducao,
} from "./producaoTestFixtures";
import {
  liberarLoteVencido,
  listarLotes,
  registrarMovimento,
  resumoPorStatus,
  resumoProdutoLocal,
  revogarLiberacaoLote,
  transferirLote,
} from "./estoque";
import { MSG_SEM_PRAZO_LIBERACAO } from "@/lib/producao/liberacaoVencido";
import { cabecalhoOPSchema, producaoSchema } from "@/lib/schemas/ordemProducao";
import { adicionarProducao, criarOP } from "./ordemProducao";

const HOJE = new Date("2026-11-09");
const dia = (dias: number) => new Date(HOJE.getTime() + dias * 86_400_000);

async function somaDosMovimentos(loteId: string): Promise<number> {
  const { _sum } = await prisma.movimentoEstoque.aggregate({ where: { loteId }, _sum: { quantidadeKg: true } });
  return Number(_sum.quantidadeKg ?? 0);
}

describe("estoque: saldo por movimentos", () => {
  let fx: FixtureProducao;
  let cat: CatalogoDeTeste;
  beforeAll(async () => {
    fx = await criarFixtureProducao("estoque");
    cat = await criarCatalogoDeTeste(fx);
  });
  afterAll(async () => {
    await fx.limpar();
  });

  const saida = (loteId: string, kg: number) =>
    prisma.$transaction((tx) =>
      registrarMovimento(tx, {
        filialId: fx.filialAId,
        loteId,
        data: HOJE,
        tipo: "AJUSTE",
        quantidadeKg: -kg,
        usuarioId: fx.usuarioId,
      }),
    );

  test("saída maior que o saldo é recusada e nada muda", async () => {
    const lote = await criarLoteDeTeste(fx, { produtoId: cat.produtoFrutoId, localId: cat.localRecepcaoId, kg: 10 });
    await expect(saida(lote.id, 11)).rejects.toThrow(`Saldo insuficiente no lote ${lote.codigo}`);
    const depois = await prisma.lote.findUniqueOrThrow({ where: { id: lote.id } });
    expect(Number(depois.saldoKg)).toBe(10);
    expect(await prisma.movimentoEstoque.count({ where: { loteId: lote.id } })).toBe(1);
  });

  test("duas saídas simultâneas que juntas passam do saldo: só uma passa", async () => {
    const lote = await criarLoteDeTeste(fx, { produtoId: cat.produtoFrutoId, localId: cat.localRecepcaoId, kg: 10 });
    const resultados = await Promise.allSettled([saida(lote.id, 7), saida(lote.id, 7)]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const depois = await prisma.lote.findUniqueOrThrow({ where: { id: lote.id } });
    expect(Number(depois.saldoKg)).toBe(3);
  });

  test("saldoKg é sempre a soma dos movimentos", async () => {
    const lote = await criarLoteDeTeste(fx, { produtoId: cat.produtoFrutoId, localId: cat.localRecepcaoId, kg: 20 });
    await saida(lote.id, 4.5);
    await saida(lote.id, 0.25);
    await prisma.$transaction((tx) =>
      registrarMovimento(tx, {
        filialId: fx.filialAId,
        loteId: lote.id,
        data: HOJE,
        tipo: "AJUSTE",
        quantidadeKg: 2,
        usuarioId: fx.usuarioId,
      }),
    );
    const depois = await prisma.lote.findUniqueOrThrow({ where: { id: lote.id } });
    expect(Number(depois.saldoKg)).toBe(17.25);
    expect(await somaDosMovimentos(lote.id)).toBe(17.25);
  });
});

describe("estoque: consultas e mudança de local", () => {
  let fx: FixtureProducao;
  let cat: CatalogoDeTeste;
  beforeAll(async () => {
    fx = await criarFixtureProducao("estoqueconsulta");
    cat = await criarCatalogoDeTeste(fx);
    await criarLoteDeTeste(fx, {
      produtoId: cat.produtoPolpaId,
      localId: cat.localCamaraId,
      kg: 100,
      custoKg: 12.5,
      validade: dia(200),
      codigo: "AGC-OK",
    });
    await criarLoteDeTeste(fx, {
      produtoId: cat.produtoFrutoId,
      localId: cat.localRecepcaoId,
      kg: 30,
      custoKg: 2,
      validade: dia(-1),
      codigo: "FA-VENCIDO",
    });
    await criarLoteDeTeste(fx, {
      produtoId: cat.produtoPolpaId,
      localId: cat.localCamaraId,
      kg: 0,
      validade: dia(10),
      codigo: "AGC-ZERADO",
    });
  });
  afterAll(async () => {
    await fx.limpar();
  });

  test("ordena por validade, oculta zerados por padrão e calcula valor", async () => {
    const lotes = await listarLotes(fx.filialAId, {}, HOJE);
    expect(lotes.map((l) => l.codigo)).toEqual(["FA-VENCIDO", "AGC-OK"]);
    const ok = lotes.find((l) => l.codigo === "AGC-OK")!;
    expect(ok).toMatchObject({ status: "OK", dias: 200, valor: 1250 });
    expect(ok.produto.codigo).toBe("AGC");
    expect(ok.local.nome).toBe("Câmara fria 01");
  });

  test("mostra zerados quando pedido e filtra por status", async () => {
    const todos = await listarLotes(fx.filialAId, { incluirZerados: true }, HOJE);
    expect(todos.map((l) => l.codigo)).toContain("AGC-ZERADO");
    const vencidos = await listarLotes(fx.filialAId, { status: "VENCIDO" }, HOJE);
    expect(vencidos.map((l) => l.codigo)).toEqual(["FA-VENCIDO"]);
    const zerados = await listarLotes(fx.filialAId, { status: "ZERADO" }, HOJE);
    expect(zerados.map((l) => l.codigo)).toEqual(["AGC-ZERADO"]);
  });

  test("filtra por produto e local e não traz lote de outra filial", async () => {
    expect((await listarLotes(fx.filialAId, { produtoId: cat.produtoFrutoId }, HOJE)).map((l) => l.codigo)).toEqual([
      "FA-VENCIDO",
    ]);
    expect((await listarLotes(fx.filialAId, { localId: cat.localCamaraId }, HOJE)).map((l) => l.codigo)).toEqual([
      "AGC-OK",
    ]);
    expect(await listarLotes(fx.filialBId, { incluirZerados: true }, HOJE)).toEqual([]);
  });

  test("resumo soma por produto × local, com ocupação do local", async () => {
    const resumo = await resumoProdutoLocal(fx.filialAId);
    const polpa = resumo.linhas.find((l) => l.produtoId === cat.produtoPolpaId)!;
    expect(polpa).toMatchObject({ saldoKg: 100, valor: 1250, local: "Câmara fria 01" });
    const camara = resumo.locais.find((l) => l.localId === cat.localCamaraId)!;
    expect(camara).toMatchObject({ capacidadeKg: 1000, saldoKg: 100, ocupacao: 0.1 });
    const recepcao = resumo.locais.find((l) => l.localId === cat.localRecepcaoId)!;
    expect(recepcao.ocupacao).toBeNull();
  });

  test("transferir o saldo inteiro muda o local e audita; recusa local de outra filial e perfil sem permissão", async () => {
    const [lote] = await listarLotes(fx.filialAId, { produtoId: cat.produtoFrutoId }, HOJE);
    const saldo = Number(lote.saldoKg);
    await transferirLote(fx.sessao("PRODUCAO"), lote.id, cat.localCamaraId, saldo);
    expect((await prisma.lote.findUniqueOrThrow({ where: { id: lote.id } })).localId).toBe(cat.localCamaraId);
    expect(await prisma.auditLog.count({ where: { entidadeId: lote.id, acao: "MOVER" } })).toBe(1);

    const localB = await prisma.localArmazenamento.create({
      data: { filialId: fx.filialBId, nome: "Câmara B", tipo: "CAMARA_FRIA" },
    });
    await expect(transferirLote(fx.sessao("PRODUCAO"), lote.id, localB.id, saldo)).rejects.toThrow(
      "Local de armazenamento não encontrado ou inativo",
    );
    await expect(transferirLote(fx.sessao("VENDAS"), lote.id, cat.localRecepcaoId, saldo)).rejects.toThrow(
      PermissionError,
    );
  });
});

describe("resumoPorStatus", () => {
  let fx: FixtureProducao;
  let cat: CatalogoDeTeste;
  const ref = new Date("2026-11-20T00:00:00.000Z");

  beforeAll(async () => {
    fx = await criarFixtureProducao("estoque-status");
    cat = await criarCatalogoDeTeste(fx);
    const polpa = (kg: number, validade: string, localId = cat.localCamaraId) =>
      criarLoteDeTeste(fx, {
        produtoId: cat.produtoPolpaId,
        localId,
        kg,
        data: new Date("2026-11-01"),
        validade: new Date(validade),
      });
    await polpa(10, "2027-06-01"); // OK
    await polpa(4, "2026-12-10"); // Vencendo (20 dias ≤ 30, congelado)
    await polpa(3, "2026-11-15"); // Vencido
    await polpa(0, "2026-11-15"); // Zerado: não entra
    await polpa(7, "2027-06-01", cat.localRecepcaoId); // OK, outro local
  });
  afterAll(async () => {
    await fx.limpar();
  });

  test("conta lotes com saldo por status na data de referência", async () => {
    expect(await resumoPorStatus(fx.filialAId, {}, ref)).toEqual({
      OK: { quantidade: 2, kg: 17 },
      VENCENDO: { quantidade: 1, kg: 4 },
      VENCIDO: { quantidade: 1, kg: 3 },
    });
  });

  test("respeita o local", async () => {
    const r = await resumoPorStatus(fx.filialAId, { localId: cat.localRecepcaoId }, ref);
    expect(r.OK).toEqual({ quantidade: 1, kg: 7 });
    expect(r.VENCIDO).toEqual({ quantidade: 0, kg: 0 });
  });
});

describe("liberação de lote vencido (D-35)", () => {
  let fx: FixtureProducao;
  let cat: CatalogoDeTeste;
  const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
  const hoje = d("2026-11-14");

  /** Polpa (prazo de 5 dias no produto) com saldo. */
  const polpa = (validade: string, kg = 10) =>
    criarLoteDeTeste(fx, {
      produtoId: cat.produtoPolpaId,
      localId: cat.localCamaraId,
      kg,
      data: d("2026-10-01"),
      validade: d(validade),
    });
  const lerLote = (id: string) => prisma.lote.findUniqueOrThrow({ where: { id } });
  const liberar = (loteId: string, motivo = "Uso imediato", perfil: "GESTOR" | "VENDAS" | "PRODUCAO" = "GESTOR") =>
    liberarLoteVencido(fx.sessao(perfil), loteId, motivo, hoje);

  beforeAll(async () => {
    fx = await criarFixtureProducao("liberacao");
    cat = await criarCatalogoDeTeste(fx);
    await configurarVendas(fx, await criarCadastrosDeVenda(fx));
    await prisma.produto.update({ where: { id: cat.produtoPolpaId }, data: { diasLiberacaoVencido: 5 } });
  });
  afterAll(async () => {
    await fx.limpar();
  });

  test("GESTOR libera lote vencido até validade + N dias", async () => {
    const lote = await polpa("2026-11-12");
    expect(await liberar(lote.id)).toEqual({ liberadoAte: d("2026-11-17") });

    const gravado = await lerLote(lote.id);
    expect(gravado.liberadoAte).toEqual(d("2026-11-17"));
    expect(gravado.liberadoPorId).toBe(fx.usuarioId);
    expect(gravado.motivoLiberacao).toBe("Uso imediato");
    expect(gravado.liberadoEm).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { entidadeId: lote.id, acao: "LIBERAR_VENCIDO" } })).toBe(1);
  });

  test("recusas ao liberar", async () => {
    const lote = await polpa("2026-11-12");
    await expect(liberar(lote.id, "x", "VENDAS")).rejects.toThrow(PermissionError);
    await expect(liberar(lote.id, "x", "PRODUCAO")).rejects.toThrow(PermissionError);
    await expect(
      liberarLoteVencido(fx.sessao("GESTOR", { somenteLeitura: true }), lote.id, "x", hoje),
    ).rejects.toThrow(FilialSomenteLeituraError);

    const emDia = await polpa("2026-11-14");
    await expect(liberar(emDia.id)).rejects.toThrow(`O lote ${emDia.codigo} ainda não venceu`);

    const zerado = await polpa("2026-11-12", 0);
    await expect(liberar(zerado.id)).rejects.toThrow(`O lote ${zerado.codigo} está zerado`);

    const fruto = await criarLoteDeTeste(fx, {
      produtoId: cat.produtoFrutoId,
      localId: cat.localRecepcaoId,
      kg: 10,
      validade: d("2026-11-12"),
    });
    await expect(liberar(fruto.id)).rejects.toThrow(MSG_SEM_PRAZO_LIBERACAO);

    const antigo = await polpa("2026-11-01");
    await expect(liberar(antigo.id)).rejects.toThrow(
      "O prazo máximo de liberação deste lote terminou em 06/11/2026",
    );

    await expect(liberar(lote.id, "  ")).rejects.toThrow("Informe o motivo da liberação");

    const localB = await prisma.localArmazenamento.create({
      data: { filialId: fx.filialBId, nome: "Câmara B", tipo: "CAMARA_FRIA" },
    });
    const deOutraFilial = await criarLoteDeTeste(fx, {
      produtoId: cat.produtoPolpaId,
      localId: localB.id,
      kg: 10,
      validade: d("2026-11-12"),
      filialId: fx.filialBId,
    });
    await expect(liberar(deOutraFilial.id)).rejects.toThrow("Lote não encontrado");
  });

  test("polpa em OP aberta não pode ser liberada", async () => {
    const op = await criarOP(
      fx.sessao("ADMINISTRADOR"),
      cabecalhoOPSchema.parse({ data: "2026-11-01", frutaId: cat.frutaId }),
    );
    const producao = await adicionarProducao(
      fx.sessao("ADMINISTRADOR"),
      op.id,
      producaoSchema.parse({ produtoId: cat.produtoPolpaId, quantidadeKg: 10, localId: cat.localCamaraId, embalagens: "" }),
    );
    await prisma.lote.update({ where: { id: producao.loteId }, data: { validade: d("2026-11-12") } });
    await expect(liberar(producao.loteId)).rejects.toThrow(`O lote ${producao.codigoLote} está numa OP aberta`);
  });

  test("mudar N no produto não muda a liberação feita", async () => {
    const lote = await polpa("2026-11-12");
    await liberar(lote.id);
    await prisma.produto.update({ where: { id: cat.produtoPolpaId }, data: { diasLiberacaoVencido: 30 } });
    try {
      expect((await lerLote(lote.id)).liberadoAte).toEqual(d("2026-11-17"));
    } finally {
      await prisma.produto.update({ where: { id: cat.produtoPolpaId }, data: { diasLiberacaoVencido: 5 } });
    }
  });

  test("liberar de novo substitui o motivo e audita", async () => {
    const lote = await polpa("2026-11-12");
    await liberar(lote.id, "Primeiro");
    await liberar(lote.id, "Segundo");
    expect((await lerLote(lote.id)).motivoLiberacao).toBe("Segundo");
    expect(await prisma.auditLog.count({ where: { entidadeId: lote.id, acao: "LIBERAR_VENCIDO" } })).toBe(2);
  });

  test("revogar limpa a liberação e audita; sem liberação é recusado", async () => {
    const lote = await polpa("2026-11-12");
    await liberar(lote.id);
    await revogarLiberacaoLote(fx.sessao("GESTOR"), lote.id);
    expect(await lerLote(lote.id)).toMatchObject({
      liberadoAte: null,
      liberadoEm: null,
      liberadoPorId: null,
      motivoLiberacao: null,
    });
    expect(await prisma.auditLog.count({ where: { entidadeId: lote.id, acao: "REVOGAR_LIBERACAO" } })).toBe(1);
    await expect(revogarLiberacaoLote(fx.sessao("GESTOR"), lote.id)).rejects.toThrow(
      `O lote ${lote.codigo} não está liberado`,
    );
    await expect(revogarLiberacaoLote(fx.sessao("VENDAS"), lote.id)).rejects.toThrow(PermissionError);
  });
});

describe("transferência de lote (D-36)", () => {
  let fx: FixtureProducao;
  let cat: CatalogoDeTeste;
  let camara2: string;
  let camara3: string;
  const hoje = new Date("2026-11-18T00:00:00.000Z");
  const prod = () => fx.sessao("PRODUCAO");
  const transferir = (loteId: string, localId: string, kg: number) => transferirLote(prod(), loteId, localId, kg, hoje);
  const lerLote = (id: string) => prisma.lote.findUniqueOrThrow({ where: { id } });
  const polpa = (codigo: string, kg = 100, validade = new Date("2027-06-01")) =>
    criarLoteDeTeste(fx, { produtoId: cat.produtoPolpaId, localId: cat.localCamaraId, kg, custoKg: 12.5, validade, codigo });

  beforeAll(async () => {
    fx = await criarFixtureProducao("transferencia");
    cat = await criarCatalogoDeTeste(fx);
    camara2 = (
      await prisma.localArmazenamento.create({ data: { filialId: fx.filialAId, nome: "Câmara 02", tipo: "CAMARA_FRIA" } })
    ).id;
    camara3 = (
      await prisma.localArmazenamento.create({ data: { filialId: fx.filialAId, nome: "Câmara 03", tipo: "CAMARA_FRIA" } })
    ).id;
  });
  afterAll(async () => {
    await fx.limpar();
  });

  test("parcial cria o filho /1 no destino com os dados do original", async () => {
    const original = await polpa("AGC-T1");
    const r = await transferir(original.id, camara2, 30);
    expect(r).toMatchObject({ codigoDestino: "AGC-T1/1", loteCriado: true });

    const filho = await lerLote(r.loteDestinoId);
    expect(filho).toMatchObject({
      loteOrigemId: original.id,
      localId: camara2,
      produtoId: original.produtoId,
      origem: original.origem,
      validade: original.validade,
      data: original.data,
    });
    expect(Number(filho.saldoKg)).toBe(30);
    expect(Number(filho.quantidadeInicialKg)).toBe(30);
    expect(Number(filho.custoKg)).toBe(12.5);
    expect(Number((await lerLote(original.id)).saldoKg)).toBe(70);

    const movimentos = await prisma.movimentoEstoque.findMany({
      where: { loteId: { in: [original.id, filho.id] }, tipo: { in: ["TRANSFERENCIA_SAIDA", "TRANSFERENCIA_ENTRADA"] } },
    });
    expect(movimentos).toHaveLength(2);
    expect(movimentos[0].transferenciaId).not.toBeNull();
    expect(movimentos[0].transferenciaId).toBe(movimentos[1].transferenciaId);
    expect(movimentos.every((m) => m.data.getTime() === hoje.getTime())).toBe(true);
    expect(await prisma.auditLog.count({ where: { entidadeId: original.id, acao: "TRANSFERIR" } })).toBe(1);
  });

  test("numera a partir do original, inclusive quando o filho é transferido", async () => {
    const original = await polpa("AGC-T2");
    const a = await transferir(original.id, camara2, 10);
    const b = await transferir(original.id, cat.localRecepcaoId, 10);
    const c = await transferir(a.loteDestinoId, camara3, 5);
    expect([a.codigoDestino, b.codigoDestino, c.codigoDestino]).toEqual(["AGC-T2/1", "AGC-T2/2", "AGC-T2/3"]);
    expect((await lerLote(c.loteDestinoId)).loteOrigemId).toBe(original.id);
  });

  test("soma no lote da família que já está no destino; devolver junta no original", async () => {
    const original = await polpa("AGC-T3");
    const a = await transferir(original.id, camara2, 30);
    const b = await transferir(original.id, camara2, 20);
    expect(b).toMatchObject({ loteDestinoId: a.loteDestinoId, loteCriado: false });
    expect(Number((await lerLote(a.loteDestinoId)).saldoKg)).toBe(50);
    expect(await prisma.lote.count({ where: { loteOrigemId: original.id } })).toBe(1);

    const volta = await transferir(a.loteDestinoId, cat.localCamaraId, 50);
    expect(volta).toMatchObject({ loteDestinoId: original.id, loteCriado: false });
    expect(Number((await lerLote(original.id)).saldoKg)).toBe(100);
    expect(Number((await lerLote(a.loteDestinoId)).saldoKg)).toBe(0);
  });

  test("saldo inteiro sem família no destino só troca o local, sem movimento", async () => {
    const original = await polpa("AGC-T4", 40);
    const r = await transferir(original.id, camara2, 40);
    expect(r).toMatchObject({ loteDestinoId: original.id, codigoDestino: "AGC-T4", loteCriado: false });
    expect((await lerLote(original.id)).localId).toBe(camara2);
    expect(await prisma.movimentoEstoque.count({ where: { loteId: original.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entidadeId: original.id, acao: "MOVER" } })).toBe(1);
  });

  test("polpa de OP aberta: inteira muda de local, parcial é recusada", async () => {
    const op = await criarOP(fx.sessao("ADMINISTRADOR"), cabecalhoOPSchema.parse({ data: "2026-11-01", frutaId: cat.frutaId }));
    const producao = await adicionarProducao(
      fx.sessao("ADMINISTRADOR"),
      op.id,
      producaoSchema.parse({ produtoId: cat.produtoPolpaId, quantidadeKg: 10, localId: cat.localCamaraId, embalagens: "" }),
    );
    await expect(transferir(producao.loteId, camara2, 4)).rejects.toThrow(
      `O lote ${producao.codigoLote} está numa OP aberta`,
    );
    await transferir(producao.loteId, camara2, 10);
    expect((await lerLote(producao.loteId)).localId).toBe(camara2);
  });

  test("lote vencido pode ser transferido", async () => {
    const vencido = await polpa("AGC-T5", 10, new Date("2026-11-01"));
    const r = await transferir(vencido.id, camara2, 4);
    expect(r.loteCriado).toBe(true);
  });

  test("recusas", async () => {
    const lote = await polpa("AGC-T6", 10);
    await expect(transferir(lote.id, camara2, 0)).rejects.toThrow("Informe uma quantidade maior que zero");
    await expect(transferir(lote.id, camara2, 10.5)).rejects.toThrow(`Saldo insuficiente no lote ${lote.codigo}`);
    await expect(transferir(lote.id, cat.localCamaraId, 5)).rejects.toThrow("O lote já está neste local");

    const inativo = await prisma.localArmazenamento.create({
      data: { filialId: fx.filialAId, nome: "Inativo", tipo: "CAMARA_FRIA", ativo: false },
    });
    await expect(transferir(lote.id, inativo.id, 5)).rejects.toThrow("Local de armazenamento não encontrado ou inativo");
    const localB = await prisma.localArmazenamento.create({
      data: { filialId: fx.filialBId, nome: "Câmara B", tipo: "CAMARA_FRIA" },
    });
    await expect(transferir(lote.id, localB.id, 5)).rejects.toThrow("Local de armazenamento não encontrado ou inativo");
    const deB = await criarLoteDeTeste(fx, { produtoId: cat.produtoPolpaId, localId: localB.id, kg: 5, filialId: fx.filialBId });
    await expect(transferir(deB.id, camara2, 1)).rejects.toThrow("Lote não encontrado");

    await expect(transferirLote(fx.sessao("VENDAS"), lote.id, camara2, 5, hoje)).rejects.toThrow(PermissionError);
    await expect(
      transferirLote(fx.sessao("PRODUCAO", { somenteLeitura: true }), lote.id, camara2, 5, hoje),
    ).rejects.toThrow(FilialSomenteLeituraError);
    expect(Number((await lerLote(lote.id)).saldoKg)).toBe(10);
  });
});