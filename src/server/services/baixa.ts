import { prisma } from "@/server/db/client";
import { requirePermission, requireAlteracaoFilial } from "@/server/auth/permissions";
import { registrarAuditoria, type ClientePrisma } from "@/server/audit/registrar";
import { recalcularEPersistirStatusParcela, SELECT_VALORES_BAIXA } from "@/server/services/parcela";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { Prisma, StatusAprovacaoBaixa, StatusParcela, TipoTitulo } from "@prisma/client";
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formatacao";
import { rejeicaoEmAberto } from "@/lib/financeiro/rejeicaoEmAberto";
import type { BaixaFormValues } from "@/lib/schemas/baixa";
import type { ContextoTitulo } from "./titulo";

async function buscarParcelaDaFilial(filialId: string, parcelaId: string) {
  return prisma.parcela.findFirstOrThrow({ where: { id: parcelaId, titulo: { filialId } } });
}

async function buscarBaixaDaFilial(filialId: string, baixaId: string) {
  return prisma.baixa.findFirstOrThrow({ where: { id: baixaId, parcela: { titulo: { filialId } } } });
}

/**
 * APROVADO e REJEITADO são estados finais. Sem esta trava, reenviar o formulário de
 * aprovação (o `baixaId` vem de um input escondido) reabriria uma baixa já rejeitada
 * e ela voltaria a abater o saldo da parcela.
 */
function garantirBaixaPendente(statusAtual: StatusAprovacaoBaixa): void {
  if (statusAtual !== "PENDENTE") {
    throw new Error("Esta baixa já foi avaliada");
  }
}

/** A parcela já tem baixa esperando aprovação: a segunda só depois de aprovar ou rejeitar a primeira. */
export class BaixaPendenteError extends Error {
  name = "BaixaPendenteError";
}

/** Parcela paga, cancelada ou renegociada não recebe baixa. */
export class BaixaParcelaFechadaError extends Error {
  name = "BaixaParcelaFechadaError";
}

/** A baixa não é uma rejeição em aberto: não é rejeitada, já foi dispensada ou já se resolveu. */
export class RejeicaoNaoDispensavelError extends Error {
  name = "RejeicaoNaoDispensavelError";
}

export const STATUS_QUE_ACEITAM_BAIXA: readonly StatusParcela[] = [
  "EM_ABERTO",
  "A_VENCER",
  "VENCIDO",
  "PARCIALMENTE_PAGO",
];

export const ROTULO_PARCELA_FECHADA: Partial<Record<StatusParcela, string>> = {
  PAGO: "paga",
  CANCELADO: "cancelada",
  RENEGOCIADO: "renegociada",
};

export const MSG_BAIXA_MAQUININHA =
  "Este título é de venda na maquininha: confirme o recebimento em Repasses de cartão";

/** Títulos da maquininha (repasses e taxa) só são baixados pela confirmação do repasse (D-37). */
async function garantirForaDaMaquininha(parcelaId: string) {
  const daMaquininha = await prisma.parcela.count({
    where: {
      id: parcelaId,
      titulo: {
        OR: [
          { pedidoVenda: { is: { operadoraCartaoId: { not: null } } } },
          { pedidoVendaTaxa: { isNot: null } },
        ],
      },
    },
  });
  if (daMaquininha > 0) throw new Error(MSG_BAIXA_MAQUININHA);
}

/** Segregação de funções: com a opção da empresa ligada, quem registrou a baixa não a aprova. */
export async function exigeAprovacaoPorOutro(empresaId: string, db: ClientePrisma = prisma): Promise<boolean> {
  const empresa = await db.empresa.findUniqueOrThrow({
    where: { id: empresaId },
    select: { exigirAprovacaoPorOutro: true },
  });
  return empresa.exigirAprovacaoPorOutro;
}

async function garantirAprovacaoPorOutraPessoa(sessao: SessaoAtiva, registradaPor: string): Promise<void> {
  if (registradaPor === sessao.usuarioId && (await exigeAprovacaoPorOutro(sessao.empresaId))) {
    throw new Error("Quem registrou a baixa não pode aprová-la. Peça a outra pessoa com permissão de aprovação.");
  }
}

export const MSG_ESTORNO_REPASSE =
  "Esta baixa é de um repasse de cartão: use Desfazer repasse em Repasses de cartão";
