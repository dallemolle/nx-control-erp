import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
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
  pesoLiquidoKg: number;
  registroAdepara: string | null;
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
  for (const palavra of texto.split(" ")) {
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

/** Etiqueta do lote (RN-29): uma página de 100 × 70 mm. */
export async function gerarEtiquetaPdf(dados: DadosEtiqueta): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Etiqueta ${dados.codigoLote}`);
  const pagina = pdf.addPage([LARGURA, ALTURA]);
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const sanitizar = criarSanitizador(normal);
  // O sinal de menos (U+2212) de "−18 °C" não existe na fonte padrão: vira hífen.
  const limpar = (texto: string) => sanitizar(texto.replaceAll("−", "-"));
  const largura = LARGURA - 2 * MARGEM;

  let y = ALTURA - MARGEM;
  const escrever = (texto: string, fonte: PDFFont, tamanho: number, cor = rgb(0, 0, 0), x = MARGEM) => {
    y -= tamanho;
    pagina.drawText(limpar(texto), { x, y, size: tamanho, font: fonte, color: cor });
    y -= tamanho * 0.35;
  };

  escrever(dados.empresa, negrito, 8, CINZA);
  for (const linha of quebrar(limpar(dados.produto), negrito, 11, largura, 2)) escrever(linha, negrito, 11);

  y -= 3;
  escrever("LOTE", normal, 7, CINZA);
  escrever(dados.codigoLote, negrito, 17);

  y -= 2;
  const colunaDireita = MARGEM + largura / 2;
  const yDatas = y;
  escrever(`${dados.rotuloData}: ${formatarData(dados.data)}`, normal, 9);
  y = yDatas;
  escrever(`Validade: ${formatarData(dados.validade)}`, negrito, 9, rgb(0, 0, 0), colunaDireita);

  escrever(`Peso líquido: ${KG.format(dados.pesoLiquidoKg)} kg`, normal, 9);
  if (dados.armazenamento) escrever(`Conservação: ${dados.armazenamento}`, normal, 9);

  if (dados.registroAdepara) {
    pagina.drawText(limpar(`Registro ADEPARA: ${dados.registroAdepara}`), {
      x: MARGEM,
      y: MARGEM,
      size: 7,
      font: normal,
      color: CINZA,
    });
  }

  return pdf.save();
}
