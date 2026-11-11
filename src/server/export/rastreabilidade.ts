import type { ColunaExport } from "@/lib/export/csv";
import { secaoPdf, type SecaoPdf } from "@/lib/export/pdf";
import { linhasDoDestino } from "@/lib/producao/destinoLote";
import { ROTULOS_STATUS_BRANQUEAMENTO, ROTULOS_STATUS_VERIFICACAO } from "@/lib/producao/op";
import { ROTULOS_STATUS_LOTE } from "@/lib/producao/statusLote";
import { ROTULOS_STATUS_ENTREGA, ROTULOS_STATUS_ORDEM_PRODUCAO } from "@/lib/schemas/enums";
import {
  descreverOrigem,
  type FrutoConsumido,
  type LinhaCliente,
  type LoteRastreio,
  type OpConsumidora,
  type OpRastreio,
  type Rastreio,
  type RecepcaoRastreio,
} from "@/server/services/rastreabilidade";

const situacao = (removido: boolean) => (removido ? "Removido" : "");

/** Uma linha por item vendido: a planilha de trabalho do recall (CSV/Excel). */
export const COLUNAS_CLIENTES: ColunaExport<LinhaCliente>[] = [
  { rotulo: "Caminho", valor: (c) => (c.caminho === "DIRETO" ? "Direto" : "Polpa") },
  { rotulo: "Lote vendido", valor: (c) => c.loteVendido },
  { rotulo: "OP", valor: (c) => c.opNumero ?? "" },
  { rotulo: "Pedido", tipo: "inteiro", valor: (c) => c.pedidoNumero },
  { rotulo: "Data", valor: (c) => c.pedidoData },
  { rotulo: "Cliente", valor: (c) => c.cliente.nome },
  { rotulo: "CPF/CNPJ", valor: (c) => c.cliente.cnpjCpf ?? "" },
  { rotulo: "Contato", valor: (c) => c.cliente.contato ?? "" },
  { rotulo: "Telefone", valor: (c) => c.cliente.telefone ?? "" },
  { rotulo: "E-mail", valor: (c) => c.cliente.email ?? "" },
  { rotulo: "Município", valor: (c) => c.cliente.municipio ?? "" },
  { rotulo: "Endereço de entrega", valor: (c) => c.cliente.enderecoEntrega ?? "" },
  { rotulo: "kg", valor: (c) => c.kg },
  { rotulo: "Entrega", valor: (c) => (c.entrega ? ROTULOS_STATUS_ENTREGA[c.entrega.status] : "Retira") },
  { rotulo: "Entregue em", valor: (c) => c.entrega?.dataRealizada ?? "" },
  { rotulo: "Recebido por", valor: (c) => c.entrega?.recebidoPor ?? "" },
  { rotulo: "Cancelado", valor: (c) => (c.pedidoCancelado ? "Sim" : "") },
];

const COLUNAS_LOTE: ColunaExport<LoteRastreio>[] = [
  { rotulo: "Código", valor: (l) => l.codigo },
  { rotulo: "Produto", valor: (l) => l.produto },
  { rotulo: "Data", valor: (l) => l.data },
  { rotulo: "Validade", valor: (l) => l.validade },
  { rotulo: "Local", valor: (l) => l.local },
  { rotulo: "Inicial (kg)", valor: (l) => l.quantidadeInicialKg },
  { rotulo: "Saldo (kg)", valor: (l) => l.saldoKg },
  { rotulo: "Status", valor: (l) => ROTULOS_STATUS_LOTE[l.status] },
];

const COLUNAS_RECEPCAO: ColunaExport<RecepcaoRastreio>[] = [
  { rotulo: "Data", valor: (r) => r.data },
  { rotulo: "Origem", valor: (r) => descreverOrigem(r) },
  { rotulo: "Qualidade", valor: (r) => r.qualidade ?? "" },
  { rotulo: "Peso bruto (kg)", valor: (r) => r.pesoBrutoKg },
  { rotulo: "Descarte (kg)", valor: (r) => r.descarteKg },
  { rotulo: "Documento", valor: (r) => r.documento ?? "" },
  { rotulo: "Situação", valor: (r) => (r.cancelada ? "Excluída" : "Ativa") },
];

