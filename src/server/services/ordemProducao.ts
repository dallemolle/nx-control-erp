import { Prisma, type StatusOrdemProducao } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { podeExecutar, requireAlteracaoFilial, requirePermission } from "@/server/auth/permissions";
import { registrarAuditoria, type ClientePrisma } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type {
  CabecalhoOPValues,
  ConsumoValues,
  InsumoOPValues,
  ProcessoOPValues,
  ProducaoValues,
} from "@/lib/schemas/ordemProducao";
import { formatarData } from "@/lib/formatacao";
import { calcularValidade, prefixoDoLote, proximoCodigoDeLote } from "@/lib/producao/lote";
import { loteVencidoNaData } from "@/lib/producao/venda";
import { arredondar } from "@/lib/producao/arredondar";
import {
  custoOP,
  prefixoDaOP,
  resumirOP,
  type ConfiguracaoResumo,
  type DadosResumoOP,
  type LinhasOP,
  type ResumoOP,
  type VerificarOP,
} from "@/lib/producao/op";
import { obterConfiguracaoProducao } from "./configuracaoProducao";
import { registrarMovimento } from "./estoque";

const TENTATIVAS_NUMERACAO = 3;
const ROTULO_STATUS: Record<StatusOrdemProducao, string> = {
  ABERTA: "aberta",
  ENCERRADA: "encerrada",
  CANCELADA: "cancelada",
};

function autorizar(sessao: SessaoAtiva) {
  requirePermission(sessao.perfil, "producao:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);
}

function conflitoDeNumero(erro: unknown): boolean {
  return erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002";
}

function auditar(
  sessao: SessaoAtiva,
  tx: Prisma.TransactionClient,
  opId: string,
  acao: string,
  novo: Record<string, unknown>,
  anterior: Record<string, unknown> | null = null,
) {
  return registrarAuditoria(
    {
      empresaId: sessao.empresaId,
      filialId: sessao.filialId,
      usuarioId: sessao.usuarioId,
      entidade: "OrdemProducao",
      entidadeId: opId,
      acao,
      anterior,
      novo,
    },
    tx,
  );
}

/**
 * Trava a linha da OP até o fim da transação (UPDATE condicionado ao status):
 * encerrar e lançar ao mesmo tempo ficam em fila, e o segundo vê o status novo.
 */
export async function travarOP(
  tx: Prisma.TransactionClient,
  filialId: string,
  opId: string,
  esperado: StatusOrdemProducao[] = ["ABERTA"],
) {
  const { count } = await tx.ordemProducao.updateMany({
    where: { id: opId, filialId, status: { in: esperado } },
    data: { atualizadoEm: new Date() },
  });
  const op = await tx.ordemProducao.findFirst({
    where: { id: opId, filialId },
    include: { fruta: { select: { id: true, exigeBranqueamento: true } } },
  });
  if (!op) throw new Error("OP não encontrada");
  if (count === 0) throw new Error(`A OP ${op.numero} está ${ROTULO_STATUS[op.status]}`);
  return op;
}

/** Linhas não removidas da OP, em números. */
export async function linhasAtivas(db: ClientePrisma, opId: string): Promise<LinhasOP> {
  const [consumos, producoes, insumos] = [
    await db.consumoOP.findMany({
      where: { ordemProducaoId: opId, removidoEm: null },
      select: { quantidadeKg: true, custoKg: true },
    }),
    await db.producaoOP.findMany({
      where: { ordemProducaoId: opId, removidoEm: null },
      select: { quantidadeKg: true },
    }),
    await db.insumoOP.findMany({
      where: { ordemProducaoId: opId, removidoEm: null },
      select: { quantidade: true, custoUnitario: true },
    }),
  ];
  return {
    consumos: consumos.map((c) => ({ quantidadeKg: Number(c.quantidadeKg), custoKg: Number(c.custoKg) })),
    producoes: producoes.map((p) => ({ quantidadeKg: Number(p.quantidadeKg) })),
    insumos: insumos.map((i) => ({ quantidade: Number(i.quantidade), custoUnitario: Number(i.custoUnitario) })),
  };
}

/** Custo provisório: o mesmo custo/kg em todos os lotes de polpa ativos da OP (D-06). */
export async function recalcularCustoProvisorio(tx: Prisma.TransactionClient, opId: string) {
  const linhas = await linhasAtivas(tx, opId);
  const custo = custoOP({
    consumos: linhas.consumos,
    insumos: linhas.insumos,
    polpaKg: linhas.producoes.reduce((s, p) => s + p.quantidadeKg, 0),
  });
  await tx.lote.updateMany({
    where: { producaoOP: { is: { ordemProducaoId: opId, removidoEm: null } } },
    data: { custoKg: custo.custoKgPolpa },
  });
  return custo;
}

async function frutaAtiva(empresaId: string, frutaId: string) {
  const fruta = await prisma.fruta.findFirst({ where: { id: frutaId, empresaId, ativo: true }, select: { id: true } });
  if (!fruta) throw new Error("Fruta não encontrada ou inativa");
  return fruta;
}

/** Nova OP (F2): numerada `OP-AAMMDD-NN` na filial, sem linhas. */
export async function criarOP(sessao: SessaoAtiva, dados: CabecalhoOPValues): Promise<{ id: string; numero: string }> {
  autorizar(sessao);
  await frutaAtiva(sessao.empresaId, dados.frutaId);

  for (let tentativa = 1; ; tentativa++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const prefixo = prefixoDaOP(dados.data);
        const existentes = await tx.ordemProducao.findMany({
          where: { filialId: sessao.filialId, numero: { startsWith: `${prefixo}-` } },
          select: { numero: true },
        });
        const numero = proximoCodigoDeLote(
          prefixo,
          existentes.map((o) => o.numero),
        );
        const op = await tx.ordemProducao.create({
          data: {
            filialId: sessao.filialId,
            numero,
            data: dados.data,
            frutaId: dados.frutaId,
            responsavel: dados.responsavel ?? null,
            usuarioId: sessao.usuarioId,
          },
        });
        await auditar(sessao, tx, op.id, "CRIAR", {
          numero,
          data: dados.data,
          frutaId: dados.frutaId,
          responsavel: dados.responsavel ?? null,
        });
        return { id: op.id, numero };
      });
    } catch (erro) {
      // Outra OP do mesmo dia pegou o número antes: refaz com o próximo.
      if (!conflitoDeNumero(erro) || tentativa >= TENTATIVAS_NUMERACAO) throw erro;
    }
  }
}

