import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatarData } from "@/lib/formatacao";
import { criarSanitizador } from "./pdf";

export type DadosEtiqueta = {
  empresa: string;
  produto: string;
  codigoLote: string;
  rotuloData: "Fabricação" | "Recepção";
  data: Date;
  validade: Date;
  armazenamento: string | null;
  /** Peso de cada etiqueta (o da embalagem, quando há várias). */
  pesoLiquidoKg: number;
  registroAdepara: string | null;
  /** CNPJ da filial. */
  cnpj: string | null;
  /** Endereço da configuração de produção (D-10). */
  endereco: string | null;
  /** Dizeres livres do produto: ingredientes, conservação (D-10). */
  texto: string | null;
  /** Uma página por cópia (uma por embalagem). Padrão 1. */
  copias?: number;
};

const MM = 72 / 25.4;
const LARGURA = 100 * MM;
const ALTURA = 70 * MM;
const MARGEM = 10;
const CINZA = rgb(0.35, 0.35, 0.35);
const KG = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

/** Quebra por palavras até `maxLinhas`; a última linha é cortada com reticências se sobrar texto. */
function quebrar(texto: string, fonte: PDFFont, tamanho: number, largura: number, maxLinhas: number): string[] {
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of texto.split(/\s+/).filter(Boolean)) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (fonte.widthOfTextAtSize(tentativa, tamanho) <= largura || !atual) {
      atual = tentativa;
    } else {
      linhas.push(atual);
      atual = palavra;
    }
  }
  if (atual) linhas.push(atual);
  if (linhas.length <= maxLinhas) return linhas;
  const visiveis = linhas.slice(0, maxLinhas);
  let ultima = visiveis[maxLinhas - 1];
  while (ultima.length > 1 && fonte.widthOfTextAtSize(`${ultima}...`, tamanho) > largura) ultima = ultima.slice(0, -1);
  visiveis[maxLinhas - 1] = `${ultima}...`;
  return visiveis;
}

type Fontes = { normal: PDFFont; negrito: PDFFont; limpar: (texto: string) => string };

function desenharEtiqueta(pagina: PDFPage, { normal, negrito, limpar }: Fontes, dados: DadosEtiqueta) {
  const largura = LARGURA - 2 * MARGEM;
  let y = ALTURA - MARGEM;
  const escrever = (texto: string, fonte: PDFFont, tamanho: number, cor = rgb(0, 0, 0), x = MARGEM) => {
    y -= tamanho;
    pagina.drawText(texto, { x, y, size: tamanho, font: fonte, color: cor });
    y -= tamanho * 0.35;
  };

  const empresa = dados.cnpj ? `${dados.empresa} · CNPJ ${dados.cnpj}` : dados.empresa;
  for (const linha of quebrar(limpar(empresa), negrito, 8, largura, 1)) escrever(linha, negrito, 8, CINZA);
  if (dados.endereco) {
    for (const linha of quebrar(limpar(dados.endereco), normal, 6.5, largura, 1)) escrever(linha, normal, 6.5, CINZA);
  }
  for (const linha of quebrar(limpar(dados.produto), negrito, 11, largura, 2)) escrever(linha, negrito, 11);

  y -= 3;
  escrever("LOTE", normal, 7, CINZA);
  escrever(limpar(dados.codigoLote), negrito, 17);

  y -= 2;
  const colunaDireita = MARGEM + largura / 2;
  const yDatas = y;
  escrever(limpar(`${dados.rotuloData}: ${formatarData(dados.data)}`), normal, 9);
  y = yDatas;
  escrever(limpar(`Validade: ${formatarData(dados.validade)}`), negrito, 9, rgb(0, 0, 0), colunaDireita);

  escrever(limpar(`Peso líquido: ${KG.format(dados.pesoLiquidoKg)} kg`), normal, 9);
  if (dados.armazenamento) escrever(limpar(`Conservação: ${dados.armazenamento}`), normal, 9);

  // Rodapé de baixo para cima: registro ADEPARA e, acima dele, o texto do produto.
  let rodape = MARGEM;
  if (dados.registroAdepara) {
    pagina.drawText(limpar(`Registro ADEPARA: ${dados.registroAdepara}`), {
      x: MARGEM,
      y: rodape,
      size: 7,
      font: normal,
      color: CINZA,
    });
    rodape += 9;
  }
  if (dados.texto) {
    // Só as linhas que cabem entre o peso/conservação e o rodapé (no máximo 3).
    const espaco = Math.max(0, Math.floor((y - rodape - 2) / 8));
    const linhas = quebrar(limpar(dados.texto), normal, 6.5, largura, Math.min(3, espaco));
    linhas.reverse().forEach((linha, i) => {
      pagina.drawText(linha, { x: MARGEM, y: rodape + i * 8, size: 6.5, font: normal });
    });
  }
}

/** Etiqueta do lote (RN-29): uma página de 100 × 70 mm por cópia. */
export async function gerarEtiquetaPdf(dados: DadosEtiqueta): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Etiqueta ${dados.codigoLote}`);
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const sanitizar = criarSanitizador(normal);
  // O sinal de menos (U+2212) de "−18 °C" não existe na fonte padrão: vira hífen.
  const limpar = (texto: string) => sanitizar(texto.replaceAll("−", "-"));

  const copias = Math.max(1, Math.floor(dados.copias ?? 1));
  for (let i = 0; i < copias; i++) {
    desenharEtiqueta(pdf.addPage([LARGURA, ALTURA]), { normal, negrito, limpar }, dados);
  }
  return pdf.save();
}
