import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { ColunaExport } from "./csv";

export type CabecalhoPdf = {
  titulo: string;
  /** Linhas de contexto abaixo do título (empresa/filial, filtros, quem gerou). */
  linhas: string[];
};

// A4 em paisagem (pontos tipográficos).
const LARGURA_PAGINA = 841.89;
const ALTURA_PAGINA = 595.28;
const MARGEM = 32;
const LARGURA_UTIL = LARGURA_PAGINA - 2 * MARGEM;

const TAMANHO_TITULO = 13;
const TAMANHO_CONTEXTO = 8;
const TAMANHO_TABELA = 7.5;
const TAMANHO_RODAPE = 7;
const ENTRELINHA = TAMANHO_TABELA * 1.3;
const RESPIRO_X = 3;
const RESPIRO_Y = 3;
const LARGURA_MINIMA_COLUNA = 32;
/** Texto muito longo (ex.: JSON da auditoria) é cortado com "…" para a linha não ocupar a página toda. */
const MAX_LINHAS_POR_CELULA = 6;
const ALTURA_RODAPE = 18;

const COR_TEXTO = rgb(0.1, 0.1, 0.12);
const COR_SECUNDARIA = rgb(0.4, 0.4, 0.45);
const COR_FUNDO_CABECALHO = rgb(0.9, 0.91, 0.93);
const COR_ZEBRA = rgb(0.97, 0.97, 0.98);
const COR_LINHA = rgb(0.82, 0.83, 0.86);

const MOEDA = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PERCENTUAL = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function formatarValorPdf<T>(coluna: ColunaExport<T>, valor: string | number | Date): string {
  if (valor instanceof Date) return valor.toLocaleDateString("pt-BR", { timeZone: "UTC" });
  if (typeof valor === "number") {
    if (coluna.tipo === "inteiro") return String(valor);
    if (coluna.tipo === "percentual") return `${PERCENTUAL.format(valor)}%`;
    return MOEDA.format(valor);
  }
  return valor;
}

/**
 * As fontes padrão do PDF (Helvetica) só codificam WinAnsi (Latin-1 + alguns
 * símbolos). Acentos do português cabem; o resto (setas, emoji…) vira "?" em
 * vez de derrubar a geração do arquivo. Quebras de linha viram espaço — a
 * quebra dentro da célula é feita pelo layout.
 */
function criarSanitizador(fonte: PDFFont): (texto: string) => string {
  const suportados = new Set(fonte.getCharacterSet());
  return (texto) =>
    Array.from(texto.replace(/\s+/g, " "))
      .map((caractere) => (suportados.has(caractere.codePointAt(0)!) ? caractere : "?"))
      .join("")
      .trim();
}

function quebrarEmLinhas(texto: string, fonte: PDFFont, tamanho: number, largura: number, maxLinhas: number): string[] {
  if (texto === "") return [""];
  const medir = (trecho: string) => fonte.widthOfTextAtSize(trecho, tamanho);

  const linhas: string[] = [];
  let atual = "";
  const fecharLinha = () => {
    linhas.push(atual);
    atual = "";
  };

  // Maior prefixo de `trecho` que cabe na largura (busca binária; ao menos 1 caractere).
  const maiorPrefixoQueCabe = (trecho: string) => {
    let menor = 1;
    let maior = trecho.length;
    while (menor < maior) {
      const meio = Math.ceil((menor + maior) / 2);
      if (medir(trecho.slice(0, meio)) <= largura) menor = meio;
      else maior = meio - 1;
    }
    return menor;
  };

  // Para de quebrar assim que passa do limite — o excedente é cortado com "…" logo abaixo.
  for (const palavra of texto.split(" ")) {
    if (linhas.length > maxLinhas) break;
    const candidata = atual === "" ? palavra : `${atual} ${palavra}`;
    if (medir(candidata) <= largura) {
      atual = candidata;
      continue;
    }
    if (atual !== "") fecharLinha();
    // Palavra maior que a coluna (ex.: chave de acesso, JSON): quebra por caractere.
    let resto = palavra;
    while (medir(resto) > largura && linhas.length <= maxLinhas) {
      const corte = maiorPrefixoQueCabe(resto);
      linhas.push(resto.slice(0, corte));
      resto = resto.slice(corte);
    }
    atual = resto;
  }
  if (atual !== "") fecharLinha();

  if (linhas.length <= maxLinhas) return linhas;
  const cortadas = linhas.slice(0, maxLinhas);
  let ultima = cortadas[maxLinhas - 1];
  while (ultima.length > 0 && medir(`${ultima}…`) > largura) ultima = ultima.slice(0, -1);
  cortadas[maxLinhas - 1] = `${ultima}…`;
  return cortadas;
}