/** Responsável sempre; data e fruta só enquanto a OP não tem linhas ativas (validade e RN-14 dependem delas). */
export async function atualizarCabecalhoOP(sessao: SessaoAtiva, id: string, dados: CabecalhoOPValues) {
  autorizar(sessao);
  await prisma.$transaction(async (tx) => {
    const op = await travarOP(tx, sessao.filialId, id);
    const mudaBase = op.data.getTime() !== dados.data.getTime() || op.frutaId !== dados.frutaId;
    if (mudaBase) {
      const [consumos, producoes] = [
        await tx.consumoOP.count({ where: { ordemProducaoId: id, removidoEm: null } }),
        await tx.producaoOP.count({ where: { ordemProducaoId: id, removidoEm: null } }),
      ];
      if (consumos + producoes > 0) throw new Error("Remova as linhas antes de mudar a data ou a fruta");
      if (op.frutaId !== dados.frutaId) {
        const fruta = await tx.fruta.findFirst({
          where: { id: dados.frutaId, empresaId: sessao.empresaId, ativo: true },
          select: { id: true },
        });
        if (!fruta) throw new Error("Fruta não encontrada ou inativa");
      }
    }
    const novo = { data: dados.data, frutaId: dados.frutaId, responsavel: dados.responsavel ?? null };
    await tx.ordemProducao.update({ where: { id }, data: novo });
    await auditar(sessao, tx, id, "ATUALIZAR", novo, {
      data: op.data,
      frutaId: op.frutaId,
      responsavel: op.responsavel,
    });
  });
}

