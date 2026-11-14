import type {
  CategoriaProduto,
  OrigemRecepcao,
  Prisma,
  QualidadeFruto,
  StatusEntrega,
  StatusOrdemProducao,
} from "@prisma/client";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/permissions";
import type { SessaoAtiva } from "@/server/auth/sessao";
import { arredondar } from "@/lib/producao/arredondar";
import { destinoDoLote, type DestinoLote } from "@/lib/producao/destinoLote";
import { resumirOP, type ResumoOP } from "@/lib/producao/op";
import { hojeDeCalendario } from "@/lib/producao/periodo";
import { statusDoLote, type StatusLote } from "@/lib/producao/statusLote";
import { ROTULOS_ORIGEM_RECEPCAO } from "@/lib/schemas/enums";
import { obterConfiguracaoProducao, type ConfiguracaoProducaoValores } from "./configuracaoProducao";
import { dadosDoResumo, linhasEmNumeros } from "./ordemProducao";

export type OrigemDoFruto = {
  origem: OrigemRecepcao;
  talhao: string | null;
  fornecedor: string | null;
  qualidade: QualidadeFruto | null;
};

export type RecepcaoRastreio = OrigemDoFruto & {
  data: Date;
  pesoBrutoKg: number;
  descarteKg: number;
  documento: string | null;
  cancelada: boolean;
};

export type OpRastreio = {
  numero: string;
  data: Date;
  status: StatusOrdemProducao;
  responsavel: string | null;
  branqueamentoTemperaturaC: number | null;
  branqueamentoTempoS: number | null;
  rendimento: number | null;
  balanco: ResumoOP["balanco"];
  branqueamento: ResumoOP["branqueamento"];
};

export type FrutoConsumido = {
  codigo: string;
  produto: string;
  kgConsumido: number;
  dataRecepcao: Date;
  /** `null` quando o lote não veio de uma recepção. */
  origem: OrigemDoFruto | null;
  removido: boolean;
};

export type LotePolpaGerado = { codigo: string; produto: string; kg: number; saldoKg: number; removido: boolean };

export type OpConsumidora = OpRastreio & {
  /** Soma dos consumos não removidos deste lote na OP. */
  kgDesteLote: number;
  /** Todas as linhas deste lote na OP foram removidas (só aparece com cancelados). */
  consumoRemovido: boolean;
  lotesPolpa: LotePolpaGerado[];
};

export type LinhaCliente = {
  /** DIRETO = o próprio lote consultado; POLPA = polpa feita com o fruto consultado. */
  caminho: "DIRETO" | "POLPA";
  loteVendido: string;
  opNumero: string | null;
  pedidoNumero: number;
  pedidoData: Date;
  pedidoCancelado: boolean;
  kg: number;
  /** `null` = retira na propriedade. */
  entrega: { status: StatusEntrega; dataPrevista: Date; dataRealizada: Date | null; recebidoPor: string | null } | null;
  cliente: {
    nome: string;
    cnpjCpf: string | null;
    contato: string | null;
    telefone: string | null;
    email: string | null;
    municipio: string | null;
    enderecoEntrega: string | null;
  };
};

export type LoteRastreio = {
  id: string;
  codigo: string;
  produto: string;
  categoria: CategoriaProduto;
  data: Date;
  validade: Date;
  local: string;
  quantidadeInicialKg: number;
  saldoKg: number;
  status: StatusLote;
};

export type Rastreio = {
  lote: LoteRastreio;
  /** Só fruto. */
  recepcao: RecepcaoRastreio | null;
  /** Só polpa. */
  opOrigem: OpRastreio | null;
  /** Só polpa: os frutos da OP de origem. */
  frutosConsumidos: FrutoConsumido[];
  /** Só fruto. */
  opsQueConsumiram: OpConsumidora[];
  destino: DestinoLote;
  clientes: LinhaCliente[];
};

export type LoteEncontrado = { codigo: string; produto: string; data: Date; saldoKg: number };

export function normalizarCodigo(codigo: string): string {
  return codigo.trim().toUpperCase();
}

export function descreverOrigem(origem: OrigemDoFruto | null): string {
  if (!origem) return "—";
  return `${ROTULOS_ORIGEM_RECEPCAO[origem.origem]} · ${origem.talhao ?? origem.fornecedor ?? "—"}`;
}

const SELECT_ORIGEM_FRUTO = {
  origem: true,
  qualidade: true,
  talhao: { select: { nome: true } },
  fornecedor: { select: { nome: true } },
} satisfies Prisma.RecepcaoFrutoSelect;

function origemDoFruto(r: Prisma.RecepcaoFrutoGetPayload<{ select: typeof SELECT_ORIGEM_FRUTO }>): OrigemDoFruto {
  return {
    origem: r.origem,
    qualidade: r.qualidade,
    talhao: r.talhao?.nome ?? null,
    fornecedor: r.fornecedor?.nome ?? null,
  };
}