export const MSG_ESTORNO_CONCILIADA =
  "O lançamento desta baixa já foi conciliado. Desconcilie na Conciliação antes de estornar";
export const MSG_ESTORNO_POR_QUEM_REGISTROU =
  "Quem registrou a baixa não pode estorná-la. Peça a outra pessoa com permissão de aprovação.";

export async function listarBaixasPendentes(filialId: string) {
  return prisma.baixa.findMany({
    where: { statusAprovacao: "PENDENTE", parcela: { titulo: { filialId } } },
    include: {
      parcela: {
        include: {
          titulo: { include: { fornecedor: true, cliente: true, _count: { select: { parcelas: true } } } },
          // Todas as baixas da parcela: a tela soma as aprovadas (saldo) e conta as outras pendentes (em dobro).
          baixas: { select: { id: true, statusAprovacao: true, ...SELECT_VALORES_BAIXA } },
        },
      },
      contaBancaria: { include: { banco: true } },
      usuario: true,
    },
    orderBy: { criadoEm: "asc" },
  });
}

/**
 * A parcela não pode ter baixa esperando aprovação. Chame com a parcela já travada (`FOR UPDATE`) na mesma
 * transação: assim registrar, cancelar e renegociar ao mesmo tempo ficam em fila e o segundo vê o primeiro.
 */
export async function garantirSemBaixaPendente(
  tx: Prisma.TransactionClient,
  parcelaId: string,
  antesDe: string,
): Promise<void> {
  // Leituras em sequência (sem include): ver "consultas paralelas na transação" no backlog.
  const pendente = await tx.baixa.findFirst({
    where: { parcelaId, statusAprovacao: "PENDENTE" },
    select: { valorPago: true, data: true, usuarioId: true },
  });
  if (!pendente) return;
  const quem = await tx.usuario.findUniqueOrThrow({ where: { id: pendente.usuarioId }, select: { nome: true } });
  throw new BaixaPendenteError(
    `Esta parcela já tem uma baixa aguardando aprovação: ${formatarMoeda(pendente.valorPago)} de ` +
      `${formatarData(pendente.data)}, registrada por ${quem.nome}. ` +
      `Peça para aprovarem ou rejeitarem essa baixa antes de ${antesDe}.`,
  );
}

export async function registrarBaixa(sessao: SessaoAtiva, parcelaId: string, dados: BaixaFormValues) {
  requirePermission(sessao.perfil, "titulo:baixar");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  await buscarParcelaDaFilial(sessao.filialId, parcelaId);
  await garantirForaDaMaquininha(parcelaId);

  // A FK só prova que a conta existe em alguma filial — sem este escopo uma baixa
  // poderia ser lançada contra a conta bancária de outro tenant.
  const contaBancaria = await prisma.contaBancaria.findFirst({
    where: { id: dados.contaBancariaId, filialId: sessao.filialId },
  });
  if (!contaBancaria) {
    throw new Error("Conta bancária não pertence à filial ativa");
  }

  return prisma.$transaction(async (tx) => {
    // Trava a parcela: duas baixas ao mesmo tempo ficam em fila e a segunda vê a primeira.
    await tx.$queryRaw`SELECT id FROM parcelas WHERE id = ${parcelaId} FOR UPDATE`;

    const parcela = await tx.parcela.findUniqueOrThrow({ where: { id: parcelaId }, select: { status: true } });
    if (!STATUS_QUE_ACEITAM_BAIXA.includes(parcela.status)) {
      throw new BaixaParcelaFechadaError(
        `Esta parcela está ${ROTULO_PARCELA_FECHADA[parcela.status] ?? "fechada"} e não aceita baixa`,
      );
    }

    await garantirSemBaixaPendente(tx, parcelaId, "registrar outra");

    const baixa = await tx.baixa.create({
      data: {
        parcelaId,
        data: dados.data,
        valorPago: dados.valorPago,
        valorJuros: dados.valorJuros,
        valorMulta: dados.valorMulta,
        valorDesconto: dados.valorDesconto,
        contaBancariaId: dados.contaBancariaId,
        usuarioId: sessao.usuarioId,
        statusAprovacao: "PENDENTE",
      },
    });

    await registrarAuditoria(
      {
        empresaId: sessao.empresaId,
        filialId: sessao.filialId,
        usuarioId: sessao.usuarioId,
        entidade: "Baixa",
        entidadeId: baixa.id,
        acao: "CRIAR",
        anterior: null,
        novo: { parcelaId, valorPago: dados.valorPago, statusAprovacao: "PENDENTE" },
      },
      tx,
    );

    return baixa;
  });
}