/** Aba "Processo": branqueamento, água, caroço/resíduo, perda e observação. */
export async function atualizarProcessoOP(sessao: SessaoAtiva, id: string, dados: ProcessoOPValues) {
  autorizar(sessao);
  await prisma.$transaction(async (tx) => {
    const op = await travarOP(tx, sessao.filialId, id);
    const novo = {
      branqueamentoTemperaturaC: dados.branqueamentoTemperaturaC,
      branqueamentoTempoS: dados.branqueamentoTempoS,
      aguaLitros: dados.aguaLitros,
      carocoResiduoKg: dados.carocoResiduoKg,
      perdaKg: dados.perdaKg,
      observacao: dados.observacao ?? null,
    };
    await tx.ordemProducao.update({ where: { id }, data: novo });
    await auditar(sessao, tx, id, "ATUALIZAR", novo, {
      branqueamentoTemperaturaC: op.branqueamentoTemperaturaC === null ? null : Number(op.branqueamentoTemperaturaC),
      branqueamentoTempoS: op.branqueamentoTempoS,
      aguaLitros: Number(op.aguaLitros),
      carocoResiduoKg: Number(op.carocoResiduoKg),
      perdaKg: Number(op.perdaKg),
      observacao: op.observacao,
    });
  });
}

/**
 * Consumo de fruto (RN-09): baixa o lote na hora, com o custo do lote.
 * Recusa outra fruta (RN-14), saldo insuficiente (RN-19) e fruto vencido sem liberação.
 */
export async function adicionarConsumo(sessao: SessaoAtiva, opId: string, dados: ConsumoValues) {
  autorizar(sessao);
  const podeLiberar = podeExecutar(sessao.perfil, "producao:liberarVencido");

  return prisma.$transaction(async (tx) => {
    const op = await travarOP(tx, sessao.filialId, opId);
    const lote = await tx.lote.findFirst({
      where: { id: dados.loteId, filialId: sessao.filialId },
      include: {
        produto: { select: { categoria: true, frutaId: true } },
        recepcao: { select: { status: true } },
      },
    });
    if (!lote) throw new Error("Lote não encontrado");
    if (lote.produto.categoria !== "FRUTO") throw new Error(`O lote ${lote.codigo} não é de fruto`);
    if (lote.produto.frutaId !== op.frutaId) throw new Error(`O lote ${lote.codigo} é de outra fruta`);
    if (lote.recepcao?.status === "CANCELADA") throw new Error(`O lote ${lote.codigo} é de uma recepção excluída`);
    const repetido = await tx.consumoOP.count({ where: { ordemProducaoId: opId, loteId: lote.id, removidoEm: null } });
    if (repetido > 0) throw new Error(`O lote ${lote.codigo} já está nesta OP`);

    const vencido = loteVencidoNaData(lote.validade, op.data);
    if (vencido && (!podeLiberar || !dados.motivoLiberacaoVencido)) {
      throw new Error(`O lote ${lote.codigo} venceu em ${formatarData(lote.validade)}`);
    }
    // Motivo enviado para lote que não está vencido é descartado.
    const motivo = vencido ? (dados.motivoLiberacaoVencido ?? null) : null;

    const linha = await tx.consumoOP.create({
      data: {
        ordemProducaoId: opId,
        loteId: lote.id,
        quantidadeKg: dados.quantidadeKg,
        custoKg: lote.custoKg,
        motivoLiberacaoVencido: motivo,
      },
    });
    await registrarMovimento(tx, {
      filialId: sessao.filialId,
      loteId: lote.id,
      data: op.data,
      tipo: "CONSUMO_OP",
      quantidadeKg: -dados.quantidadeKg,
      usuarioId: sessao.usuarioId,
      consumoOpId: linha.id,
    });
    await recalcularCustoProvisorio(tx, opId);
    await auditar(sessao, tx, opId, "ADICIONAR_CONSUMO", {
      lote: lote.codigo,
      quantidadeKg: dados.quantidadeKg,
      custoKg: Number(lote.custoKg),
      motivoLiberacaoVencido: motivo,
    });
    return { id: linha.id };
  });
}

