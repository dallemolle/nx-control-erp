import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { FilialSomenteLeituraError, PermissionError } from "@/server/auth/permissions";
import {
  cabecalhoOPSchema,
  consumoSchema,
  insumoOPSchema,
  processoOPSchema,
  producaoSchema,
} from "@/lib/schemas/ordemProducao";
import { recepcaoSchema } from "@/lib/schemas/recepcao";
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
import {
  adicionarConsumo,
  adicionarInsumo,
  adicionarProducao,
  atualizarCabecalhoOP,
  atualizarProcessoOP,
  cancelarOP,
  criarOP,
  encerrarOP,
  listarOPs,
  lotesParaConsumo,
  obterOP,
  reabrirOP,
  removerConsumo,
  removerInsumo,
  removerProducao,
  situacaoParaDesfazer,
} from "./ordemProducao";
import { cancelarPedido, criarPedido, lotesParaVenda } from "./pedidoVenda";
import { criarAjuste } from "./ajusteEstoque";
import { listarLotes, moverLote } from "./estoque";
import { pedidoVendaSchema } from "@/lib/schemas/pedidoVenda";
import { ajusteSchema } from "@/lib/schemas/ajusteEstoque";
import { cancelarRecepcao, criarRecepcao } from "./recepcaoFruto";
import { registrarMovimento } from "./estoque";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("ordem de produção", () => {
  let fx: FixtureProducao;
  let cat: CatalogoDeTeste;
  let cad: CadastrosDeVenda;

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
    cad = await criarCadastrosDeVenda(fx);
    await configurarVendas(fx, cad);
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

  describe("produção e insumos", () => {
    const producao = (produtoId: string, quantidadeKg: number, extra: Record<string, unknown> = {}) =>
      producaoSchema.parse({ produtoId, quantidadeKg, localId: cat.localCamaraId, embalagens: "", ...extra });
    const insumo = (insumoId: string, quantidade: number) => insumoOPSchema.parse({ insumoId, quantidade });
    const custoDoLote = async (loteId: string) =>
      Number((await prisma.lote.findUniqueOrThrow({ where: { id: loteId } })).custoKg);

    test("produção cria o lote de polpa", async () => {
      const op = await nova({ data: "2026-11-12" });
      const linha = await adicionarProducao(adm(), op.id, producao(cat.produtoPolpaId, 60, { embalagens: "60" }));

      expect(linha.codigoLote).toBe("AGC-261112-01");
      const lote = await prisma.lote.findUniqueOrThrow({ where: { id: linha.loteId } });
      expect(lote.origem).toBe("PRODUCAO");
      expect(lote.data).toEqual(d("2026-11-12"));
      expect(lote.validade).toEqual(d("2027-11-12"));
      expect(lote.localId).toBe(cat.localCamaraId);
      expect(Number(lote.saldoKg)).toBe(60);
      expect(Number(lote.quantidadeInicialKg)).toBe(60);
      const producaoOP = await prisma.producaoOP.findUniqueOrThrow({ where: { id: linha.id } });
      expect(producaoOP.embalagens).toBe(60);
      const movimentos = await prisma.movimentoEstoque.findMany({ where: { producaoOpId: linha.id } });
      expect(movimentos.map((m) => [m.tipo, Number(m.quantidadeKg)])).toEqual([["PRODUCAO_OP", 60]]);
    });

    test("custo provisório igual em todas as polpas", async () => {
      const op = await nova();
      const lote = await fruto();
      await adicionarConsumo(adm(), op.id, consumo(lote.id, 100));
      const grosso = await adicionarProducao(adm(), op.id, producao(cat.produtoPolpaId, 40));
      const fino = await adicionarProducao(adm(), op.id, producao(cat.produtoPolpaFinoId, 20));
      expect(await custoDoLote(grosso.loteId)).toBe(2.5);
      expect(await custoDoLote(fino.loteId)).toBe(2.5);

      const embalagem = await adicionarInsumo(adm(), op.id, insumo(cat.insumoId, 60));
      expect(await custoDoLote(grosso.loteId)).toBe(3);
      expect(await custoDoLote(fino.loteId)).toBe(3);

      await removerInsumo(adm(), embalagem.id);
      expect(await custoDoLote(grosso.loteId)).toBe(2.5);

      await removerProducao(adm(), fino.id);
      expect(await custoDoLote(grosso.loteId)).toBe(3.75);
      expect(await saldo(fino.loteId)).toBe(0);
      const linhaFino = await prisma.producaoOP.findUniqueOrThrow({ where: { id: fino.id } });
      expect(linhaFino.removidoEm).not.toBeNull();
      const estorno = await prisma.movimentoEstoque.findFirstOrThrow({
        where: { producaoOpId: fino.id, tipo: "ESTORNO_PRODUCAO_OP" },
      });
      expect(Number(estorno.quantidadeKg)).toBe(-20);
      await expect(removerProducao(adm(), fino.id)).rejects.toThrow("Linha já removida");
    });

    test("insumo com custo congelado no lançamento", async () => {
      const op = await nova();
      const lote = await fruto();
      await adicionarConsumo(adm(), op.id, consumo(lote.id, 10));
      const polpa = await adicionarProducao(adm(), op.id, producao(cat.produtoPolpaId, 10));
      const linha = await adicionarInsumo(adm(), op.id, insumo(cat.insumoId, 10));
      const antes = await custoDoLote(polpa.loteId);

      await prisma.insumo.update({ where: { id: cat.insumoId }, data: { custoUnitario: 9 } });
      try {
        const gravada = await prisma.insumoOP.findUniqueOrThrow({ where: { id: linha.id } });
        expect(Number(gravada.custoUnitario)).toBe(0.5);
        await adicionarProducao(adm(), op.id, producao(cat.produtoPolpaFinoId, 10));
        // 15 de fruto + 5 de insumo ÷ 20 kg: o preço novo do cadastro não entra.
        expect(await custoDoLote(polpa.loteId)).toBe(1);
        expect(antes).toBe(2);
      } finally {
        await prisma.insumo.update({ where: { id: cat.insumoId }, data: { custoUnitario: 0.5 } });
      }
    });

    test("recusas na produção e no insumo", async () => {
      const op = await nova();
      await expect(adicionarProducao(adm(), op.id, producao(cat.produtoFrutoId, 1))).rejects.toThrow(
        "Produto de polpa não encontrado ou inativo",
      );
      await expect(adicionarProducao(adm(), op.id, producao(cat.produtoPolpaOutraId, 1))).rejects.toThrow(
        "O produto é de outra fruta",
      );
      const localB = await prisma.localArmazenamento.create({
        data: { filialId: fx.filialBId, nome: "Câmara B", tipo: "CAMARA_FRIA" },
      });
      await expect(
        adicionarProducao(adm(), op.id, producao(cat.produtoPolpaId, 1, { localId: localB.id })),
      ).rejects.toThrow("Local de armazenamento não encontrado ou inativo");
      await expect(adicionarInsumo(adm(), op.id, insumo(cat.insumoInativoId, 1))).rejects.toThrow(
        "Insumo não encontrado ou inativo",
      );
    });

    test("OP encerrada recusa linhas", async () => {
      const op = await nova();
      const lote = await fruto();
      const linha = await adicionarConsumo(adm(), op.id, consumo(lote.id, 1));
      await prisma.ordemProducao.update({ where: { id: op.id }, data: { status: "ENCERRADA" } });

      const mensagem = `A OP ${op.numero} está encerrada`;
      await expect(adicionarConsumo(adm(), op.id, consumo(lote.id, 1))).rejects.toThrow(mensagem);
      await expect(adicionarProducao(adm(), op.id, producao(cat.produtoPolpaId, 1))).rejects.toThrow(mensagem);
      await expect(adicionarInsumo(adm(), op.id, insumo(cat.insumoId, 1))).rejects.toThrow(mensagem);
      await expect(removerConsumo(adm(), linha.id)).rejects.toThrow(mensagem);
    });
  });

  describe("encerrar, reabrir e cancelar", () => {
    const PROCESSO_OK = {
      branqueamentoTemperaturaC: "85",
      branqueamentoTempoS: "12",
      aguaLitros: "0",
      carocoResiduoKg: "38",
      perdaKg: "2",
    };

    /** 100 kg de fruto a 1,5 → AGC 40 + AFN 20, 60 embalagens a 0,5; balanço 0 e branqueamento OK. */
    async function opCompleta(processo: Record<string, string> = PROCESSO_OK) {
      const op = await nova({ data: "2026-11-13" });
      const lote = await fruto(100, { data: d("2026-11-13"), validade: d("2026-11-14") });
      const consumoId = (await adicionarConsumo(adm(), op.id, consumo(lote.id, 100))).id;
      const grosso = await adicionarProducao(
        adm(),
        op.id,
        producaoSchema.parse({ produtoId: cat.produtoPolpaId, quantidadeKg: 40, localId: cat.localCamaraId }),
      );
      const fino = await adicionarProducao(
        adm(),
        op.id,
        producaoSchema.parse({ produtoId: cat.produtoPolpaFinoId, quantidadeKg: 20, localId: cat.localCamaraId }),
      );
      await adicionarInsumo(adm(), op.id, insumoOPSchema.parse({ insumoId: cat.insumoId, quantidade: 60 }));
      await atualizarProcessoOP(adm(), op.id, processoOPSchema.parse(processo));
      return { op, lote, consumoId, grosso, fino };
    }

    test("encerra e grava o custo", async () => {
      const { op, grosso, fino } = await opCompleta();
      await encerrarOP(adm(), op.id, { confirmarVerificar: false });

      const encerrada = await prisma.ordemProducao.findUniqueOrThrow({ where: { id: op.id } });
      expect(encerrada.status).toBe("ENCERRADA");
      expect(encerrada.encerradaEm).not.toBeNull();
      expect(Number(encerrada.custoFrutoTotal)).toBe(150);
      expect(Number(encerrada.custoInsumosTotal)).toBe(30);
      expect(Number(encerrada.custoKgPolpa)).toBe(3);
      for (const loteId of [grosso.loteId, fino.loteId]) {
        expect(Number((await prisma.lote.findUniqueOrThrow({ where: { id: loteId } })).custoKg)).toBe(3);
      }
    });

    test("encerrar exige consumo e produção", async () => {
      const vazia = await nova();
      await expect(encerrarOP(adm(), vazia.id, { confirmarVerificar: true })).rejects.toThrow(
        "Lance ao menos um consumo de fruto",
      );
      const lote = await fruto();
      await adicionarConsumo(adm(), vazia.id, consumo(lote.id, 10));
      await expect(encerrarOP(adm(), vazia.id, { confirmarVerificar: true })).rejects.toThrow(
        "Lance ao menos uma produção de polpa",
      );
    });

    test("com Verificar exige confirmação", async () => {
      const { op } = await opCompleta({ ...PROCESSO_OK, branqueamentoTemperaturaC: "", branqueamentoTempoS: "" });
      await expect(encerrarOP(adm(), op.id, { confirmarVerificar: false })).rejects.toThrow(
        "Confirme para encerrar com itens a verificar: Branqueamento",
      );
      await encerrarOP(adm(), op.id, { confirmarVerificar: true });
      const auditoria = await prisma.auditLog.findFirstOrThrow({
        where: { entidadeId: op.id, acao: "ENCERRAR" },
      });
      expect(auditoria.valorNovo).toMatchObject({ confirmouVerificar: true, branqueamento: "VERIFICAR" });
    });

    test("concorrência: encerrar e lançar ao mesmo tempo não deixa linha fora do custo", async () => {
      const { op } = await opCompleta();
      const outro = await fruto(10, { data: d("2026-11-13"), validade: d("2026-11-14") });
      const [, lancamento] = await Promise.allSettled([
        encerrarOP(adm(), op.id, { confirmarVerificar: true }),
        adicionarConsumo(adm(), op.id, consumo(outro.id, 10)),
      ]);
      if (lancamento.status === "rejected") {
        expect(String(lancamento.reason)).toContain(`A OP ${op.numero} está encerrada`);
      }
      const encerrada = await prisma.ordemProducao.findUniqueOrThrow({ where: { id: op.id } });
      expect(encerrada.status).toBe("ENCERRADA");
      const consumos = await prisma.consumoOP.findMany({ where: { ordemProducaoId: op.id, removidoEm: null } });
      const custoFruto = consumos.reduce((s, c) => s + Number(c.quantidadeKg) * Number(c.custoKg), 0);
      expect(Number(encerrada.custoFrutoTotal)).toBeCloseTo(custoFruto, 2);
    });

    test("reabrir sem saída volta a aberta e limpa os custos", async () => {
      const { op, grosso } = await opCompleta();
      await encerrarOP(adm(), op.id, { confirmarVerificar: false });
      await expect(reabrirOP(adm(), op.id, "")).rejects.toThrow("Informe o motivo da reabertura");

      await reabrirOP(adm(), op.id, "Faltou um insumo");
      const reaberta = await prisma.ordemProducao.findUniqueOrThrow({ where: { id: op.id } });
      expect(reaberta.status).toBe("ABERTA");
      expect(reaberta.custoKgPolpa).toBeNull();
      expect(reaberta.encerradaEm).toBeNull();
      expect(reaberta.motivoReabertura).toBe("Faltou um insumo");
      await expect(reabrirOP(adm(), op.id, "De novo")).rejects.toThrow(`A OP ${op.numero} está aberta`);

      await adicionarInsumo(adm(), op.id, insumoOPSchema.parse({ insumoId: cat.insumoId, quantidade: 60 }));
      await encerrarOP(adm(), op.id, { confirmarVerificar: false });
      expect(Number((await prisma.ordemProducao.findUniqueOrThrow({ where: { id: op.id } })).custoKgPolpa)).toBe(3.5);
      expect(Number((await prisma.lote.findUniqueOrThrow({ where: { id: grosso.loteId } })).custoKg)).toBe(3.5);
    });

    test("reabrir e cancelar recusados depois de uma venda, mesmo cancelada", async () => {
      const { op, grosso } = await opCompleta();
      await encerrarOP(adm(), op.id, { confirmarVerificar: false });

      const pedido = await criarPedido(
        fx.sessao("VENDAS"),
        pedidoVendaSchema.parse({
          data: "2026-11-13",
          clienteId: cad.clienteId,
          formaPagamento: "A_PRAZO",
          vencimento: "2026-12-13",
          retiraNaPropriedade: "true",
          itens: JSON.stringify([{ loteId: grosso.loteId, quantidadeKg: 5, precoKg: 10 }]),
        }),
      );
      await cancelarPedido(adm(), pedido.pedidoId, "Cliente desistiu");

      const mensagem = `O lote ${grosso.codigoLote} já teve venda ou ajuste`;
      await expect(reabrirOP(adm(), op.id, "Corrigir")).rejects.toThrow(mensagem);
      await expect(cancelarOP(adm(), op.id, "Corrigir")).rejects.toThrow(mensagem);
      expect(await situacaoParaDesfazer({ id: op.id, status: "ENCERRADA" })).toEqual({ pode: false, motivo: mensagem });
    });

    test("cancelar OP aberta estorna tudo", async () => {
      const { op, lote, grosso, fino } = await opCompleta();
      await expect(cancelarOP(adm(), op.id, "")).rejects.toThrow("Informe o motivo do cancelamento");

      await cancelarOP(adm(), op.id, "Lançada por engano");
      expect(await saldo(lote.id)).toBe(100);
      expect(await saldo(grosso.loteId)).toBe(0);
      expect(await saldo(fino.loteId)).toBe(0);
      const cancelada = await prisma.ordemProducao.findUniqueOrThrow({ where: { id: op.id } });
      expect(cancelada.status).toBe("CANCELADA");
      expect(cancelada.motivoCancelamento).toBe("Lançada por engano");
      expect(cancelada.canceladaEm).not.toBeNull();

      const mensagem = `A OP ${op.numero} está cancelada`;
      await expect(adicionarConsumo(adm(), op.id, consumo(lote.id, 1))).rejects.toThrow(mensagem);
      await expect(cancelarOP(adm(), op.id, "De novo")).rejects.toThrow(mensagem);
    });

    test("cancelar OP encerrada sem saída", async () => {
      const { op, lote } = await opCompleta();
      await encerrarOP(adm(), op.id, { confirmarVerificar: false });
      await cancelarOP(adm(), op.id, "Batelada descartada");
      expect(await saldo(lote.id)).toBe(100);
      expect((await prisma.ordemProducao.findUniqueOrThrow({ where: { id: op.id } })).status).toBe("CANCELADA");
    });

    test("listarOPs e obterOP", async () => {
      const { op, fino } = await opCompleta();
      await encerrarOP(adm(), op.id, { confirmarVerificar: false });
      const aberta = await nova({ data: "2026-11-13" });

      const todas = await listarOPs(fx.filialAId, { inicio: d("2026-11-13"), fim: d("2026-11-13") });
      const listada = todas.find((o) => o.id === op.id)!;
      expect(listada.fruta.nome).toBe("Açaí");
      expect(listada.resumo.rendimento).toBe(0.6);
      expect(listada.resumo.custo.custoKgPolpa).toBe(3);
      expect(listada.resumo.balanco.status).toBe("OK");
      expect(listada.resumo.branqueamento).toBe("OK");

      const encerradas = await listarOPs(fx.filialAId, {
        inicio: d("2026-11-13"),
        fim: d("2026-11-13"),
        status: "ENCERRADA",
      });
      expect(encerradas.map((o) => o.id)).toContain(op.id);
      expect(encerradas.map((o) => o.id)).not.toContain(aberta.id);
      const deOutraFruta = await listarOPs(fx.filialAId, {
        inicio: d("2026-11-13"),
        fim: d("2026-11-13"),
        frutaId: cat.outraFrutaId,
      });
      expect(deOutraFruta).toHaveLength(0);

      await reabrirOP(adm(), op.id, "Tirar o fino");
      await removerProducao(adm(), fino.id);
      const detalhe = await obterOP(fx.filialAId, op.numero);
      expect(detalhe?.producoes).toHaveLength(1);
      expect(detalhe?.consumos).toHaveLength(1);
      expect(detalhe?.insumos).toHaveLength(1);
      expect(detalhe?.resumo.polpaKg).toBe(40);
      expect(detalhe?.situacaoDesfazer).toEqual({ pode: true });
      expect(await obterOP(fx.filialBId, op.numero)).toBeNull();
    });
  });

  describe("bloqueio da polpa até encerrar (D-07)", () => {
    const vender = (loteId: string, kg = 1) =>
      criarPedido(
        fx.sessao("VENDAS"),
        pedidoVendaSchema.parse({
          data: "2026-11-14",
          clienteId: cad.clienteId,
          formaPagamento: "A_PRAZO",
          vencimento: "2026-12-14",
          retiraNaPropriedade: "true",
          itens: JSON.stringify([{ loteId, quantidadeKg: kg, precoKg: 10 }]),
        }),
      );
    const ajustar = (loteId: string, sentido: "ENTRADA" | "SAIDA" = "SAIDA") =>
      criarAjuste(
        fx.sessao("PRODUCAO"),
        ajusteSchema.parse({ loteId, data: "2026-11-14", sentido, quantidadeKg: "1", motivo: "AVARIA" }),
      );

    /** OP de 14/11 com 10 kg de fruto e duas polpas de 5 kg; branqueamento sem valor (confirmar ao encerrar). */
    async function opComPolpa() {
      const op = await nova({ data: "2026-11-14" });
      const lote = await fruto(10, { data: d("2026-11-14"), validade: d("2026-11-15") });
      await adicionarConsumo(adm(), op.id, consumo(lote.id, 10));
      const polpa = (produtoId: string) =>
        adicionarProducao(
          adm(),
          op.id,
          producaoSchema.parse({ produtoId, quantidadeKg: 5, localId: cat.localCamaraId }),
        );
      return { op, grosso: await polpa(cat.produtoPolpaId), fino: await polpa(cat.produtoPolpaFinoId) };
    }

    test("polpa de OP aberta fica fora da venda e do ajuste; mover é permitido", async () => {
      const { grosso } = await opComPolpa();
      const mensagem = `O lote ${grosso.codigoLote} está numa OP aberta`;

      const paraVenda = await lotesParaVenda(fx.filialAId, d("2026-11-14"));
      expect(paraVenda.map((l) => l.id)).not.toContain(grosso.loteId);
      await expect(vender(grosso.loteId)).rejects.toThrow(mensagem);
      await expect(ajustar(grosso.loteId)).rejects.toThrow(mensagem);

      await moverLote(fx.sessao("PRODUCAO"), grosso.loteId, cat.localRecepcaoId);
      const listados = await listarLotes(fx.filialAId, {}, d("2026-11-14"));
      const listado = listados.find((l) => l.id === grosso.loteId)!;
      expect(listado.emProducao).toBe(true);
      expect(listado.bloqueio).toBe(mensagem);
    });

    test("depois de encerrar, vende", async () => {
      const { op, grosso } = await opComPolpa();
      await encerrarOP(adm(), op.id, { confirmarVerificar: true });

      const paraVenda = await lotesParaVenda(fx.filialAId, d("2026-11-14"));
      expect(paraVenda.map((l) => l.id)).toContain(grosso.loteId);
      await vender(grosso.loteId, 2);
      expect(await saldo(grosso.loteId)).toBe(3);
      const listado = (await listarLotes(fx.filialAId, {}, d("2026-11-14"))).find((l) => l.id === grosso.loteId)!;
      expect(listado.emProducao).toBe(false);
      expect(listado.bloqueio).toBeNull();
    });

    test("linha removida e OP cancelada continuam bloqueadas", async () => {
      const removida = await opComPolpa();
      await removerProducao(adm(), removida.fino.id);
      await encerrarOP(adm(), removida.op.id, { confirmarVerificar: true });
      await expect(ajustar(removida.fino.loteId, "ENTRADA")).rejects.toThrow(
        `O lote ${removida.fino.codigoLote} foi removido da OP`,
      );

      const cancelada = await opComPolpa();
      await cancelarOP(adm(), cancelada.op.id, "Descartada");
      await expect(ajustar(cancelada.grosso.loteId, "ENTRADA")).rejects.toThrow(
        `O lote ${cancelada.grosso.codigoLote} é de uma OP cancelada`,
      );
    });
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

describe("listarOPs: filtro a verificar", () => {
  let fx: FixtureProducao;
  let cat: CatalogoDeTeste;
  const ids = { ok: "", balanco: "", cancelada: "" };

  beforeAll(async () => {
    fx = await criarFixtureProducao("op-verificar");
    cat = await criarCatalogoDeTeste(fx);
    const adm = fx.sessao("ADMINISTRADOR");
    const fruto = await criarLoteDeTeste(fx, {
      produtoId: cat.produtoFrutoOutraId,
      localId: cat.localRecepcaoId,
      kg: 100,
      custoKg: 2,
      data: new Date("2026-11-10"),
      validade: new Date("2027-11-10"),
    });
    const nova = () => criarOP(adm, cabecalhoOPSchema.parse({ data: "2026-11-10", frutaId: cat.outraFrutaId }));
    const consumir = (opId: string, kg: number) =>
      adicionarConsumo(adm, opId, consumoSchema.parse({ loteId: fruto.id, quantidadeKg: kg, motivoLiberacaoVencido: "" }));
    const produzir = (opId: string, kg: number) =>
      adicionarProducao(
        adm,
        opId,
        producaoSchema.parse({ produtoId: cat.produtoPolpaOutraId, quantidadeKg: kg, localId: cat.localCamaraId }),
      );
    const processo = (opId: string, carocoResiduoKg: string) =>
      atualizarProcessoOP(adm, opId, processoOPSchema.parse({ aguaLitros: "0", carocoResiduoKg, perdaKg: "0" }));

    // Cupuaçu não exige branqueamento: só o balanço decide.
    const ok = await nova();
    await consumir(ok.id, 10);
    await produzir(ok.id, 4);
    await processo(ok.id, "6");
    const balanco = await nova();
    await consumir(balanco.id, 10);
    await produzir(balanco.id, 4);
    const cancelada = await nova();
    await consumir(cancelada.id, 10);
    await produzir(cancelada.id, 4);
    await cancelarOP(adm, cancelada.id, "Teste");
    Object.assign(ids, { ok: ok.id, balanco: balanco.id, cancelada: cancelada.id });
  });
  afterAll(async () => {
    await fx.limpar();
  });

  const periodo = { inicio: new Date("2026-11-01"), fim: new Date("2026-11-30") };

  test("balanco: só OP com balanço Verificar e não cancelada", async () => {
    const lista = await listarOPs(fx.filialAId, { ...periodo, verificar: "balanco" });
    expect(lista.map((op) => op.id)).toEqual([ids.balanco]);
  });

  test("branqueamento: nenhuma (cupuaçu não se aplica)", async () => {
    expect(await listarOPs(fx.filialAId, { ...periodo, verificar: "branqueamento" })).toEqual([]);
  });

  test("sem filtro: as três", async () => {
    expect(await listarOPs(fx.filialAId, periodo)).toHaveLength(3);
  });
});