export async function aprovarBaixa(sessao: SessaoAtiva, baixaId: string) {
  requirePermission(sessao.perfil, "titulo:aprovar");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const anterior = await buscarBaixaDaFilial(sessao.filialId, baixaId);
  garantirBaixaPendente(anterior.statusAprovacao);
  await garantirAprovacaoPorOutraPessoa(sessao, anterior.usuarioId);

  const { baixa } = await prisma.$transaction((tx) => efetivarBaixa(tx, sessao, baixaId));
  return baixa;
}

/**
 * Núcleo da aprovação, sem checagem de perfil: aprova, recalcula a parcela e
 * gera o lançamento bancário. Usado por `aprovarBaixa` e pela venda à vista,
 * que cria a baixa já aprovada com a permissão `venda:escrever`. Quem chama é
 * responsável pela permissão e pelo escopo da filial.
 */
export async function efetivarBaixa(tx: Prisma.TransactionClient, contexto: ContextoTitulo, baixaId: string) {
  // Relida dentro da transação: duas aprovações simultâneas não geram dois lançamentos.
  const anterior = await tx.baixa.findUniqueOrThrow({ where: { id: baixaId } });
  garantirBaixaPendente(anterior.statusAprovacao);

  const parcela = await tx.parcela.findUniqueOrThrow({
    where: { id: anterior.parcelaId },
    include: { titulo: true },
  });
  // Pendência antiga de parcela fechada depois do registro: aprovar geraria lançamento de parcela que não existe mais.
  if (parcela.status === "CANCELADO" || parcela.status === "RENEGOCIADO") {
    throw new BaixaParcelaFechadaError(
      `A parcela desta baixa foi ${ROTULO_PARCELA_FECHADA[parcela.status]}. Rejeite a baixa.`,
    );
  }

  const baixa = await tx.baixa.update({
    where: { id: baixaId },
    data: { statusAprovacao: "APROVADO", avaliadoPorId: contexto.usuarioId, avaliadoEm: new Date() },
  });
  await recalcularEPersistirStatusParcela(anterior.parcelaId, tx);

  const conta = await tx.contaBancaria.findUniqueOrThrow({
    where: { id: anterior.contaBancariaId },
    select: { tipo: true },
  });

  const lancamento = await tx.lancamentoBancario.create({
    data: {
      filialId: contexto.filialId,
      contaBancariaId: anterior.contaBancariaId,
      data: anterior.data,
      tipo: parcela.titulo.tipo === "RECEBER" ? "ENTRADA" : "SAIDA",
      valor: anterior.valorPago,
      descricao: `Baixa aprovada — parcela nº ${parcela.numero}`,
      categoriaFinanceiraId: parcela.titulo.categoriaFinanceiraId,
      centroCustoId: parcela.titulo.centroCustoId,
      centroLucroId: parcela.titulo.centroLucroId,
      safraId: parcela.titulo.safraId,
      projetoId: parcela.titulo.projetoId,
      classificacaoFiscal: parcela.titulo.classificacaoFiscal,
      tipoComprovante: parcela.titulo.tipoComprovante,
      numeroComprovante: parcela.titulo.numeroDocumentoFiscal,
      origem: "BAIXA",
      baixaId: baixa.id,
      // Pago/recebido em dinheiro (conta Caixa): entra direto no realizado, sem extrato.
      conciliado: conta.tipo === "CAIXA",
      usuarioId: contexto.usuarioId,
    },
  });

  await registrarAuditoria(
    {
      empresaId: contexto.empresaId,
      filialId: contexto.filialId,
      usuarioId: contexto.usuarioId,
      entidade: "Baixa",
      entidadeId: baixaId,
      acao: "APROVAR",
      anterior: { statusAprovacao: anterior.statusAprovacao },
      novo: { statusAprovacao: "APROVADO", lancamentoBancarioId: lancamento.id },
    },
    tx,
  );

  return { baixa, lancamentoId: lancamento.id };
}