export async function removerConsumo(sessao: SessaoAtiva, consumoId: string): Promise<void> {
  autorizar(sessao);
  await prisma.$transaction(async (tx) => {
    const linha = await tx.consumoOP.findFirst({
      where: { id: consumoId, ordemProducao: { filialId: sessao.filialId } },
      include: { lote: { select: { codigo: true } } },
    });
    if (!linha) throw new Error("Linha não encontrada");
    const op = await travarOP(tx, sessao.filialId, linha.ordemProducaoId);
    if (linha.removidoEm) throw new Error("Linha já removida");

    await tx.consumoOP.update({ where: { id: consumoId }, data: { removidoEm: new Date() } });
    await registrarMovimento(tx, {
      filialId: sessao.filialId,
      loteId: linha.loteId,
      data: op.data,
      tipo: "ESTORNO_CONSUMO_OP",
      quantidadeKg: Number(linha.quantidadeKg),
      usuarioId: sessao.usuarioId,
      consumoOpId: linha.id,
    });
    await recalcularCustoProvisorio(tx, op.id);
    await auditar(sessao, tx, op.id, "REMOVER_CONSUMO", {
      lote: linha.lote.codigo,
      quantidadeKg: Number(linha.quantidadeKg),
    });
  });
}

/**
 * Polpa produzida: cria o lote de polpa na hora (código e validade pela data
 * da OP, RN-07/RN-08), bloqueado para venda e ajuste até a OP encerrar (D-07).
 */
export async function adicionarProducao(sessao: SessaoAtiva, opId: string, dados: ProducaoValues) {
  autorizar(sessao);
  const produto = await prisma.produto.findFirst({
    where: { id: dados.produtoId, empresaId: sessao.empresaId, ativo: true, categoria: "POLPA" },
    select: { id: true, codigo: true, descricao: true, frutaId: true, validadeDias: true },
  });
  if (!produto) throw new Error("Produto de polpa não encontrado ou inativo");
  const local = await prisma.localArmazenamento.findFirst({
    where: { id: dados.localId, filialId: sessao.filialId, ativo: true },
    select: { id: true, nome: true },
  });
  if (!local) throw new Error("Local de armazenamento não encontrado ou inativo");

  for (let tentativa = 1; ; tentativa++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const op = await travarOP(tx, sessao.filialId, opId);
        if (produto.frutaId !== op.frutaId) throw new Error("O produto é de outra fruta");

        const prefixo = prefixoDoLote(produto.codigo, op.data);
        const existentes = await tx.lote.findMany({
          where: { filialId: sessao.filialId, codigo: { startsWith: `${prefixo}-` } },
          select: { codigo: true },
        });
        const codigo = proximoCodigoDeLote(
          prefixo,
          existentes.map((l) => l.codigo),
        );
        const lote = await tx.lote.create({
          data: {
            filialId: sessao.filialId,
            codigo,
            produtoId: produto.id,
            origem: "PRODUCAO",
            data: op.data,
            validade: calcularValidade(op.data, produto.validadeDias),
            localId: local.id,
            quantidadeInicialKg: dados.quantidadeKg,
            saldoKg: 0,
            custoKg: 0,
          },
        });
        const linha = await tx.producaoOP.create({
          data: {
            ordemProducaoId: opId,
            loteId: lote.id,
            produtoId: produto.id,
            quantidadeKg: dados.quantidadeKg,
            embalagens: dados.embalagens ?? null,
            localId: local.id,
          },
        });
        await registrarMovimento(tx, {
          filialId: sessao.filialId,
          loteId: lote.id,
          data: op.data,
          tipo: "PRODUCAO_OP",
          quantidadeKg: dados.quantidadeKg,
          usuarioId: sessao.usuarioId,
          producaoOpId: linha.id,
        });
        await recalcularCustoProvisorio(tx, opId);
        await auditar(sessao, tx, opId, "ADICIONAR_PRODUCAO", {
          lote: codigo,
          produto: produto.descricao,
          quantidadeKg: dados.quantidadeKg,
          embalagens: dados.embalagens ?? null,
          local: local.nome,
        });
        return { id: linha.id, loteId: lote.id, codigoLote: codigo };
      });
    } catch (erro) {
      // Outro lote do mesmo produto e dia pegou o código antes: refaz com o próximo.
      if (!conflitoDeNumero(erro) || tentativa >= TENTATIVAS_NUMERACAO) throw erro;
    }
  }
}