const COLUNAS_OP: ColunaExport<OpRastreio>[] = [
  { rotulo: "OP", valor: (op) => op.numero },
  { rotulo: "Data", valor: (op) => op.data },
  { rotulo: "Status", valor: (op) => ROTULOS_STATUS_ORDEM_PRODUCAO[op.status] },
  { rotulo: "Responsável", valor: (op) => op.responsavel ?? "" },
  { rotulo: "Branq. (°C)", valor: (op) => op.branqueamentoTemperaturaC ?? "" },
  { rotulo: "Branq. (s)", tipo: "inteiro", valor: (op) => op.branqueamentoTempoS ?? "" },
  { rotulo: "Branqueamento", valor: (op) => ROTULOS_STATUS_BRANQUEAMENTO[op.branqueamento] },
  {
    rotulo: "Rendimento (%)",
    tipo: "percentual",
    valor: (op) => (op.rendimento === null ? "" : op.rendimento * 100),
  },
  { rotulo: "Balanço (kg)", valor: (op) => op.balanco.diferencaKg },
  { rotulo: "Balanço", valor: (op) => ROTULOS_STATUS_VERIFICACAO[op.balanco.status] },
];

const COLUNAS_OP_CONSUMIDORA: ColunaExport<OpConsumidora>[] = [
  ...COLUNAS_OP,
  { rotulo: "kg deste lote", valor: (op) => op.kgDesteLote },
  { rotulo: "Consumo", valor: (op) => situacao(op.consumoRemovido) },
];

const COLUNAS_FRUTO: ColunaExport<FrutoConsumido>[] = [
  { rotulo: "Lote", valor: (f) => f.codigo },
  { rotulo: "Produto", valor: (f) => f.produto },
  { rotulo: "kg consumido", valor: (f) => f.kgConsumido },
  { rotulo: "Recepção", valor: (f) => f.dataRecepcao },
  { rotulo: "Origem", valor: (f) => descreverOrigem(f.origem) },
  { rotulo: "Qualidade", valor: (f) => f.origem?.qualidade ?? "" },
  { rotulo: "Situação", valor: (f) => situacao(f.removido) },
];

type LinhaPolpa = OpConsumidora["lotesPolpa"][number] & { op: string };
const COLUNAS_POLPA: ColunaExport<LinhaPolpa>[] = [
  { rotulo: "OP", valor: (p) => p.op },
  { rotulo: "Lote", valor: (p) => p.codigo },
  { rotulo: "Produto", valor: (p) => p.produto },
  { rotulo: "kg produzido", valor: (p) => p.kg },
  { rotulo: "Saldo (kg)", valor: (p) => p.saldoKg },
  { rotulo: "Situação", valor: (p) => situacao(p.removido) },
];

const COLUNAS_DESTINO: ColunaExport<{ rotulo: string; kg: number }>[] = [
  { rotulo: "Movimento", valor: (l) => l.rotulo },
  { rotulo: "kg", valor: (l) => l.kg },
];

/** Relatório completo do lote para o PDF, na ordem da tela. */
export function secoesDoRastreio(r: Rastreio): SecaoPdf<unknown>[] {
  const secoes = [secaoPdf({ titulo: "Lote", linhas: [r.lote], colunas: COLUNAS_LOTE })];
  if (r.recepcao) {
    secoes.push(secaoPdf({ titulo: "Origem: recepção", linhas: [r.recepcao], colunas: COLUNAS_RECEPCAO }));
  }
  if (r.opOrigem) {
    secoes.push(secaoPdf({ titulo: "Origem: OP", linhas: [r.opOrigem], colunas: COLUNAS_OP }));
    secoes.push(secaoPdf({ titulo: "Frutos consumidos", linhas: r.frutosConsumidos, colunas: COLUNAS_FRUTO }));
  }
  if (r.lote.categoria === "FRUTO") {
    secoes.push(
      secaoPdf({ titulo: "OPs que consumiram o lote", linhas: r.opsQueConsumiram, colunas: COLUNAS_OP_CONSUMIDORA }),
    );
    secoes.push(
      secaoPdf({
        titulo: "Lotes de polpa gerados",
        linhas: r.opsQueConsumiram.flatMap((op) => op.lotesPolpa.map((p) => ({ ...p, op: op.numero }))),
        colunas: COLUNAS_POLPA,
      }),
    );
  }
  secoes.push(
    secaoPdf({
      titulo: r.destino.confere ? "Destino do lote" : "Destino do lote (não confere com o saldo)",
      linhas: linhasDoDestino(r.destino),
      colunas: COLUNAS_DESTINO,
    }),
  );
  secoes.push(secaoPdf({ titulo: "Clientes que receberam", linhas: r.clientes, colunas: COLUNAS_CLIENTES }));
  return secoes;
}

export function nomeDoArquivo(codigo: string): string {
  return `rastreabilidade-${codigo.replace(/[^A-Za-z0-9_-]/g, "_")}`;
}
