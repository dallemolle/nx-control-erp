import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  diagnostico,
  estadoInicial,
  nomeArquivoTema,
  pilhaDaFonte,
  reduzirEditor,
  temaInicial,
  temasIguais,
  tipoDaPilha,
  urlFontesDaPrevia,
  valorEfetivo,
  type AcaoEditor,
  type EstadoEditor,
} from "./editor";
import { TEMA_PADRAO } from "./padrao";
import { temaSchema, type Tema } from "./schema";
import { validarTema } from "./validar";

const hortitex = (): Tema => temaSchema.parse(JSON.parse(readFileSync("public/temas/hortitex.json", "utf8")));
const aplicar = (estado: EstadoEditor, ...acoes: AcaoEditor[]) => acoes.reduce(reduzirEditor, estado);

describe("temaInicial", () => {
  test("usa o tema salvo válido", () => {
    expect(temaInicial(hortitex(), "X")).toEqual({ tema: hortitex(), aviso: null });
  });

  test("sem tema: padrão do sistema com o nome da empresa", () => {
    const { tema, aviso } = temaInicial(null, "Hortitex");
    expect(aviso).toBeNull();
    expect(tema.nome).toBe("Hortitex");
    expect(tema.cores).toEqual(TEMA_PADRAO.cores);
  });

  test("tema salvo inválido: padrão com aviso", () => {
    const { tema, aviso } = temaInicial({ formato: "outro" }, "X");
    expect(tema.cores).toEqual(TEMA_PADRAO.cores);
    expect(aviso).toContain("não passa mais na validação");
  });
});

describe("reduzirEditor", () => {
  const inicial = () => estadoInicial(hortitex());

  test("cor: normaliza para minúsculas e não muta o estado anterior", () => {
    const antes = inicial();
    const depois = reduzirEditor(antes, { tipo: "cor", papel: "primaria", valor: "#ABCDEF" });
    expect(depois.tema.cores.claro.primaria).toBe("#abcdef");
    expect(antes.tema.cores.claro.primaria).toBe(hortitex().cores.claro.primaria);
  });

  test("cor no modo escuro edita o escuro", () => {
    const e = aplicar(inicial(), { tipo: "modo", modo: "escuro" }, { tipo: "cor", papel: "fundo", valor: "#000000" });
    expect(e.tema.cores.escuro?.fundo).toBe("#000000");
    expect(e.tema.cores.claro.fundo).toBe(hortitex().cores.claro.fundo);
  });

  test("undefined remove papel opcional e ignora obrigatório", () => {
    const e = aplicar(inicial(), { tipo: "cor", papel: "cartao", valor: undefined });
    expect("cartao" in e.tema.cores.claro).toBe(false);
    const f = aplicar(inicial(), { tipo: "cor", papel: "fundo", valor: undefined });
    expect(f.tema.cores.claro.fundo).toBe(hortitex().cores.claro.fundo);
  });

  test("valor que não é #RRGGBB é ignorado", () => {
    const e = aplicar(inicial(), { tipo: "cor", papel: "primaria", valor: "#abc" });
    expect(e.tema.cores.claro.primaria).toBe(hortitex().cores.claro.primaria);
  });

  test("gráficos: cor individual e automático", () => {
    const sem = aplicar(inicial(), { tipo: "graficosAutomaticos", ligado: true });
    expect(sem.tema.cores.claro.graficos).toBeUndefined();
    const com = aplicar(sem, { tipo: "graficosAutomaticos", ligado: false }, { tipo: "grafico", indice: 2, valor: "#112233" });
    expect(com.tema.cores.claro.graficos).toHaveLength(5);
    expect(com.tema.cores.claro.graficos?.[2]).toBe("#112233");
  });

  test("modo escuro: desligar remove e volta para o claro; ligar copia o padrão", () => {
    const desligado = aplicar(inicial(), { tipo: "modo", modo: "escuro" }, { tipo: "modoEscuro", ligado: false });
    expect(desligado.tema.cores.escuro).toBeUndefined();
    expect(desligado.modo).toBe("claro");
    const ligado = aplicar(desligado, { tipo: "modoEscuro", ligado: true });
    expect(ligado.tema.cores.escuro).toEqual(TEMA_PADRAO.cores.escuro);
  });

  test("modo escuro sem escuro no tema é ignorado", () => {
    const e = aplicar(inicial(), { tipo: "modoEscuro", ligado: false }, { tipo: "modo", modo: "escuro" });
    expect(e.modo).toBe("claro");
  });

  test("fonte e raio: definir e remover", () => {
    const fonte = { pilha: pilhaDaFonte("Lato", "sans"), google: ["Lato"] };
    const e = aplicar(inicial(), { tipo: "fonte", grupo: "texto", fonte }, { tipo: "raio", px: 8 });
    expect(e.tema.fontes?.texto).toEqual(fonte);
    expect(e.tema.raio).toBe("8px");
    const sem = aplicar(
      estadoInicial(TEMA_PADRAO),
      { tipo: "fonte", grupo: "texto", fonte },
      { tipo: "fonte", grupo: "texto", fonte: undefined },
      { tipo: "raio", px: undefined },
    );
    expect(sem.tema.fontes).toBeUndefined();
    expect(sem.tema.raio).toBeUndefined();
  });

  test("carregar troca o tema e mantém o salvo; descartar volta; salvo/restaurado atualizam a referência", () => {
    const carregado = aplicar(estadoInicial(TEMA_PADRAO), { tipo: "carregar", tema: hortitex() });
    expect(carregado.tema).toEqual(hortitex());
    expect(carregado.salvo).toEqual(TEMA_PADRAO);
    expect(aplicar(carregado, { tipo: "descartar" }).tema).toEqual(TEMA_PADRAO);
    expect(aplicar(carregado, { tipo: "salvo", tema: hortitex() }).salvo).toEqual(hortitex());
    const restaurado = aplicar(carregado, { tipo: "restaurado", tema: TEMA_PADRAO });
    expect(restaurado.tema).toEqual(TEMA_PADRAO);
    expect(restaurado.salvo).toEqual(TEMA_PADRAO);
  });

  test("salvo grava o tema enviado, não o que está no editor quando a resposta volta", () => {
    const a = hortitex();
    const carregado = aplicar(estadoInicial(TEMA_PADRAO), { tipo: "carregar", tema: a });
    const editado = aplicar(carregado, { tipo: "cor", papel: "fundo", valor: "#123456" });
    const depois = aplicar(editado, { tipo: "salvo", tema: a });
    expect(depois.salvo).toEqual(a);
    expect(depois.tema).toEqual(editado.tema);
    expect(temasIguais(depois.tema, depois.salvo)).toBe(false);
  });
});

