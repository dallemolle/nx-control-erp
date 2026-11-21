import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { valoresAte } from "@/ajuda/roteiro";
import { cnpjCpfSchema } from "@/lib/cnpjCpf";
import { empresaSchema } from "@/lib/schemas/empresa";
import { CONTRASTE_MINIMO, contraste } from "@/lib/tema/contraste";
import { TAMANHO_MAXIMO_LOGO_BYTES } from "@/server/services/empresa";
import { CNPJ_MATRIZ } from "@/ajuda/usuarios/exemplo";
import { contrasteDaPrimaria, empresasDoRoteiro } from "./cenas";
import { BOA_VISTA, DEMONSTRACAO, LIMITE_IMAGEM_MB, RIO_PARA, TEMA } from "./exemplo";
import { ajudaEmpresas } from "./index";

const { roteiros, cenas } = ajudaEmpresas;
const roteiroDe = (id: string) => roteiros.find((r) => r.id === id)!;
const fim = (id: string) => valoresAte(roteiroDe(id), roteiroDe(id).passos.length - 1);

describe("roteiros de Empresas", () => {
  test("são os 3 roteiros, encadeados", () => {
    expect(roteiros.map((r) => r.id)).toEqual(["cadastrar-empresa", "editar-inativar-empresa", "tema-marca"]);
    for (const r of roteiros) {
      expect(r.quandoUsar.trim()).not.toBe("");
      if (r.eDepois.proximoRoteiro) expect(roteiros.some((o) => o.id === r.eDepois.proximoRoteiro)).toBe(true);
    }
  });

  test.each(roteiros.map((r) => [r.id, r] as const))("%s: o alvo de cada passo aparece na cena", (_id, roteiro) => {
    roteiro.passos.forEach((passo, indice) => {
      const markup = renderToStaticMarkup(createElement(cenas[passo.cena], { valores: valoresAte(roteiro, indice) }));
      expect(markup, `passo ${indice + 1} (${passo.alvo})`).toContain(`data-alvo="${passo.alvo}"`);
    });
  });
});

describe("o exemplo bate com o sistema e com as outras ajudas", () => {
  test("a Empresa Demonstração tem o CNPJ da Matriz da ajuda de Usuários", () => {
    expect(DEMONSTRACAO.cnpjCpf).toBe(CNPJ_MATRIZ);
  });

  test("a empresa nova passa na validação, e o CNPJ digitado vira o formatado da lista", () => {
    const dados = {
      razaoSocial: BOA_VISTA.razaoSocial,
      nomeFantasia: BOA_VISTA.nomeFantasia,
      cnpjCpf: BOA_VISTA.cnpjDigitado,
      moedaPadrao: BOA_VISTA.moeda,
      corPrimaria: "",
      exigirAprovacaoPorOutro: "true",
    };
    expect(empresaSchema.safeParse(dados).success).toBe(true);
    expect(cnpjCpfSchema.parse(BOA_VISTA.cnpjDigitado)).toBe(BOA_VISTA.cnpjCpf);
  });

  test("os roteiros deixam a lista como contam, em ordem de razão social", () => {
    const lista = empresasDoRoteiro(fim("editar-inativar-empresa"));
    const razoes = lista.map((e) => e.razaoSocial);
    expect(razoes).toEqual([...razoes].sort((a, b) => a.localeCompare(b, "pt-BR")));
    expect(lista.find((e) => e.chave === BOA_VISTA.chave)?.exigirAprovacaoPorOutro).toBe(false);
    expect(lista.find((e) => e.chave === RIO_PARA.chave)?.ativa).toBe(false);
    expect(lista.find((e) => e.chave === DEMONSTRACAO.chave)?.ativa).toBe(true);
  });

  test("o lilás reprova e o roxo passa no contraste real do editor", () => {
    expect(contraste(TEMA.textoSobrePrimaria, TEMA.primariaReprovada)).toBeLessThan(CONTRASTE_MINIMO);
    expect(contraste(TEMA.textoSobrePrimaria, TEMA.primaria)).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
    expect(contraste(TEMA.texto, TEMA.fundo)).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
    expect(contraste(TEMA.textoSobreSidebar, TEMA.sidebar)).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
    expect(CONTRASTE_MINIMO).toBe(4.5);

    const roteiro = roteiroDe("tema-marca");
    const noResumo = roteiro.passos.findIndex((p) => p.alvo === "tema.resumo");
    expect(contrasteDaPrimaria(valoresAte(roteiro, noResumo)).ok).toBe(false);
    expect(contrasteDaPrimaria(fim("tema-marca")).ok).toBe(true);
  });

  test("o limite das imagens é o do serviço", () => {
    expect(TAMANHO_MAXIMO_LOGO_BYTES).toBe(LIMITE_IMAGEM_MB * 1024 * 1024);
  });
});
