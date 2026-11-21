import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { valoresAte } from "@/ajuda/roteiro";
import type { Valores } from "@/ajuda/tipos";
import { cnpjCpfSchema } from "@/lib/cnpjCpf";
import { fornecedorSchema } from "@/lib/schemas/fornecedor";
import { fornecedoresDoRoteiro } from "./cenas";
import { EMBALAGENS, RAIMUNDO, SITIO } from "./exemplo";
import { ajudaFornecedores } from "./index";

const { roteiros, cenas } = ajudaFornecedores;
const roteiroDe = (id: string) => roteiros.find((r) => r.id === id)!;
const html = (cena: string, valores: Valores) => renderToStaticMarkup(createElement(cenas[cena], { valores }));
const fim = (id: string) => valoresAte(roteiroDe(id), roteiroDe(id).passos.length - 1);

describe("roteiros de Fornecedores", () => {
  test("são os 3 roteiros, com ids únicos", () => {
    expect(roteiros.map((r) => r.id)).toEqual(["cadastrar-fornecedor", "cadastrar-produtor", "inativar-fornecedor"]);
  });

  test("os documentos digitados são aceitos e a lista os mostra como o sistema formata", () => {
    const cnpj = cnpjCpfSchema.parse(EMBALAGENS.cnpjDigitado);
    const cpf = cnpjCpfSchema.parse(RAIMUNDO.cpfDigitado);
    expect(html("lista", fim("cadastrar-fornecedor"))).toContain(cnpj);
    const lista = fornecedoresDoRoteiro(fim("cadastrar-produtor"));
    expect(lista.find((f) => f.chave === "raimundo")?.cnpjCpf).toBe(cpf);
  });

  test("os fornecedores dos roteiros passam na validação do cadastro", () => {
    expect(
      fornecedorSchema.safeParse({
        nome: EMBALAGENS.nome,
        cnpjCpf: EMBALAGENS.cnpjDigitado,
        meioPagamento: "DEPOSITO_BANCARIO",
        bancoId: "banco-001",
        agencia: EMBALAGENS.agencia,
        conta: EMBALAGENS.conta,
        tipoContaTerceiro: "CORRENTE",
        classificacaoFiscalPadrao: "FISCAL",
      }).success,
    ).toBe(true);
    expect(
      fornecedorSchema.safeParse({
        nome: RAIMUNDO.nome,
        cnpjCpf: RAIMUNDO.cpfDigitado,
        meioPagamento: "PIX",
        tipoChavePix: "CPF_CNPJ",
        chavePix: RAIMUNDO.cpfDigitado,
        classificacaoFiscalPadrao: "GERENCIAL",
      }).success,
    ).toBe(true);
    // No fornecedor o documento é obrigatório.
    expect(fornecedorSchema.safeParse({ nome: RAIMUNDO.nome, cnpjCpf: "" }).success).toBe(false);
  });

  test("a lista fica em ordem de nome", () => {
    const nomes = fornecedoresDoRoteiro({ "lista.embalagens": "sim", "lista.raimundo": "sim" }).map((f) => f.nome);
    expect(nomes).toEqual([...nomes].sort((a, b) => a.localeCompare(b, "pt-BR")));
    expect(nomes).toHaveLength(7);
  });

  test("inativar muda o status e o botão vira Reativar", () => {
    const roteiro = roteiroDe("inativar-fornecedor");
    expect(fornecedoresDoRoteiro(valoresAte(roteiro, 0)).find((f) => f.nome === SITIO)?.ativo).toBe(true);
    expect(fornecedoresDoRoteiro(fim("inativar-fornecedor")).find((f) => f.nome === SITIO)?.ativo).toBe(false);
    expect(html("lista", fim("inativar-fornecedor"))).toContain("Reativar");
  });

  test("os campos bancários seguem o tipo escolhido", () => {
    expect(html("novo", {})).not.toContain('data-alvo="form.chave"');
    expect(html("novo", {})).not.toContain('data-alvo="form.banco"');
    expect(html("novo", { "form.tipo": "PIX" })).toContain('data-alvo="form.chave"');
    expect(html("novo", { "form.tipo": "Depósito bancário" })).toContain('data-alvo="form.banco"');
  });

  test.each(roteiros.map((r) => [r.id, r] as const))("%s tem conteúdo completo", (_id, roteiro) => {
    expect(roteiro.passos.length).toBeGreaterThan(0);
    expect(roteiro.quandoUsar.trim()).not.toBe("");
    expect(roteiro.eDepois.texto.trim()).not.toBe("");
    if (roteiro.eDepois.proximoRoteiro) {
      expect(roteiros.some((r) => r.id === roteiro.eDepois.proximoRoteiro)).toBe(true);
    }
    for (const passo of roteiro.passos) {
      expect(passo.instrucao.trim()).not.toBe("");
      expect(cenas[passo.cena]).toBeDefined();
    }
  });

  test.each(roteiros.map((r) => [r.id, r] as const))("%s: o alvo de cada passo aparece na cena", (_id, roteiro) => {
    roteiro.passos.forEach((passo, indice) => {
      const markup = renderToStaticMarkup(createElement(cenas[passo.cena], { valores: valoresAte(roteiro, indice) }));
      expect(markup, `passo ${indice + 1} (${passo.alvo})`).toContain(`data-alvo="${passo.alvo}"`);
    });
  });
});