/** Remove a polpa: o lote fica zerado (o código nunca é reaproveitado) e a linha marcada. */
export async function removerProducao(sessao: SessaoAtiva, producaoId: string): Promise<void> {
  autorizar(sessao);
  await prisma.$transaction(async (tx) => {
    const linha = await tx.producaoOP.findFirst({
      where: { id: producaoId, ordemProducao: { filialId: sessao.filialId } },
      include: { lote: { select: { codigo: true, saldoKg: true } } },
    });
    if (!linha) throw new Error("Linha não encontrada");
    const op = await travarOP(tx, sessao.filialId, linha.ordemProducaoId);
    if (linha.removidoEm) throw new Error("Linha já removida");

    await tx.producaoOP.update({ where: { id: producaoId }, data: { removidoEm: new Date() } });
    await registrarMovimento(tx, {
      filialId: sessao.filialId,
      loteId: linha.loteId,
      data: op.data,
      tipo: "ESTORNO_PRODUCAO_OP",
      quantidadeKg: -Number(linha.lote.saldoKg),
      usuarioId: sessao.usuarioId,
      producaoOpId: linha.id,
    });
    await recalcularCustoProvisorio(tx, op.id);
    await auditar(sessao, tx, op.id, "REMOVER_PRODUCAO", {
      lote: linha.lote.codigo,
      quantidadeKg: Number(linha.quantidadeKg),
    });
  });
}

/** Insumo da OP com o custo unitário do cadastro naquele momento (D-05). */
export async function adicionarInsumo(sessao: SessaoAtiva, opId: string, dados: InsumoOPValues) {
  autorizar(sessao);
  const insumo = await prisma.insumo.findFirst({
    where: { id: dados.insumoId, empresaId: sessao.empresaId, ativo: true },
  });
  if (!insumo) throw new Error("Insumo não encontrado ou inativo");

  return prisma.$transaction(async (tx) => {
    await travarOP(tx, sessao.filialId, opId);
    const linha = await tx.insumoOP.create({
      data: {
        ordemProducaoId: opId,
        insumoId: insumo.id,
        quantidade: dados.quantidade,
        custoUnitario: insumo.custoUnitario,
      },
    });
    await recalcularCustoProvisorio(tx, opId);
    await auditar(sessao, tx, opId, "ADICIONAR_INSUMO", {
      insumo: insumo.nome,
      quantidade: dados.quantidade,
      custoUnitario: Number(insumo.custoUnitario),
    });
    return { id: linha.id };
  });
}

export async function removerInsumo(sessao: SessaoAtiva, insumoOpId: string): Promise<void> {
  autorizar(sessao);
  await prisma.$transaction(async (tx) => {
    const linha = await tx.insumoOP.findFirst({
      where: { id: insumoOpId, ordemProducao: { filialId: sessao.filialId } },
      include: { insumo: { select: { nome: true } } },
    });
    if (!linha) throw new Error("Linha não encontrada");
    const op = await travarOP(tx, sessao.filialId, linha.ordemProducaoId);
    if (linha.removidoEm) throw new Error("Linha já removida");

    await tx.insumoOP.update({ where: { id: insumoOpId }, data: { removidoEm: new Date() } });
    await recalcularCustoProvisorio(tx, op.id);
    await auditar(sessao, tx, op.id, "REMOVER_INSUMO", {
      insumo: linha.insumo.nome,
      quantidade: Number(linha.quantidade),
    });
  });
}

export type SituacaoDesfazer = { pode: true } | { pode: false; motivo: string };

/** Reabrir e cancelar só enquanto nenhum lote de polpa da OP teve venda ou ajuste (mesmo desfeitos depois). */
export async function situacaoParaDesfazer(
  op: { id: string; status: StatusOrdemProducao },
  db: ClientePrisma = prisma,
): Promise<SituacaoDesfazer> {
  if (op.status === "CANCELADA") return { pode: false, motivo: "A OP já está cancelada" };
  const saida = await db.movimentoEstoque.findFirst({
    where: {
      lote: { producaoOP: { is: { ordemProducaoId: op.id } } },
      tipo: { notIn: ["PRODUCAO_OP", "ESTORNO_PRODUCAO_OP"] },
    },
    select: { lote: { select: { codigo: true } } },
  });
  return saida ? { pode: false, motivo: `O lote ${saida.lote.codigo} já teve venda ou ajuste` } : { pode: true };
}

