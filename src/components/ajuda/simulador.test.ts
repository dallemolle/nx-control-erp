import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { DefinicaoAjuda, PropsCena, Roteiro } from "@/ajuda/tipos";
import { Alvo, CampoSimulado } from "./campos-simulados";
import { Simulador } from "./simulador";

function CenaTeste({ valores }: PropsCena) {
  return createElement(
    "div",
    null,
    createElement(CampoSimulado, { alvo: "nome", rotulo: "Nome", valor: valores.nome }),
    createElement(Alvo, { nome: "salvar" } as ComponentProps<typeof Alvo>, "Salvar"),
  );
}

const ROTEIRO: Roteiro = {
  id: "teste",
  titulo: "Teste",
  quandoUsar: "Para testar.",
  passos: [
    { cena: "cena", alvo: "nome", instrucao: "Digite o nome", explicacao: "Explicação.", preenche: { nome: "Ana" } },
    { cena: "cena", alvo: "salvar", instrucao: "Clique em Salvar", explicacao: "" },
  ],
  eDepois: { texto: "Pronto." },
};

const DEFINICAO: DefinicaoAjuda = {
  tituloTela: "Teste",
  resumo: "",
  cenas: { cena: CenaTeste },
  roteiros: [ROTEIRO],
};

describe("Simulador", () => {
  const html = renderToStaticMarkup(
    createElement(Simulador, { definicao: DEFINICAO, roteiro: ROTEIRO, aoAbrirRoteiro: () => {} }),
  );

  test("começa no primeiro passo, com o texto e o progresso", () => {
    expect(html).toContain("Digite o nome");
    expect(html).toContain("1 de 2");
  });

  test("destaca só o alvo do passo atual", () => {
    expect(html).toMatch(/data-alvo="nome" data-destacado="true"/);
    expect(html).not.toMatch(/data-alvo="salvar" data-destacado="true"/);
  });

  test("o primeiro passo já mostra o valor que ele preenche", () => {
    expect(html).toContain("Ana");
  });

  test("a cena é decorativa para leitor de tela", () => {
    expect(html).toMatch(/<div (?=[^>]*aria-hidden="true")(?=[^>]*inert)/);
  });
});
