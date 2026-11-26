import { randomUUID } from "crypto";
import { prisma } from "@/server/db/client";
import { requirePermission, requireAlteracaoFilial } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type {
  LancamentoManualFormValues,
  TransferenciaFormValues,
  SaldoBancarioFormValues,
} from "@/lib/schemas/lancamentoBancario";
import { SEM_VALOR } from "@/lib/schemas/enums";
import {
  garantirComprovanteValido,
  whereLancamentoPorClassificacao,
  type FiltroClassificacao,
} from "@/server/services/classificacaoFiscal";
import {
  argumentosDeCursor,
  CursorInvalidoError,
  montarPagina,
  type Paginacao,
} from "@/server/services/paginacao";
import { validarReferenciasDoLancamento } from "@/server/services/referenciasDoLancamento";
import { nomeDaContaBancaria } from "@/lib/contaBancaria";
import { Prisma, type LancamentoBancario, type TipoComprovante } from "@prisma/client";

function normalizarOpcional<T extends string>(valor: T | typeof SEM_VALOR | undefined): T | null {
  return valor && valor.length > 0 && valor !== SEM_VALOR ? valor : null;
}

/**
 * A FK só prova que a conta existe em alguma filial — sem este escopo um
 * lançamento poderia ser criado contra a conta bancária de outro tenant.
 */
async function buscarContaDaFilial(filialId: string, contaBancariaId: string) {
  const conta = await prisma.contaBancaria.findFirst({ where: { id: contaBancariaId, filialId } });
  if (!conta) {
    throw new Error("Conta bancária não pertence à filial ativa");
  }
  return conta;
}

export const MSG_LANCAMENTO_NAO_ENCONTRADO = "Lançamento não encontrado na filial ativa";
export const MSG_BAIXA_NAO_SE_CORRIGE = "Lançamento de baixa: corrija estornando a baixa";
export const MSG_CORRIDA_CONCILIACAO =
  "O lançamento foi conciliado ou desconciliado agora há pouco. Abra de novo e confira.";
const MSG_MANUAL_CONCILIADO_EDITAR =
  "Este lançamento está conciliado com o extrato: só descrição e classificação podem mudar. " +
  "Desconcilie na Conciliação para mudar conta, tipo, data ou valor.";