export function dadosDoResumo(
  op: {
    fruta: { exigeBranqueamento: boolean };
    branqueamentoTemperaturaC: Prisma.Decimal | null;
    branqueamentoTempoS: number | null;
    aguaLitros: Prisma.Decimal;
    carocoResiduoKg: Prisma.Decimal;
    perdaKg: Prisma.Decimal;
  },
  linhas: LinhasOP,
): DadosResumoOP {
  return {
    exigeBranqueamento: op.fruta.exigeBranqueamento,
    branqueamentoTemperaturaC: op.branqueamentoTemperaturaC === null ? null : Number(op.branqueamentoTemperaturaC),
    branqueamentoTempoS: op.branqueamentoTempoS,
    aguaLitros: Number(op.aguaLitros),
    carocoResiduoKg: Number(op.carocoResiduoKg),
    perdaKg: Number(op.perdaKg),
    ...linhas,
  };
}

/**
 * Encerra a OP: grava o custo (RN-13) e o custo/kg final nos lotes de polpa,
 * que ficam liberados para venda e ajuste (D-07). Balanço ou branqueamento
 * "Verificar" exigem confirmação explícita, registrada na auditoria.
 */
export async function encerrarOP(
  sessao: SessaoAtiva,
  id: string,
  opcoes: { confirmarVerificar: boolean },
): Promise<void> {
  autorizar(sessao);
  const configuracao = await obterConfiguracaoProducao(sessao.filialId);

  await prisma.$transaction(async (tx) => {
    const op = await travarOP(tx, sessao.filialId, id);
    const linhas = await linhasAtivas(tx, id);
    if (linhas.consumos.length === 0) throw new Error("Lance ao menos um consumo de fruto");
    if (linhas.producoes.length === 0) throw new Error("Lance ao menos uma produção de polpa");

    const resumo = resumirOP(dadosDoResumo(op, linhas), configuracao);
    if (resumo.aVerificar.length > 0 && !opcoes.confirmarVerificar) {
      throw new Error(`Confirme para encerrar com itens a verificar: ${resumo.aVerificar.join(", ")}`);
    }

    await tx.ordemProducao.update({
      where: { id },
      data: {
        status: "ENCERRADA",
        encerradaEm: new Date(),
        custoFrutoTotal: resumo.custo.custoFrutoTotal,
        custoInsumosTotal: resumo.custo.custoInsumosTotal,
        custoKgPolpa: resumo.custo.custoKgPolpa,
      },
    });
    await tx.lote.updateMany({
      where: { producaoOP: { is: { ordemProducaoId: id, removidoEm: null } } },
      data: { custoKg: resumo.custo.custoKgPolpa },
    });
    await auditar(
      sessao,
      tx,
      id,
      "ENCERRAR",
      {
        status: "ENCERRADA",
        custo: resumo.custo,
        rendimento: resumo.rendimento,
        balanco: resumo.balanco,
        branqueamento: resumo.branqueamento,
        confirmouVerificar: resumo.aVerificar.length > 0,
      },
      { status: op.status },
    );
  });
}

function motivoValido(motivo: string, mensagem: string): string {
  const limpo = motivo.trim();
  if (limpo.length < 3) throw new Error(mensagem);
  return limpo;
}

/** Volta a OP encerrada para aberta, se a polpa não saiu: a polpa é bloqueada de novo e os custos são limpos. */
export async function reabrirOP(sessao: SessaoAtiva, id: string, motivo: string): Promise<void> {
  autorizar(sessao);
  const motivoLimpo = motivoValido(motivo, "Informe o motivo da reabertura");

  await prisma.$transaction(async (tx) => {
    const op = await travarOP(tx, sessao.filialId, id, ["ENCERRADA"]);
    const situacao = await situacaoParaDesfazer(op, tx);
    if (!situacao.pode) throw new Error(situacao.motivo);

    await tx.ordemProducao.update({
      where: { id },
      data: {
        status: "ABERTA",
        encerradaEm: null,
        custoFrutoTotal: null,
        custoInsumosTotal: null,
        custoKgPolpa: null,
        motivoReabertura: motivoLimpo,
      },
    });
    await auditar(
      sessao,
      tx,
      id,
      "REABRIR",
      { status: "ABERTA", motivo: motivoLimpo },
      {
        status: op.status,
        custoKgPolpa: op.custoKgPolpa === null ? null : Number(op.custoKgPolpa),
      },
    );
  });
}