export async function rejeitarBaixa(sessao: SessaoAtiva, baixaId: string, motivo: string) {
  requirePermission(sessao.perfil, "titulo:aprovar");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const anterior = await buscarBaixaDaFilial(sessao.filialId, baixaId);
  garantirBaixaPendente(anterior.statusAprovacao);

  const baixa = await prisma.baixa.update({
    where: { id: baixaId },
    data: {
      statusAprovacao: "REJEITADO",
      avaliadoPorId: sessao.usuarioId,
      avaliadoEm: new Date(),
      motivoRejeicao: motivo,
    },
  });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Baixa",
    entidadeId: baixaId,
    acao: "REJEITAR",
    anterior: { statusAprovacao: anterior.statusAprovacao },
    novo: { statusAprovacao: "REJEITADO", motivoRejeicao: motivo },
  });

  return baixa;
}

/**
 * Desfaz uma baixa aprovada (spec 2026-11-23-estorno-de-baixa): a baixa fica ESTORNADO, com
 * motivo, e continua no histórico; o lançamento que ela gerou é apagado e a parcela,
 * recalculada. Lançamento conciliado bloqueia (desconciliar antes), baixa de repasse
 * de cartão é desfeita em Repasses de cartão, e a segregação é a mesma da aprovação.
 */
export async function estornarBaixa(sessao: SessaoAtiva, baixaId: string, motivo: string) {
  requirePermission(sessao.perfil, "titulo:aprovar");
  requireAlteracaoFilial(sessao.podeAlterarFilial);
  const motivoLimpo = motivo.trim();
  if (motivoLimpo.length < 3) throw new Error("Informe o motivo do estorno");

  return prisma.$transaction(async (tx) => {
    // Leituras em sequência: um include com várias relações dispara consultas em paralelo
    // na única conexão da transação (o pg avisa, e na versão 9 recusa).
    const anterior = await tx.baixa.findFirstOrThrow({
      where: { id: baixaId, parcela: { titulo: { filialId: sessao.filialId } } },
    });
    const lancamentos = await tx.lancamentoBancario.findMany({ where: { baixaId } });
    const deRepasse = await tx.repasseCartaoConfirmado.count({
      where: { OR: [{ baixaRecebimentoId: baixaId }, { baixaTaxaId: baixaId }] },
    });
    if (anterior.statusAprovacao !== "APROVADO") throw new Error("Só baixas aprovadas podem ser estornadas");
    if (deRepasse > 0) throw new Error(MSG_ESTORNO_REPASSE);
    if (lancamentos.some((l) => l.grupoConciliacaoId !== null)) throw new Error(MSG_ESTORNO_CONCILIADA);
    // Depois das travas acima: baixa de repasse ou conciliada mostra o motivo que de fato a impede.
    if (anterior.usuarioId === sessao.usuarioId && (await exigeAprovacaoPorOutro(sessao.empresaId, tx))) {
      throw new Error(MSG_ESTORNO_POR_QUEM_REGISTROU);
    }

    // Condicional: de dois estornos simultâneos, só um passa daqui.
    const { count: estornadas } = await tx.baixa.updateMany({
      where: { id: baixaId, statusAprovacao: "APROVADO" },
      data: {
        statusAprovacao: "ESTORNADO",
        estornadoPorId: sessao.usuarioId,
        estornadoEm: new Date(),
        motivoEstorno: motivoLimpo,
      },
    });
    if (estornadas !== 1) throw new Error("Esta baixa já foi estornada");

    // Só os que seguem fora de conciliação: se alguém conciliou no meio, a contagem não bate e tudo volta.
    const { count: apagados } = await tx.lancamentoBancario.deleteMany({
      where: { baixaId, grupoConciliacaoId: null },
    });
    if (apagados !== lancamentos.length) throw new Error(MSG_ESTORNO_CONCILIADA);

    await recalcularEPersistirStatusParcela(anterior.parcelaId, tx);

    await registrarAuditoria(
      {
        empresaId: sessao.empresaId,
        filialId: sessao.filialId,
        usuarioId: sessao.usuarioId,
        entidade: "Baixa",
        entidadeId: baixaId,
        acao: "ESTORNAR",
        anterior: {
          statusAprovacao: anterior.statusAprovacao,
          lancamentos: lancamentos.map((l) => ({
            id: l.id,
            contaBancariaId: l.contaBancariaId,
            data: l.data,
            tipo: l.tipo,
            valor: l.valor.toString(),
          })),
        },
        novo: { statusAprovacao: "ESTORNADO", motivoEstorno: motivoLimpo },
      },
      tx,
    );

    return tx.baixa.findUniqueOrThrow({ where: { id: baixaId } });
  });
}