/** O formulário manda só o dia (meia-noite UTC); a linha do extrato pode ter hora. */
function mesmoDiaUtc(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

/** Campos que a correção pode mudar, no formato gravado na auditoria. */
function camposEditaveis(l: LancamentoBancario) {
  return {
    contaBancariaId: l.contaBancariaId,
    tipo: l.tipo,
    data: l.data,
    valor: l.valor,
    descricao: l.descricao,
    categoriaFinanceiraId: l.categoriaFinanceiraId,
    centroCustoId: l.centroCustoId,
    centroLucroId: l.centroLucroId,
    safraId: l.safraId,
    projetoId: l.projetoId,
    classificacaoFiscal: l.classificacaoFiscal,
    tipoComprovante: l.tipoComprovante,
    numeroComprovante: l.numeroComprovante,
  };
}

/** O registro inteiro (sem relações), para a auditoria da exclusão. */
function registroParaAuditoria(l: LancamentoBancario) {
  return { ...l, valor: l.valor.toString(), data: l.data.toISOString(), criadoEm: l.criadoEm.toISOString() };
}

/** `id` desempata lançamentos da mesma data — sem ele a paginação repete ou pula itens. */
const ORDEM_LISTAGEM_LANCAMENTOS: Prisma.LancamentoBancarioOrderByWithRelationInput[] = [
  { data: "desc" },
  { id: "desc" },
];

export async function listarLancamentos(filialId: string, opcoes: { classificacao?: FiltroClassificacao } = {}) {
  return prisma.lancamentoBancario.findMany({
    where: { filialId, ...whereLancamentoPorClassificacao(opcoes.classificacao) },
    include: { contaBancaria: { include: { banco: true } } },
    orderBy: ORDEM_LISTAGEM_LANCAMENTOS,
  });
}

/** Versão da API: uma página por vez, ordenada por data (mais recente primeiro). */
export async function listarLancamentosPaginado(
  filialId: string,
  opcoes: { classificacao?: FiltroClassificacao },
  paginacao: Paginacao,
) {
  const where = { filialId, ...whereLancamentoPorClassificacao(opcoes.classificacao) };
  if (paginacao.cursor) {
    // O cursor tem de estar dentro da própria listagem (filtro incluído), senão o skip: 1 pula uma linha válida.
    const doCursor = await prisma.lancamentoBancario.findFirst({
      where: { ...where, id: paginacao.cursor },
      select: { id: true },
    });
    if (!doCursor) throw new CursorInvalidoError();
  }

  const linhas = await prisma.lancamentoBancario.findMany({
    where,
    include: { contaBancaria: { include: { banco: true } } },
    orderBy: ORDEM_LISTAGEM_LANCAMENTOS,
    ...argumentosDeCursor(paginacao),
  });
  return montarPagina(linhas, paginacao.limite);
}

export async function calcularSaldoContabil(contaBancariaId: string): Promise<number> {
  const conta = await prisma.contaBancaria.findUniqueOrThrow({ where: { id: contaBancariaId } });

  const somas = await prisma.lancamentoBancario.groupBy({
    by: ["tipo"],
    where: { contaBancariaId },
    _sum: { valor: true },
  });

  const entrada = Number(somas.find((s) => s.tipo === "ENTRADA")?._sum.valor ?? 0);
  const saida = Number(somas.find((s) => s.tipo === "SAIDA")?._sum.valor ?? 0);

  return Number(conta.saldoInicial) + entrada - saida;
}

export async function buscarUltimoSaldoInformado(contaBancariaId: string) {
  return prisma.saldoBancarioInformado.findFirst({
    where: { contaBancariaId },
    orderBy: { data: "desc" },
  });
}

export async function listarResumoContas(filialId: string) {
  const contas = await prisma.contaBancaria.findMany({
    where: { filialId, ativo: true },
    include: { banco: true },
    orderBy: { criadoEm: "asc" },
  });

  return Promise.all(
    contas.map(async (conta) => ({
      conta,
      saldoContabil: await calcularSaldoContabil(conta.id),
      ultimoSaldoInformado: await buscarUltimoSaldoInformado(conta.id),
    })),
  );
}

export async function criarLancamentoManual(sessao: SessaoAtiva, dados: LancamentoManualFormValues) {
  requirePermission(sessao.perfil, "lancamento:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const conta = await buscarContaDaFilial(sessao.filialId, dados.contaBancariaId);

  const categoriaFinanceiraId = normalizarOpcional(dados.categoriaFinanceiraId);
  const centroCustoId = normalizarOpcional(dados.centroCustoId);
  const centroLucroId = normalizarOpcional(dados.centroLucroId);
  const safraId = normalizarOpcional(dados.safraId);
  const projetoId = normalizarOpcional(dados.projetoId);
  await validarReferenciasDoLancamento(sessao.filialId, {
    categoriaFinanceiraId,
    centroCustoId,
    centroLucroId,
    safraId,
    projetoId,
  });

  const classificacaoFiscal = dados.classificacaoFiscal ?? "FISCAL";
  const tipoComprovante = normalizarOpcional(dados.tipoComprovante) as TipoComprovante | null;
  garantirComprovanteValido({ classificacaoFiscal, tipoComprovante });

  const dadosNormalizados = {
    filialId: sessao.filialId,
    contaBancariaId: dados.contaBancariaId,
    data: dados.data,
    tipo: dados.tipo,
    valor: dados.valor,
    descricao: dados.descricao,
    origem: "MANUAL" as const,
    categoriaFinanceiraId,
    centroCustoId,
    centroLucroId,
    safraId,
    projetoId,
    classificacaoFiscal,
    tipoComprovante,
    numeroComprovante: normalizarOpcional(dados.numeroComprovante),
    // Dinheiro em espécie não tem extrato: entra direto no realizado.
    conciliado: conta.tipo === "CAIXA",
    usuarioId: sessao.usuarioId,
  };

  const lancamento = await prisma.lancamentoBancario.create({ data: dadosNormalizados });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "LancamentoBancario",
    entidadeId: lancamento.id,
    acao: "CRIAR",
    anterior: null,
    novo: dadosNormalizados,
  });

  return lancamento;
}