/**
 * Largura de cada coluna: a largura "natural" (maior conteúdo) quando tudo
 * cabe; senão, as colunas estreitas ficam com a natural e as largas dividem o
 * espaço restante em partes iguais (o texto delas quebra em várias linhas).
 */
export function calcularLargurasColunas(naturais: number[], disponivel: number): number[] {
  const total = naturais.reduce((soma, largura) => soma + largura, 0);
  if (total <= disponivel) {
    const sobra = (disponivel - total) / naturais.length;
    return naturais.map((largura) => largura + sobra);
  }

  const larguras = new Array<number>(naturais.length).fill(0);
  let pendentes = naturais.map((largura, indice) => ({ largura, indice }));
  let restante = disponivel;
  for (;;) {
    const fatia = restante / pendentes.length;
    const cabem = pendentes.filter((coluna) => coluna.largura <= fatia);
    if (cabem.length === 0) {
      for (const coluna of pendentes) larguras[coluna.indice] = Math.max(fatia, LARGURA_MINIMA_COLUNA);
      return larguras;
    }
    for (const coluna of cabem) {
      larguras[coluna.indice] = coluna.largura;
      restante -= coluna.largura;
    }
    pendentes = pendentes.filter((coluna) => coluna.largura > fatia);
    if (pendentes.length === 0) return larguras;
  }
}