/** Desfaz a OP (aberta ou encerrada, se a polpa não saiu): devolve o fruto e zera os lotes de polpa. */
export async function cancelarOP(sessao: SessaoAtiva, id: string, motivo: string): Promise<void> {
  autorizar(sessao);
  const motivoLimpo = motivoValido(motivo, "Informe o motivo do cancelamento");

  await prisma.$transaction(async (tx) => {
    const op = await travarOP(tx, sessao.filialId, id, ["ABERTA", "ENCERRADA"]);
    const situacao = await situacaoParaDesfazer(op, tx);
    if (!situacao.pode) throw new Error(situacao.motivo);

    const consumos = await tx.consumoOP.findMany({ where: { ordemProducaoId: id, removidoEm: null } });
    for (const consumo of consumos) {
      await registrarMovimento(tx, {
        filialId: sessao.filialId,
        loteId: consumo.loteId,
        data: op.data,
        tipo: "ESTORNO_CONSUMO_OP",
        quantidadeKg: Number(consumo.quantidadeKg),
        usuarioId: sessao.usuarioId,
        consumoOpId: consumo.id,
      });
    }
    const producoes = await tx.producaoOP.findMany({
      where: { ordemProducaoId: id, removidoEm: null },
      include: { lote: { select: { saldoKg: true } } },
    });
    for (const producao of producoes) {
      await registrarMovimento(tx, {
        filialId: sessao.filialId,
        loteId: producao.loteId,
        data: op.data,
        tipo: "ESTORNO_PRODUCAO_OP",
        quantidadeKg: -Number(producao.lote.saldoKg),
        usuarioId: sessao.usuarioId,
        producaoOpId: producao.id,
      });
    }

    await tx.ordemProducao.update({
      where: { id },
      data: { status: "CANCELADA", motivoCancelamento: motivoLimpo, canceladaEm: new Date() },
    });
    await auditar(
      sessao,
      tx,
      id,
      "CANCELAR",
      { status: "CANCELADA", motivo: motivoLimpo, consumosEstornados: consumos.length, polpasZeradas: producoes.length },
      { status: op.status },
    );
  });
}

const LINHAS_ATIVAS = { where: { removidoEm: null } } as const;

/** Resumo da OP; encerrada usa o custo gravado, as demais o calculado agora (provisório). */
function resumoComCustoGravado(
  op: Parameters<typeof dadosDoResumo>[0] & {
    status: StatusOrdemProducao;
    custoFrutoTotal: Prisma.Decimal | null;
    custoInsumosTotal: Prisma.Decimal | null;
    custoKgPolpa: Prisma.Decimal | null;
  },
  linhas: LinhasOP,
  configuracao: ConfiguracaoResumo,
): ResumoOP {
  const resumo = resumirOP(dadosDoResumo(op, linhas), configuracao);
  if (op.status !== "ENCERRADA" || op.custoKgPolpa === null) return resumo;
  const custoFrutoTotal = Number(op.custoFrutoTotal);
  const custoInsumosTotal = Number(op.custoInsumosTotal);
  return {
    ...resumo,
    custo: {
      custoFrutoTotal,
      custoInsumosTotal,
      custoTotal: arredondar(custoFrutoTotal + custoInsumosTotal, 2),
      custoKgPolpa: Number(op.custoKgPolpa),
    },
  };
}

export function linhasEmNumeros(op: {
  consumos: { quantidadeKg: Prisma.Decimal; custoKg: Prisma.Decimal }[];
  producoes: { quantidadeKg: Prisma.Decimal }[];
  insumos: { quantidade: Prisma.Decimal; custoUnitario: Prisma.Decimal }[];
}): LinhasOP {
  return {
    consumos: op.consumos.map((c) => ({ quantidadeKg: Number(c.quantidadeKg), custoKg: Number(c.custoKg) })),
    producoes: op.producoes.map((p) => ({ quantidadeKg: Number(p.quantidadeKg) })),
    insumos: op.insumos.map((i) => ({ quantidade: Number(i.quantidade), custoUnitario: Number(i.custoUnitario) })),
  };
}

