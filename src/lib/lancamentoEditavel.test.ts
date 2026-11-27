import { describe, expect, test } from "vitest";
import { formatarMoeda } from "./formatacao";
import {
  foraDaBase,
  juntarOpcoes,
  montarEditaveis,
  opcoesComAtual,
  paraCampoDeData,
  type LancamentoDaLista,
  type OpcoesDoLancamento,
} from "./lancamentoEditavel";

const BANCO = { tipo: "CORRENTE", agencia: "1234", conta: "12345-6", banco: { nome: "Banco do Brasil" } };
const CAIXA = { tipo: "CAIXA", agencia: "0000", conta: "Fazenda", banco: { nome: "—" } };

function lanc(over: Partial<LancamentoDaLista>): LancamentoDaLista {
  return {
    id: "l1", contaBancariaId: "banco", contaBancaria: BANCO, tipo: "SAIDA",
    data: new Date("2026-11-20T00:00:00Z"), valor: "459", descricao: "Tarifa", origem: "MANUAL",
    transferenciaId: null, grupoConciliacaoId: null, categoriaFinanceiraId: "cat", centroCustoId: null,
    centroLucroId: null, safraId: null, projetoId: null, classificacaoFiscal: "FISCAL",
    tipoComprovante: null, numeroComprovante: null, ...over,
  };
}

describe("montarEditaveis", () => {
  test("lançamento manual vira editável com data do campo e valor com duas casas", () => {
    const r = montarEditaveis([lanc({})]);
    expect(r.l1).toMatchObject({
      tipo: "manual", data: "2026-11-20", valor: "459.00", ligadoAoExtrato: false,
      contaNome: "Banco do Brasil - Ag 1234/CC 12345-6", resumo: `20/11/2026 · Banco do Brasil - Ag 1234/CC 12345-6 · ${formatarMoeda(459)}`,
    });
  });

  test("baixa não é editável", () => {
    expect(montarEditaveis([lanc({ origem: "BAIXA" })]).l1).toBeUndefined();
  });

  test("os dois lados da transferência apontam para a mesma transferência", () => {
    const r = montarEditaveis([
      lanc({ id: "s", origem: "TRANSFERENCIA", transferenciaId: "t1", tipo: "SAIDA", valor: "2000", classificacaoFiscal: null }),
      lanc({ id: "e", origem: "TRANSFERENCIA", transferenciaId: "t1", tipo: "ENTRADA", valor: "2000",
        contaBancariaId: "caixa", contaBancaria: CAIXA, grupoConciliacaoId: null, classificacaoFiscal: null }),
    ]);
    expect(r.s).toEqual(r.e);
    expect(r.s).toMatchObject({
      tipo: "transferencia", idParaExcluir: "s", contaOrigemId: "banco", contaDestinoId: "caixa",
      contaDestinoNome: "Caixa · Fazenda", ladoConciliado: null, valor: "2000.00",
    });
  });

  test("transferência com um lado conciliado diz qual", () => {
    const r = montarEditaveis([
      lanc({ id: "s", origem: "TRANSFERENCIA", transferenciaId: "t1", tipo: "SAIDA", grupoConciliacaoId: "g" }),
      lanc({ id: "e", origem: "TRANSFERENCIA", transferenciaId: "t1", tipo: "ENTRADA", contaBancariaId: "caixa", contaBancaria: CAIXA }),
    ]);
    expect(r.e).toMatchObject({ ladoConciliado: "Banco do Brasil - Ag 1234/CC 12345-6" });
  });

  test("transferência com um lado só na lista fica sem ações", () => {
    expect(montarEditaveis([lanc({ origem: "TRANSFERENCIA", transferenciaId: "t1" })]).l1).toBeUndefined();
  });
});

describe("opcoesComAtual", () => {
  test("acrescenta o cadastro gravado que não está entre os ativos", () => {
    expect(opcoesComAtual([{ id: "a", nome: "A" }], { id: "x", nome: "Inativa" })).toEqual([
      { id: "a", nome: "A" },
      { id: "x", nome: "Inativa" },
    ]);
  });
  test("não duplica e aceita nulo", () => {
    expect(opcoesComAtual([{ id: "a", nome: "A" }], { id: "a", nome: "A" })).toHaveLength(1);
    expect(opcoesComAtual([{ id: "a", nome: "A" }], null)).toHaveLength(1);
  });
});

describe("listas do diálogo enviadas uma vez", () => {
  const BASE: OpcoesDoLancamento = {
    contasBancarias: [{ id: "banco", nome: "Banco" }],
    categorias: [{ id: "a", nome: "A" }],
    centrosCusto: [],
    centrosLucro: [],
    safras: [],
    projetos: [],
  };

  test("foraDaBase devolve só o cadastro gravado que não está entre os ativos, sem repetir", () => {
    const inativa = { id: "x", nome: "Inativa" };
    expect(foraDaBase(BASE.categorias, [inativa, null, { id: "a", nome: "A" }, inativa])).toEqual([inativa]);
    expect(foraDaBase(BASE.categorias, [null])).toEqual([]);
  });

  test("juntarOpcoes acrescenta os extras da linha às listas da página", () => {
    const juntas = juntarOpcoes(BASE, { categorias: [{ id: "x", nome: "Inativa" }] });
    expect(juntas.categorias).toEqual([
      { id: "a", nome: "A" },
      { id: "x", nome: "Inativa" },
    ]);
    expect(juntas.contasBancarias).toEqual(BASE.contasBancarias);
  });

  test("o lado da transferência que ficou em outra página completa o par", () => {
    const naPagina = lanc({ id: "s", origem: "TRANSFERENCIA", transferenciaId: "t1", tipo: "SAIDA" });
    const deFora = lanc({ id: "e", origem: "TRANSFERENCIA", transferenciaId: "t1", tipo: "ENTRADA", contaBancariaId: "caixa", contaBancaria: CAIXA });
    expect(montarEditaveis([naPagina, deFora]).s).toMatchObject({ tipo: "transferencia", contaDestinoId: "caixa" });
  });
});

test("paraCampoDeData usa o dia em UTC", () => {
  expect(paraCampoDeData(new Date("2026-11-20T00:00:00Z"))).toBe("2026-11-20");
});