describe("auxiliares", () => {
  test("pilhaDaFonte gera pilha válida no schema e tipoDaPilha reconhece", () => {
    for (const tipo of ["sans", "serif"] as const) {
      const pilha = pilhaDaFonte("Open Sans", tipo);
      const tema = { ...TEMA_PADRAO, fontes: { texto: { pilha, google: ["Open Sans"] } } };
      expect(validarTema(tema).ok).toBe(true);
      expect(tipoDaPilha(pilha)).toBe(tipo);
    }
  });

  test("valorEfetivo mostra a herança (cartão → fundo) e cai num cinza se o padrão não for #RRGGBB", () => {
    const claro = structuredClone(hortitex().cores.claro);
    delete claro.cartao;
    delete claro.borda;
    const tema = { ...hortitex(), cores: { ...hortitex().cores, claro } };
    expect(valorEfetivo(tema, "claro", "cartao")).toBe(claro.fundo);
    expect(valorEfetivo(tema, "claro", "borda")).toMatch(/^#[0-9a-f]{6}$/);
  });

  test("diagnostico: erros e avisos ao mesmo tempo", () => {
    const tema = structuredClone(hortitex());
    tema.cores.claro.textoSobrePrimaria = tema.cores.claro.primaria;
    tema.cores.claro.textoApagado = "#d8d0c0";
    const d = diagnostico(tema);
    expect(d.erros.join()).toContain("textoSobrePrimaria");
    expect(d.avisos.join()).toContain("textoApagado");
    expect(diagnostico(hortitex())).toEqual({ erros: [], avisos: [] });
  });

  test("temasIguais ignora a ordem das chaves", () => {
    const a = hortitex();
    const { fundo, ...resto } = a.cores.claro;
    const b = { ...a, cores: { ...a.cores, claro: { ...resto, fundo } } };
    expect(temasIguais(a, b)).toBe(true);
    expect(temasIguais(a, { ...a, nome: "Outro" })).toBe(false);
  });

  test("urlFontesDaPrevia ignora nomes inválidos", () => {
    const tema = { ...TEMA_PADRAO, fontes: { texto: { pilha: "Lato, sans-serif", google: ["Lat;o"] } } };
    expect(urlFontesDaPrevia(tema)).toBeNull();
    expect(urlFontesDaPrevia(hortitex())).toContain("family=Carlito");
  });

  test("nomeArquivoTema tira acentos e espaços", () => {
    expect(nomeArquivoTema("Hortitex Hortaliças")).toBe("tema-hortitex-hortalicas.json");
    expect(nomeArquivoTema("***")).toBe("tema-empresa.json");
  });
});