export type FiltroOPs = {
  inicio: Date;
  fim: Date;
  frutaId?: string;
  status?: StatusOrdemProducao;
  /** Só OPs não canceladas com balanço (RN-11) ou branqueamento (RN-12) "Verificar". */
  verificar?: VerificarOP;
};

export async function listarOPs(filialId: string, filtros: FiltroOPs) {
  const configuracao = await obterConfiguracaoProducao(filialId);
  const ops = await prisma.ordemProducao.findMany({
    where: {
      filialId,
      data: { gte: filtros.inicio, lte: filtros.fim },
      ...(filtros.frutaId ? { frutaId: filtros.frutaId } : {}),
      ...(filtros.status ? { status: filtros.status } : {}),
    },
    include: {
      fruta: { select: { nome: true, exigeBranqueamento: true } },
      consumos: { ...LINHAS_ATIVAS, select: { quantidadeKg: true, custoKg: true } },
      producoes: { ...LINHAS_ATIVAS, select: { quantidadeKg: true } },
      insumos: { ...LINHAS_ATIVAS, select: { quantidade: true, custoUnitario: true } },
    },
    orderBy: [{ data: "desc" }, { numero: "desc" }],
  });
  const listadas = ops.map(({ consumos, producoes, insumos, ...op }) => ({
    ...op,
    resumo: resumoComCustoGravado(op, linhasEmNumeros({ consumos, producoes, insumos }), configuracao),
  }));
  if (!filtros.verificar) return listadas;
  return listadas.filter(
    (op) =>
      op.status !== "CANCELADA" &&
      (filtros.verificar === "balanco"
        ? op.resumo.balanco.status === "VERIFICAR"
        : op.resumo.branqueamento === "VERIFICAR"),
  );
}

export type OPListada = Awaited<ReturnType<typeof listarOPs>>[number];

export async function obterOP(filialId: string, numero: string) {
  const op = await prisma.ordemProducao.findUnique({
    where: { filialId_numero: { filialId, numero } },
    include: {
      fruta: { select: { id: true, nome: true, exigeBranqueamento: true } },
      usuario: { select: { nome: true } },
      consumos: {
        ...LINHAS_ATIVAS,
        include: {
          lote: { select: { id: true, codigo: true, validade: true, produto: { select: { descricao: true } } } },
        },
        orderBy: { criadoEm: "asc" },
      },
      producoes: {
        ...LINHAS_ATIVAS,
        include: {
          lote: { select: { id: true, codigo: true, validade: true } },
          produto: { select: { codigo: true, descricao: true } },
          local: { select: { nome: true } },
        },
        orderBy: { criadoEm: "asc" },
      },
      insumos: {
        ...LINHAS_ATIVAS,
        include: { insumo: { select: { nome: true, unidade: true } } },
        orderBy: { criadoEm: "asc" },
      },
    },
  });
  if (!op) return null;
  const configuracao = await obterConfiguracaoProducao(filialId);
  return {
    ...op,
    resumo: resumoComCustoGravado(op, linhasEmNumeros(op), configuracao),
    situacaoDesfazer: await situacaoParaDesfazer(op),
  };
}

export type OPDetalhada = NonNullable<Awaited<ReturnType<typeof obterOP>>>;

/** Lotes de fruto da fruta com saldo, em ordem FEFO (RN-27), com a marca de vencido na data da OP. */
export async function lotesParaConsumo(filialId: string, frutaId: string, data: Date) {
  const lotes = await prisma.lote.findMany({
    where: {
      filialId,
      saldoKg: { gt: 0 },
      produto: { categoria: "FRUTO", frutaId },
      OR: [{ recepcao: { is: null } }, { recepcao: { is: { status: "ATIVA" } } }],
    },
    include: { produto: { select: { codigo: true, descricao: true } } },
    orderBy: [{ validade: "asc" }, { codigo: "asc" }],
  });
  return lotes.map((lote) => ({
    id: lote.id,
    codigo: lote.codigo,
    saldoKg: Number(lote.saldoKg),
    custoKg: Number(lote.custoKg),
    validade: lote.validade,
    vencido: loteVencidoNaData(lote.validade, data),
    produto: lote.produto,
  }));
}

export type LoteParaConsumo = Awaited<ReturnType<typeof lotesParaConsumo>>[number];