function dataHoraBrasilia(data: Date): string {
  return data.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Tabela simples em A4 paisagem: título e contexto na 1ª página, cabeçalho das
 * colunas repetido em toda página, zebra nas linhas, números alinhados à
 * direita e rodapé "Página X de Y". Usa as mesmas `ColunaExport` do CSV/Excel.
 */
export async function gerarPdf<T>(
  linhas: T[],
  colunas: ColunaExport<T>[],
  cabecalho: CabecalhoPdf,
  agora: Date = new Date(),
): Promise<Uint8Array> {
  const documento = await PDFDocument.create();
  documento.setTitle(cabecalho.titulo);
  documento.setCreator("NX Control ERP");
  documento.setProducer("NX Control ERP");
  documento.setCreationDate(agora);

  const fonte = await documento.embedFont(StandardFonts.Helvetica);
  const negrito = await documento.embedFont(StandardFonts.HelveticaBold);
  const limpar = criarSanitizador(fonte);

  const rotulos = colunas.map((coluna) => limpar(coluna.rotulo));
  const celulas = linhas.map((linha) =>
    colunas.map((coluna) => {
      const valor = coluna.valor(linha);
      return { texto: limpar(formatarValorPdf(coluna, valor)), numerico: typeof valor === "number" };
    }),
  );

  const naturais = colunas.map((_, indice) => {
    const maiorPalavraRotulo = Math.max(...rotulos[indice].split(" ").map((p) => negrito.widthOfTextAtSize(p, TAMANHO_TABELA)));
    const maiorCelula = celulas.reduce(
      (maior, linha) => Math.max(maior, fonte.widthOfTextAtSize(linha[indice].texto, TAMANHO_TABELA)),
      0,
    );
    return Math.max(maiorPalavraRotulo, maiorCelula, LARGURA_MINIMA_COLUNA - 2 * RESPIRO_X) + 2 * RESPIRO_X;
  });
  const larguras = calcularLargurasColunas(naturais, LARGURA_UTIL);
  // Coluna de números: o título acompanha o alinhamento à direita dos valores.
  const colunaNumerica = colunas.map((_, indice) => celulas.some((linha) => linha[indice].numerico));
  const larguraTexto = (indice: number) => larguras[indice] - 2 * RESPIRO_X;

  const paginas: PDFPage[] = [];
  let pagina!: PDFPage;
  let y = 0;

  const linhasRotulo = rotulos.map((rotulo, indice) =>
    quebrarEmLinhas(rotulo, negrito, TAMANHO_TABELA, larguraTexto(indice), 3),
  );
  const alturaCabecalhoTabela = Math.max(...linhasRotulo.map((l) => l.length)) * ENTRELINHA + 2 * RESPIRO_Y;

  const desenharCabecalhoTabela = () => {
    pagina.drawRectangle({ x: MARGEM, y: y - alturaCabecalhoTabela, width: LARGURA_UTIL, height: alturaCabecalhoTabela, color: COR_FUNDO_CABECALHO });
    let x = MARGEM;
    linhasRotulo.forEach((linhasDaCelula, indice) => {
      linhasDaCelula.forEach((texto, n) => {
        const xTexto = colunaNumerica[indice]
          ? x + larguras[indice] - RESPIRO_X - negrito.widthOfTextAtSize(texto, TAMANHO_TABELA)
          : x + RESPIRO_X;
        pagina.drawText(texto, { x: xTexto, y: y - RESPIRO_Y - (n + 1) * ENTRELINHA + 2, size: TAMANHO_TABELA, font: negrito, color: COR_TEXTO });
      });
      x += larguras[indice];
    });
    y -= alturaCabecalhoTabela;
  };

  const novaPagina = () => {
    pagina = documento.addPage([LARGURA_PAGINA, ALTURA_PAGINA]);
    paginas.push(pagina);
    y = ALTURA_PAGINA - MARGEM;
  };

  novaPagina();
  pagina.drawText(limpar(cabecalho.titulo), { x: MARGEM, y: y - TAMANHO_TITULO, size: TAMANHO_TITULO, font: negrito, color: COR_TEXTO });
  y -= TAMANHO_TITULO + 6;
  for (const linha of cabecalho.linhas) {
    for (const trecho of quebrarEmLinhas(limpar(linha), fonte, TAMANHO_CONTEXTO, LARGURA_UTIL, 3)) {
      pagina.drawText(trecho, { x: MARGEM, y: y - TAMANHO_CONTEXTO, size: TAMANHO_CONTEXTO, font: fonte, color: COR_SECUNDARIA });
      y -= TAMANHO_CONTEXTO * 1.35;
    }
  }
  y -= 8;
  desenharCabecalhoTabela();

  const limiteInferior = MARGEM + ALTURA_RODAPE;

  if (celulas.length === 0) {
    pagina.drawText("Nenhum registro encontrado.", { x: MARGEM + RESPIRO_X, y: y - RESPIRO_Y - ENTRELINHA + 2, size: TAMANHO_TABELA, font: fonte, color: COR_SECUNDARIA });
  }

  celulas.forEach((linha, numeroLinha) => {
    const quebradas = linha.map((celula, indice) =>
      quebrarEmLinhas(celula.texto, fonte, TAMANHO_TABELA, larguraTexto(indice), MAX_LINHAS_POR_CELULA),
    );
    const altura = Math.max(...quebradas.map((l) => l.length)) * ENTRELINHA + 2 * RESPIRO_Y;

    if (y - altura < limiteInferior) {
      novaPagina();
      desenharCabecalhoTabela();
    }

    if (numeroLinha % 2 === 1) {
      pagina.drawRectangle({ x: MARGEM, y: y - altura, width: LARGURA_UTIL, height: altura, color: COR_ZEBRA });
    }

    let x = MARGEM;
    quebradas.forEach((linhasDaCelula, indice) => {
      linhasDaCelula.forEach((texto, n) => {
        const larguraDoTexto = fonte.widthOfTextAtSize(texto, TAMANHO_TABELA);
        const xTexto = linha[indice].numerico ? x + larguras[indice] - RESPIRO_X - larguraDoTexto : x + RESPIRO_X;
        pagina.drawText(texto, { x: xTexto, y: y - RESPIRO_Y - (n + 1) * ENTRELINHA + 2, size: TAMANHO_TABELA, font: fonte, color: COR_TEXTO });
      });
      x += larguras[indice];
    });
    y -= altura;
    pagina.drawLine({ start: { x: MARGEM, y }, end: { x: MARGEM + LARGURA_UTIL, y }, thickness: 0.3, color: COR_LINHA });
  });

  const rodapeEsquerda = limpar(`${cabecalho.titulo} · gerado em ${dataHoraBrasilia(agora)}`);
  paginas.forEach((paginaAtual, indice) => {
    const numeracao = `Página ${indice + 1} de ${paginas.length}`;
    paginaAtual.drawText(rodapeEsquerda, { x: MARGEM, y: MARGEM, size: TAMANHO_RODAPE, font: fonte, color: COR_SECUNDARIA });
    paginaAtual.drawText(numeracao, {
      x: LARGURA_PAGINA - MARGEM - fonte.widthOfTextAtSize(numeracao, TAMANHO_RODAPE),
      y: MARGEM,
      size: TAMANHO_RODAPE,
      font: fonte,
      color: COR_SECUNDARIA,
    });
  });

  return documento.save();
}
