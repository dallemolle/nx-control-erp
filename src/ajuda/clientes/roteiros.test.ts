import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { valoresAte } from "@/ajuda/roteiro";
import type { Valores } from "@/ajuda/tipos";
import { cnpjCpfSchema } from "@/lib/cnpjCpf";
import { clienteSchema } from "@/lib/schemas/cliente";
import { clientesDoRoteiro } from "./cenas";
import { POLAR, TUCUMA } from "./exemplo";
import { ajudaClientes } from "./index";

const { roteiros, cenas } = ajudaClientes;
const roteiroDe = (id: string) => roteiros.find((r) => r.id === id)!;
const html = (cena: string, valores: Valores) => renderToStaticMarkup(createElement(cenas[cena], { valores }));

describe("roteiros de Clientes", () => {
  test("são os 4 roteiros, com ids únicos", () => {
    expect(roteiros.map((r) => r.id)).toEqual([
      "cadastrar-cliente",
      "cadastrar-sem-documento",
      "editar-cliente",
      "inativar-cliente",
    ]);
  });

  test("o CNPJ digitado é aceito e a lista o mostra como o sistema formata", () => {
    const formatado = cnpjCpfSchema.parse(POLAR.cnpjDigitado);
    const roteiro = roteiroDe("cadastrar-cliente");
    const fim = valoresAte(roteiro, roteiro.passos.length - 1);
    expect(clientesDoRoteiro(fim).find((c) => c.chave === "polar")?.cnpjCpf).toBe(formatado);
    expect(html("lista", fim)).toContain(formatado);
  });

  test("os clientes dos roteiros passam na validação do cadastro", () => {
    expect(clienteSchema.safeParse({ nome: POLAR.nome, cnpjCpf: POLAR.cnpjDigitado }).success).toBe(true);
    expect(clienteSchema.safeParse({ nome: "Clientes diversos", cnpjCpf: "" }).success).toBe(true);
    expect(clienteSchema.safeParse({ nome: "X", meioPagamento: "PIX" }).success).toBe(false);
  });

  test("a lista fica em ordem de nome", () => {
    const nomes = clientesDoRoteiro({ "lista.polar": "sim", "lista.diversos": "sim" }).map((c) => c.nome);
    expect(nomes).toEqual([...nomes].sort((a, b) => a.localeCompare(b, "pt-BR")));
    expect(nomes).toHaveLength(6);
  });

  test("inativar muda o status e o botão vira Reativar", () => {
    const roteiro = roteiroDe("inativar-cliente");
    const antes = clientesDoRoteiro(valoresAte(roteiro, 0)).find((c) => c.nome === TUCUMA)!;
    const depois = clientesDoRoteiro(valoresAte(roteiro, roteiro.passos.length - 1)).find((c) => c.nome === TUCUMA)!;
    expect(antes.ativo).toBe(true);
    expect(depois.ativo).toBe(false);
    expect(html("lista", valoresAte(roteiro, roteiro.passos.length - 1))).toContain("Reativar");
  });

  test("a chave Pix só aparece com o tipo PIX", () => {
    expect(html("editar", {})).not.toContain('data-alvo="form.chave"');
    expect(html("editar", { "form.tipo": "PIX" })).toContain('data-alvo="form.chave"');
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