const SELECT_OP = {
  id: true,
  numero: true,
  data: true,
  status: true,
  responsavel: true,
  branqueamentoTemperaturaC: true,
  branqueamentoTempoS: true,
  aguaLitros: true,
  carocoResiduoKg: true,
  perdaKg: true,
  fruta: { select: { exigeBranqueamento: true } },
  consumos: {
    select: {
      loteId: true,
      quantidadeKg: true,
      custoKg: true,
      removidoEm: true,
      lote: {
        select: {
          codigo: true,
          data: true,
          produto: { select: { descricao: true } },
          recepcao: { select: SELECT_ORIGEM_FRUTO },
        },
      },
    },
    orderBy: { criadoEm: "asc" as const },
  },
  producoes: {
    select: {
      loteId: true,
      quantidadeKg: true,
      removidoEm: true,
      lote: { select: { codigo: true, saldoKg: true, produto: { select: { descricao: true } } } },
    },
    orderBy: { criadoEm: "asc" as const },
  },
  insumos: { where: { removidoEm: null }, select: { quantidade: true, custoUnitario: true } },
} satisfies Prisma.OrdemProducaoSelect;

type OpCarregada = Prisma.OrdemProducaoGetPayload<{ select: typeof SELECT_OP }>;

/** Dados da OP com rendimento, balanço e branqueamento das linhas não removidas. */
function paraOpRastreio(op: OpCarregada, configuracao: ConfiguracaoProducaoValores): OpRastreio {
  const linhas = linhasEmNumeros({
    consumos: op.consumos.filter((c) => c.removidoEm === null),
    producoes: op.producoes.filter((p) => p.removidoEm === null),
    insumos: op.insumos,
  });
  const resumo = resumirOP(dadosDoResumo(op, linhas), configuracao);
  return {
    numero: op.numero,
    data: op.data,
    status: op.status,
    responsavel: op.responsavel,
    branqueamentoTemperaturaC: op.branqueamentoTemperaturaC === null ? null : Number(op.branqueamentoTemperaturaC),
    branqueamentoTempoS: op.branqueamentoTempoS,
    rendimento: resumo.rendimento,
    balanco: resumo.balanco,
    branqueamento: resumo.branqueamento,
  };
}

/** Até 20 lotes da filial cujo código contém o trecho, mais recentes primeiro. */
export async function buscarLotes(sessao: SessaoAtiva, trecho: string): Promise<LoteEncontrado[]> {
  requirePermission(sessao.perfil, "producao:ler");
  const termo = normalizarCodigo(trecho);
  if (!termo) return [];
  const lotes = await prisma.lote.findMany({
    where: { filialId: sessao.filialId, codigo: { contains: termo, mode: "insensitive" } },
    select: { codigo: true, data: true, saldoKg: true, produto: { select: { descricao: true } } },
    orderBy: [{ data: "desc" }, { codigo: "desc" }],
    take: 20,
  });
  return lotes.map((l) => ({ codigo: l.codigo, produto: l.produto.descricao, data: l.data, saldoKg: Number(l.saldoKg) }));
}

/**
 * Rastreabilidade do lote (RN-28): para trás (recepção, ou OP e frutos), para
 * frente (OPs e polpas, só fruto), destino de cada kg e clientes que receberam
 * o lote ou a polpa derivada (D-33). Cancelados só com `incluirCancelados` (D-34).
 */
