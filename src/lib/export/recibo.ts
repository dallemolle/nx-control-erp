import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatarData, formatarMoeda } from "@/lib/formatacao";
import { criarSanitizador } from "./pdf";

export type DadosRecibo = {
  empresa: string;
  documentoEmpresa: string | null;
  numero: number;
  data: Date;
  cliente: string;
  documentoCliente: string | null;
  itens: { produto: string; lote: string; quantidadeKg: number; precoKg: number; valor: number }[];
  total: number;
  formaPagamento: string;
  situacao: string;
  cancelado: boolean;
  observacao: string | null;
};

const LARGURA = 595.28;
const ALTURA = 841.89;
const MARGEM = 40;
const CINZA = rgb(0.4, 0.4, 0.4);
const LINHA = rgb(0.82, 0.83, 0.86);
const VERMELHO = rgb(0.75, 0.1, 0.1);
const KG = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const PRECO = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

/** Colunas da tabela de itens: posição x e alinhamento. */
const COLUNAS = [
  { rotulo: "Produto", x: MARGEM, direita: false },
  { rotulo: "Lote", x: 255, direita: false },
  { rotulo: "kg", x: 400, direita: true },
  { rotulo: "R$/kg", x: 470, direita: true },
  { rotulo: "Valor", x: LARGURA - MARGEM, direita: true },
] as const;

/** Corta o texto com reticências para caber na largura. */
function caber(texto: string, fonte: PDFFont, tamanho: number, largura: number): string {
  if (fonte.widthOfTextAtSize(texto, tamanho) <= largura) return texto;
  let cortado = texto;
  while (cortado.length > 1 && fonte.widthOfTextAtSize(`${cortado}...`, tamanho) > largura) cortado = cortado.slice(0, -1);
  return `${cortado}...`;
}

/** Recibo do pedido de venda em A4; a tabela de itens continua em novas páginas se precisar. */
export async function gerarReciboPdf(dados: DadosRecibo): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Recibo do pedido ${dados.numero}`);
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const limpar = criarSanitizador(normal);

  let pagina: PDFPage = pdf.addPage([LARGURA, ALTURA]);
  let y = ALTURA - MARGEM;

  const escrever = (texto: string, opcoes: { fonte?: PDFFont; tamanho?: number; x?: number; cor?: ReturnType<typeof rgb>; direita?: boolean } = {}) => {
    const fonte = opcoes.fonte ?? normal;
    const tamanho = opcoes.tamanho ?? 10;
    const limpo = limpar(texto);
    const largura = fonte.widthOfTextAtSize(limpo, tamanho);
    const x = opcoes.direita ? (opcoes.x ?? LARGURA - MARGEM) - largura : (opcoes.x ?? MARGEM);
    pagina.drawText(limpo, { x, y, size: tamanho, font: fonte, color: opcoes.cor ?? rgb(0, 0, 0) });
  };
  const linhaHorizontal = () => {
    pagina.drawLine({ start: { x: MARGEM, y }, end: { x: LARGURA - MARGEM, y }, thickness: 0.5, color: LINHA });
  };

  // Cabeçalho
  y -= 14;
  escrever(dados.empresa, { fonte: negrito, tamanho: 14 });
  escrever(`Pedido nº ${dados.numero}`, { fonte: negrito, tamanho: 14, direita: true });
  y -= 14;
  if (dados.documentoEmpresa) escrever(dados.documentoEmpresa, { cor: CINZA, tamanho: 9 });
  escrever(`Data: ${formatarData(dados.data)}`, { direita: true, tamanho: 9 });
  y -= 22;
  escrever("RECIBO DE VENDA", { fonte: negrito, tamanho: 12 });

  if (dados.cancelado) {
    y -= 34;
    escrever("CANCELADO", { fonte: negrito, tamanho: 28, cor: VERMELHO });
  }

  y -= 26;
  escrever("Cliente", { cor: CINZA, tamanho: 8 });
  y -= 13;
  escrever(dados.cliente, { fonte: negrito, tamanho: 11 });
  if (dados.documentoCliente) {
    y -= 13;
    escrever(dados.documentoCliente, { tamanho: 9 });
  }

  // Tabela de itens
  const cabecalhoTabela = () => {
    y -= 24;
    for (const coluna of COLUNAS) {
      escrever(coluna.rotulo, { fonte: negrito, tamanho: 9, x: coluna.x, direita: coluna.direita });
    }
    y -= 6;
    linhaHorizontal();
  };
  cabecalhoTabela();

  for (const item of dados.itens) {
    if (y < MARGEM + 60) {
      pagina = pdf.addPage([LARGURA, ALTURA]);
      y = ALTURA - MARGEM;
      escrever(`Pedido nº ${dados.numero} (continuação)`, { cor: CINZA, tamanho: 9 });
      cabecalhoTabela();
    }
    y -= 15;
    escrever(caber(limpar(item.produto), normal, 9, 205), { tamanho: 9 });
    escrever(item.lote, { tamanho: 9, x: COLUNAS[1].x });
    escrever(KG.format(item.quantidadeKg), { tamanho: 9, x: COLUNAS[2].x, direita: true });
    escrever(PRECO.format(item.precoKg), { tamanho: 9, x: COLUNAS[3].x, direita: true });
    escrever(formatarMoeda(item.valor), { tamanho: 9, direita: true });
  }

  y -= 8;
  linhaHorizontal();
  y -= 18;
  escrever("Total", { fonte: negrito, tamanho: 11, x: COLUNAS[3].x - 60 });
  escrever(formatarMoeda(dados.total), { fonte: negrito, tamanho: 11, direita: true });

  y -= 28;
  escrever(`Forma de pagamento: ${dados.formaPagamento}`, { tamanho: 10 });
  y -= 14;
  escrever(`Situação do pagamento: ${dados.situacao}`, { tamanho: 10 });
  if (dados.observacao) {
    y -= 14;
    escrever(caber(limpar(`Observação: ${dados.observacao}`), normal, 10, LARGURA - 2 * MARGEM), { tamanho: 10 });
  }

  return pdf.save();
}