/**
 * Tira do aviso uma rejeição que não precisa de nova baixa (spec 2026-11-25-rejeicao-visivel): o pagamento
 * não aconteceu, por exemplo. Só esconde o aviso, sem mexer em saldo nem lançamento: não há segregação.
 */
export async function dispensarRejeicao(sessao: SessaoAtiva, baixaId: string, motivo: string) {
  requirePermission(sessao.perfil, "titulo:baixar");
  requireAlteracaoFilial(sessao.podeAlterarFilial);
  const motivoLimpo = motivo.trim();
  if (motivoLimpo.length < 3) throw new Error("Informe o motivo da dispensa");

  return prisma.$transaction(async (tx) => {
    // Leituras em sequência, sem include com várias relações (consultas paralelas na transação).
    const baixa = await tx.baixa.findFirstOrThrow({
      where: { id: baixaId, parcela: { titulo: { filialId: sessao.filialId } } },
    });
    if (baixa.statusAprovacao !== "REJEITADO") {
      throw new RejeicaoNaoDispensavelError("Só uma baixa rejeitada pode ser dispensada");
    }
    if (baixa.dispensadaEm) {
      const quem = baixa.dispensadaPorId
        ? await tx.usuario.findUnique({ where: { id: baixa.dispensadaPorId }, select: { nome: true } })
        : null;
      throw new RejeicaoNaoDispensavelError(
        `Esta rejeição já foi dispensada${quem ? ` por ${quem.nome}` : ""} em ${formatarDataHora(baixa.dispensadaEm)}`,
      );
    }
    const parcela = await tx.parcela.findUniqueOrThrow({ where: { id: baixa.parcelaId }, select: { status: true } });
    const daParcela = await tx.baixa.findMany({
      where: { parcelaId: baixa.parcelaId },
      select: { id: true, criadoEm: true },
    });
    if (!rejeicaoEmAberto(baixa, daParcela, parcela.status)) {
      throw new RejeicaoNaoDispensavelError(
        "Esta rejeição já foi resolvida: a parcela recebeu outra baixa ou não está mais em aberto",
      );
    }

    const dispensadaEm = new Date();
    // Condicional: de duas dispensas simultâneas, só uma passa.
    const { count } = await tx.baixa.updateMany({
      where: { id: baixaId, dispensadaEm: null },
      data: { dispensadaPorId: sessao.usuarioId, dispensadaEm, motivoDispensa: motivoLimpo },
    });
    if (count !== 1) throw new RejeicaoNaoDispensavelError("Esta rejeição já foi dispensada");

    await registrarAuditoria(
      {
        empresaId: sessao.empresaId,
        filialId: sessao.filialId,
        usuarioId: sessao.usuarioId,
        entidade: "Baixa",
        entidadeId: baixaId,
        acao: "DISPENSAR_REJEICAO",
        anterior: { dispensadaEm: null },
        novo: { dispensadaEm, motivoDispensa: motivoLimpo },
      },
      tx,
    );

    return tx.baixa.findUniqueOrThrow({ where: { id: baixaId } });
  });
}

/** Quantas rejeições em aberto há na filial, para o aviso de Contas a pagar/receber. */
export async function contarRejeicoesEmAberto(filialId: string, tipo: TipoTitulo): Promise<number> {
  const rejeitadas = await prisma.baixa.findMany({
    where: {
      statusAprovacao: "REJEITADO",
      dispensadaEm: null,
      parcela: { titulo: { filialId, tipo }, status: { notIn: ["PAGO", "CANCELADO", "RENEGOCIADO"] } },
    },
    select: {
      id: true,
      statusAprovacao: true,
      criadoEm: true,
      avaliadoEm: true,
      dispensadaEm: true,
      parcela: { select: { status: true, baixas: { select: { id: true, criadoEm: true } } } },
    },
  });
  return rejeitadas.filter((baixa) => rejeicaoEmAberto(baixa, baixa.parcela.baixas, baixa.parcela.status)).length;
}