export async function criarTransferencia(sessao: SessaoAtiva, dados: TransferenciaFormValues) {
  requirePermission(sessao.perfil, "lancamento:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const contaOrigem = await buscarContaDaFilial(sessao.filialId, dados.contaOrigemId);
  const contaDestino = await buscarContaDaFilial(sessao.filialId, dados.contaDestinoId);

  const transferenciaId = randomUUID();

  const [saida, entrada] = await prisma.$transaction([
    prisma.lancamentoBancario.create({
      data: {
        filialId: sessao.filialId,
        contaBancariaId: dados.contaOrigemId,
        data: dados.data,
        tipo: "SAIDA",
        valor: dados.valor,
        descricao: dados.descricao,
        origem: "TRANSFERENCIA",
        transferenciaId,
        // Transferência não é receita nem despesa: fica fora dos filtros Fiscal/Gerencial.
        classificacaoFiscal: null,
        // Só o lado da conta Caixa nasce conciliado; o lado do banco espera o extrato.
        conciliado: contaOrigem.tipo === "CAIXA",
        usuarioId: sessao.usuarioId,
      },
    }),
    prisma.lancamentoBancario.create({
      data: {
        filialId: sessao.filialId,
        contaBancariaId: dados.contaDestinoId,
        data: dados.data,
        tipo: "ENTRADA",
        valor: dados.valor,
        descricao: dados.descricao,
        origem: "TRANSFERENCIA",
        transferenciaId,
        classificacaoFiscal: null,
        conciliado: contaDestino.tipo === "CAIXA",
        usuarioId: sessao.usuarioId,
      },
    }),
  ]);

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "LancamentoBancario",
    entidadeId: saida.id,
    acao: "TRANSFERIR",
    anterior: null,
    novo: {
      transferenciaId,
      contaOrigemId: dados.contaOrigemId,
      contaDestinoId: dados.contaDestinoId,
      valor: dados.valor,
      descricao: dados.descricao,
    },
  });

  return { saida, entrada };
}

/**
 * Corrige um lançamento manual. Ligado ao extrato (com grupo de conciliação),
 * só a classificação muda: conta, tipo, data e valor foram confirmados pelo
 * banco, e para mudá-los é preciso desconciliar antes.
 */
export async function editarLancamentoManual(sessao: SessaoAtiva, id: string, dados: LancamentoManualFormValues) {
  requirePermission(sessao.perfil, "lancamento:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const atual = await prisma.lancamentoBancario.findFirst({ where: { id, filialId: sessao.filialId } });
  if (!atual) throw new Error(MSG_LANCAMENTO_NAO_ENCONTRADO);
  if (atual.origem === "BAIXA") throw new Error(MSG_BAIXA_NAO_SE_CORRIGE);
  if (atual.origem === "TRANSFERENCIA") {
    throw new Error("Transferência: corrija pela transferência, que muda os dois lados juntos");
  }

  const conta = await buscarContaDaFilial(sessao.filialId, dados.contaBancariaId);

  const referencias = {
    categoriaFinanceiraId: normalizarOpcional(dados.categoriaFinanceiraId),
    centroCustoId: normalizarOpcional(dados.centroCustoId),
    centroLucroId: normalizarOpcional(dados.centroLucroId),
    safraId: normalizarOpcional(dados.safraId),
    projetoId: normalizarOpcional(dados.projetoId),
  };
  await validarReferenciasDoLancamento(sessao.filialId, referencias);

  const classificacaoFiscal = dados.classificacaoFiscal ?? "FISCAL";
  const tipoComprovante = normalizarOpcional(dados.tipoComprovante) as TipoComprovante | null;
  garantirComprovanteValido({ classificacaoFiscal, tipoComprovante });

  const valor = new Prisma.Decimal(dados.valor);
  const mesmoDia = mesmoDiaUtc(dados.data, atual.data);
  const mudouMovimento =
    conta.id !== atual.contaBancariaId || dados.tipo !== atual.tipo || !mesmoDia || !valor.equals(atual.valor);
  const ligadoAoExtrato = atual.grupoConciliacaoId !== null;
  if (ligadoAoExtrato && mudouMovimento) throw new Error(MSG_MANUAL_CONCILIADO_EDITAR);

  const novo = {
    descricao: dados.descricao,
    ...referencias,
    classificacaoFiscal,
    tipoComprovante,
    numeroComprovante: normalizarOpcional(dados.numeroComprovante),
    ...(ligadoAoExtrato
      ? {}
      : {
          contaBancariaId: conta.id,
          tipo: dados.tipo,
          data: mesmoDia ? atual.data : dados.data,
          valor,
          // Mesma regra da criação: dinheiro em espécie não tem extrato.
          conciliado: conta.tipo === "CAIXA",
        }),
  };

  // O filtro pelo grupo lido evita gravar por cima de uma conciliação (ou desconciliação) feita no meio do caminho.
  const { count } = await prisma.lancamentoBancario.updateMany({
    where: { id, filialId: sessao.filialId, grupoConciliacaoId: atual.grupoConciliacaoId },
    data: novo,
  });
  if (count === 0) throw new Error(MSG_CORRIDA_CONCILIACAO);

  const gravado = await prisma.lancamentoBancario.findUniqueOrThrow({ where: { id } });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "LancamentoBancario",
    entidadeId: id,
    acao: "EDITAR",
    anterior: camposEditaveis(atual),
    novo: camposEditaveis(gravado),
  });

  return gravado;
}

