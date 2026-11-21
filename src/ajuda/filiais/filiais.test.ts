import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { valoresAte } from "@/ajuda/roteiro";
import { cnpjCpfSchema } from "@/lib/cnpjCpf";
import { filialSchema } from "@/lib/schemas/filial";
import { CNPJ_MATRIZ, OUTRA_FILIAL } from "@/ajuda/usuarios/exemplo";
import { ajudaFiliais, CAMETA, filiaisDoRoteiro, IGARAPE, MATRIZ } from "./index";

const [roteiro] = ajudaFiliais.roteiros;

describe("ajuda de Filiais", () => {
  test("tem o roteiro de cadastrar, com o alvo de cada passo na cena", () => {
    expect(ajudaFiliais.roteiros.map((r) => r.id)).toEqual(["cadastrar-filial"]);
    roteiro.passos.forEach((passo, indice) => {
      const markup = renderToStaticMarkup(
        createElement(ajudaFiliais.cenas[passo.cena], { valores: valoresAte(roteiro, indice) }),
      );
      expect(markup, `passo ${indice + 1} (${passo.alvo})`).toContain(`data-alvo="${passo.alvo}"`);
    });
  });

  test("as filiais são as da ajuda de Usuários, e a nova passa na validação", () => {
    expect(IGARAPE.nome).toBe(OUTRA_FILIAL);
    expect(MATRIZ.cnpjCpf).toBe(CNPJ_MATRIZ);
    expect(filialSchema.safeParse({ nome: IGARAPE.nome, cnpjCpf: IGARAPE.cnpjDigitado }).success).toBe(true);
    expect(cnpjCpfSchema.parse(IGARAPE.cnpjDigitado)).toBe(IGARAPE.cnpjCpf);
    expect(new Set([MATRIZ.cnpjCpf, CAMETA.cnpjCpf, IGARAPE.cnpjCpf]).size).toBe(3);
  });

  test("no fim, a lista tem as três em ordem de nome, Cametá inativa", () => {
    const lista = filiaisDoRoteiro(valoresAte(roteiro, roteiro.passos.length - 1));
    expect(lista.map((f) => f.nome)).toEqual([OUTRA_FILIAL, "Matriz", CAMETA.nome]);
    expect(lista.find((f) => f.chave === "cameta")?.ativa).toBe(false);
  });
});