export async function rastrearLote(
  sessao: SessaoAtiva,
  codigo: string,
  opcoes: { incluirCancelados: boolean },
): Promise<Rastreio | null> {
  requirePermission(sessao.perfil, "producao:ler");
  const termo = normalizarCodigo(codigo);
  if (!termo) return null;
  const { incluirCancelados } = opcoes;

  const lote = await prisma.lote.findFirst({
    where: { filialId: sessao.filialId, codigo: { equals: termo, mode: "insensitive" } },
    include: {
      produto: { select: { descricao: true, categoria: true, conservacao: true } },
      local: { select: { nome: true } },
      recepcao: {
        select: {
          data: true,
          pesoBrutoKg: true,
          descarteKg: true,
          documento: true,
          status: true,
          ...SELECT_ORIGEM_FRUTO,
        },
      },
      producaoOP: { select: { ordemProducaoId: true } },
      consumosOP: { select: { ordemProducaoId: true } },
    },
  });
  if (!lote) return null;

  const fruto = lote.produto.categoria === "FRUTO";
  const opIds = fruto
    ? [...new Set(lote.consumosOP.map((c) => c.ordemProducaoId))]
    : lote.producaoOP
      ? [lote.producaoOP.ordemProducaoId]
      : [];

  const [configuracao, ops, movimentos] = await Promise.all([
    obterConfiguracaoProducao(sessao.filialId),
    opIds.length > 0
      ? prisma.ordemProducao.findMany({
          where: { id: { in: opIds }, filialId: sessao.filialId },
          select: SELECT_OP,
          orderBy: [{ data: "asc" }, { numero: "asc" }],
        })
      : Promise.resolve([] as OpCarregada[]),
    prisma.movimentoEstoque.findMany({
      where: { loteId: lote.id },
      select: { tipo: true, quantidadeKg: true, ajuste: { select: { motivo: true } } },
    }),
  ]);

  let opOrigem: OpRastreio | null = null;
  let frutosConsumidos: FrutoConsumido[] = [];
  if (!fruto && ops[0]) {
    opOrigem = paraOpRastreio(ops[0], configuracao);
    frutosConsumidos = ops[0].consumos
      .filter((c) => incluirCancelados || c.removidoEm === null)
      .map((c) => ({
        codigo: c.lote.codigo,
        produto: c.lote.produto.descricao,
        kgConsumido: Number(c.quantidadeKg),
        dataRecepcao: c.lote.data,
        origem: c.lote.recepcao ? origemDoFruto(c.lote.recepcao) : null,
        removido: c.removidoEm !== null,
      }));
  }

  // Lote de polpa → nº da OP, para achar as vendas feitas com este fruto.
  const opDoLotePolpa = new Map<string, string>();
  const opsQueConsumiram: OpConsumidora[] = !fruto
    ? []
    : ops.flatMap((op) => {
        const ativos = op.consumos.filter((c) => c.loteId === lote.id && c.removidoEm === null);
        const consumoRemovido = ativos.length === 0;
        if (!incluirCancelados && (op.status === "CANCELADA" || consumoRemovido)) return [];
        const producoes = op.producoes.filter((p) => incluirCancelados || p.removidoEm === null);
        for (const p of producoes) opDoLotePolpa.set(p.loteId, op.numero);
        return [
          {
            ...paraOpRastreio(op, configuracao),
            kgDesteLote: arredondar(
              ativos.reduce((s, c) => s + Number(c.quantidadeKg), 0),
              3,
            ),
            consumoRemovido,
            lotesPolpa: producoes.map((p) => ({
              codigo: p.lote.codigo,
              produto: p.lote.produto.descricao,
              kg: Number(p.quantidadeKg),
              saldoKg: Number(p.lote.saldoKg),
              removido: p.removidoEm !== null,
            })),
          },
        ];
      });

  const itens = await prisma.itemPedidoVenda.findMany({
    where: {
      loteId: { in: [lote.id, ...opDoLotePolpa.keys()] },
      pedido: { filialId: sessao.filialId, ...(incluirCancelados ? {} : { status: "CONFIRMADO" as const }) },
    },
    select: {
      loteId: true,
      quantidadeKg: true,
      lote: { select: { codigo: true } },
      pedido: {
        select: {
          numero: true,
          data: true,
          status: true,
          entrega: { select: { status: true, dataPrevista: true, dataRealizada: true, recebidoPor: true } },
          cliente: {
            select: {
              nome: true,
              cnpjCpf: true,
              contato: true,
              telefone: true,
              email: true,
              municipio: true,
              enderecoEntrega: true,
            },
          },
        },
      },
    },
  });

  const clientes: LinhaCliente[] = itens
    .map((i) => ({
      caminho: i.loteId === lote.id ? ("DIRETO" as const) : ("POLPA" as const),
      loteVendido: i.lote.codigo,
      opNumero: opDoLotePolpa.get(i.loteId) ?? null,
      pedidoNumero: i.pedido.numero,
      pedidoData: i.pedido.data,
      pedidoCancelado: i.pedido.status === "CANCELADO",
      kg: Number(i.quantidadeKg),
      entrega: i.pedido.entrega,
      cliente: i.pedido.cliente,
    }))
    .sort((a, b) => a.pedidoData.getTime() - b.pedidoData.getTime() || a.pedidoNumero - b.pedidoNumero);

  const saldoKg = Number(lote.saldoKg);
  return {
    lote: {
      id: lote.id,
      codigo: lote.codigo,
      produto: lote.produto.descricao,
      categoria: lote.produto.categoria,
      data: lote.data,
      validade: lote.validade,
      local: lote.local.nome,
      quantidadeInicialKg: Number(lote.quantidadeInicialKg),
      saldoKg,
      status: statusDoLote(
        { saldoKg, validade: lote.validade, conservacao: lote.produto.conservacao },
        hojeDeCalendario(),
        configuracao,
      ),
    },
    recepcao: lote.recepcao
      ? {
          ...origemDoFruto(lote.recepcao),
          data: lote.recepcao.data,
          pesoBrutoKg: Number(lote.recepcao.pesoBrutoKg),
          descarteKg: Number(lote.recepcao.descarteKg),
          documento: lote.recepcao.documento,
          cancelada: lote.recepcao.status === "CANCELADA",
        }
      : null,
    opOrigem,
    frutosConsumidos,
    opsQueConsumiram,
    destino: destinoDoLote(
      movimentos.map((m) => ({ tipo: m.tipo, quantidadeKg: Number(m.quantidadeKg), motivo: m.ajuste?.motivo ?? null })),
      saldoKg,
    ),
    clientes,
  };
}