const INCLUI_CONTA = { contaBancaria: { include: { banco: true } } } as const;

async function buscarLadosDaTransferencia(filialId: string, transferenciaId: string) {
  const lados = await prisma.lancamentoBancario.findMany({
    where: { transferenciaId, filialId, origem: "TRANSFERENCIA" },
    include: INCLUI_CONTA,
  });
  const saida = lados.find((l) => l.tipo === "SAIDA");
  const entrada = lados.find((l) => l.tipo === "ENTRADA");
  if (lados.length !== 2 || !saida || !entrada) throw new Error("Transferência não encontrada na filial ativa");
  return { saida, entrada };
}

/** Corrige os dois lados juntos. Com algum lado ligado ao extrato, só a descrição muda. */
export async function editarTransferencia(sessao: SessaoAtiva, transferenciaId: string, dados: TransferenciaFormValues) {
  requirePermission(sessao.perfil, "lancamento:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const { saida, entrada } = await buscarLadosDaTransferencia(sessao.filialId, transferenciaId);
  const contaOrigem = await buscarContaDaFilial(sessao.filialId, dados.contaOrigemId);
  const contaDestino = await buscarContaDaFilial(sessao.filialId, dados.contaDestinoId);

  const valor = new Prisma.Decimal(dados.valor);
  const mesmoDia = mesmoDiaUtc(dados.data, saida.data);
  const mudouMovimento =
    contaOrigem.id !== saida.contaBancariaId ||
    contaDestino.id !== entrada.contaBancariaId ||
    !mesmoDia ||
    !valor.equals(saida.valor);
  const ladoConciliado = [saida, entrada].find((l) => l.grupoConciliacaoId !== null);
  if (ladoConciliado && mudouMovimento) {
    throw new Error(
      `Esta transferência está conciliada com o extrato (lado de ${nomeDaContaBancaria(ladoConciliado.contaBancaria)}): ` +
        "só a descrição pode mudar. Desconcilie na Conciliação para mudar contas, data ou valor.",
    );
  }

  const data = mesmoDia ? saida.data : dados.data;
  const lados = [
    { lado: saida, conta: contaOrigem },
    { lado: entrada, conta: contaDestino },
  ];

  await prisma.$transaction(async (tx) => {
    // Em sequência (nada de Promise.all dentro da transação).
    for (const { lado, conta } of lados) {
      const { count } = await tx.lancamentoBancario.updateMany({
        where: { id: lado.id, filialId: sessao.filialId, grupoConciliacaoId: lado.grupoConciliacaoId },
        data: ladoConciliado
          ? { descricao: dados.descricao }
          : { descricao: dados.descricao, contaBancariaId: conta.id, data, valor, conciliado: conta.tipo === "CAIXA" },
      });
      if (count === 0) throw new Error(MSG_CORRIDA_CONCILIACAO);
    }
    await registrarAuditoria(
      {
        empresaId: sessao.empresaId,
        filialId: sessao.filialId,
        usuarioId: sessao.usuarioId,
        entidade: "LancamentoBancario",
        entidadeId: saida.id,
        acao: "EDITAR_TRANSFERENCIA",
        anterior: {
          transferenciaId,
          contaOrigemId: saida.contaBancariaId,
          contaDestinoId: entrada.contaBancariaId,
          data: saida.data,
          valor: saida.valor,
          descricao: saida.descricao,
        },
        novo: {
          transferenciaId,
          contaOrigemId: ladoConciliado ? saida.contaBancariaId : contaOrigem.id,
          contaDestinoId: ladoConciliado ? entrada.contaBancariaId : contaDestino.id,
          data: ladoConciliado ? saida.data : data,
          valor: ladoConciliado ? saida.valor : valor,
          descricao: dados.descricao,
        },
      },
      tx,
    );
  });
}

/**
 * Apaga um lançamento manual, ou os dois lados de uma transferência. A
 * auditoria guarda o registro inteiro e o motivo. Ligado ao extrato não se
 * exclui: desconcilie antes.
 */
export async function excluirLancamento(sessao: SessaoAtiva, id: string, motivo: string) {
  requirePermission(sessao.perfil, "lancamento:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const motivoLimpo = motivo.trim();
  if (!motivoLimpo) throw new Error("Informe o motivo da exclusão");
  if (motivoLimpo.length > 500) throw new Error("O motivo pode ter até 500 caracteres");

  const alvo = await prisma.lancamentoBancario.findFirst({
    where: { id, filialId: sessao.filialId },
    include: INCLUI_CONTA,
  });
  if (!alvo) throw new Error(MSG_LANCAMENTO_NAO_ENCONTRADO);
  if (alvo.origem === "BAIXA") throw new Error(MSG_BAIXA_NAO_SE_CORRIGE);

  const ehTransferencia = alvo.origem === "TRANSFERENCIA" && alvo.transferenciaId !== null;
  const lados = ehTransferencia
    ? Object.values(await buscarLadosDaTransferencia(sessao.filialId, alvo.transferenciaId!))
    : [alvo];

  const conciliado = lados.find((l) => l.grupoConciliacaoId !== null);
  if (conciliado) {
    throw new Error(
      ehTransferencia
        ? `Esta transferência está conciliada com o extrato (lado de ${nomeDaContaBancaria(conciliado.contaBancaria)}). ` +
            "Desconcilie na Conciliação antes de excluir."
        : "Este lançamento está conciliado com o extrato. Desconcilie na Conciliação antes de excluir.",
    );
  }

  const ids = lados.map((l) => l.id);
  const semConta = lados.map((l) => {
    const { contaBancaria, ...registro } = l;
    void contaBancaria;
    return registroParaAuditoria(registro);
  });
  const saida = lados.find((l) => l.tipo === "SAIDA") ?? alvo;
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.lancamentoBancario.deleteMany({
      where: { id: { in: ids }, filialId: sessao.filialId, grupoConciliacaoId: null },
    });
    if (count !== ids.length) throw new Error(MSG_CORRIDA_CONCILIACAO);
    await registrarAuditoria(
      {
        empresaId: sessao.empresaId,
        filialId: sessao.filialId,
        usuarioId: sessao.usuarioId,
        entidade: "LancamentoBancario",
        entidadeId: ehTransferencia ? saida.id : alvo.id,
        acao: ehTransferencia ? "EXCLUIR_TRANSFERENCIA" : "EXCLUIR",
        anterior: ehTransferencia ? { transferenciaId: alvo.transferenciaId, lancamentos: semConta } : semConta[0],
        novo: { motivo: motivoLimpo },
      },
      tx,
    );
  });
}

export async function informarSaldoBancario(sessao: SessaoAtiva, dados: SaldoBancarioFormValues) {
  requirePermission(sessao.perfil, "lancamento:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  await buscarContaDaFilial(sessao.filialId, dados.contaBancariaId);

  const registro = await prisma.saldoBancarioInformado.create({
    data: {
      contaBancariaId: dados.contaBancariaId,
      data: dados.data,
      saldo: dados.saldo,
      usuarioId: sessao.usuarioId,
    },
  });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "SaldoBancarioInformado",
    entidadeId: registro.id,
    acao: "CRIAR",
    anterior: null,
    novo: { contaBancariaId: dados.contaBancariaId, data: dados.data, saldo: dados.saldo },
  });

  return registro;
}
