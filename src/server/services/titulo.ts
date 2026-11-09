import { prisma } from "@/server/db/client";
import { requirePermission, requireAlteracaoFilial } from "@/server/auth/permissions";
import { registrarAuditoria, type ClientePrisma } from "@/server/audit/registrar";
import { recalcularEPersistirStatusParcela, calcularStatusParcela } from "@/server/services/parcela";
import { SEM_VALOR } from "@/lib/schemas/enums";
import {
  ErroClassificacaoFiscal,
  garantirComprovanteValido,
  resolverClassificacao,
} from "@/server/services/classificacaoFiscal";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { ClassificacaoFiscal, StatusParcela, TipoComprovante, TipoTitulo } from "@prisma/client";
import type { TituloFormValues, TituloHeaderFormValues } from "@/lib/schemas/titulo";

export type FiltroTitulos = {
  categoriaId?: string;
  contraparteId?: string;
  centroCustoId?: string;
  centroLucroId?: string;
  safraId?: string;
  projetoId?: string;
  status?: StatusParcela;
  vencimentoDe?: Date;
  vencimentoAte?: Date;
  classificacao?: ClassificacaoFiscal;
};

export function parcelaBateFiltroDeParcela(
  parcela: { status: StatusParcela; dataVencimento: Date },
  filtros: Pick<FiltroTitulos, "status" | "vencimentoDe" | "vencimentoAte">,
): boolean {
  if (filtros.status !== undefined && parcela.status !== filtros.status) return false;
  if (filtros.vencimentoDe !== undefined && parcela.dataVencimento < filtros.vencimentoDe) return false;
  if (filtros.vencimentoAte !== undefined && parcela.dataVencimento > filtros.vencimentoAte) return false;
  return true;
}

function contraparteCampo(tipo: TipoTitulo, contraparteId: string) {
  return tipo === "PAGAR"
    ? { fornecedorId: contraparteId, clienteId: null }
    : { fornecedorId: null, clienteId: contraparteId };
}

/**
 * Converte o valor de um campo opcional vindo do formulário para `null`.
 * Trata tanto a string vazia quanto o sentinela `SEM_VALOR` ("__nenhum__"),
 * que é o que o `Select` posta quando a opção "Nenhum" está selecionada —
 * sem isso o sentinela chegaria ao Prisma como id de FK e estouraria P2003.
 */
function normalizarOpcional(valor: string | undefined): string | null {
  return valor && valor.length > 0 && valor !== SEM_VALOR ? valor : null;
}

/** Campos do cabeçalho já normalizados — mesma forma usada na escrita e no diff de auditoria. */
function camposNormalizados(tipo: TipoTitulo, dados: TituloHeaderFormValues) {
  return {
    ...contraparteCampo(tipo, dados.contraparteId),
    documento: dados.documento,
    dataEmissao: dados.dataEmissao,
    dataCompetencia: dados.dataCompetencia,
    categoriaFinanceiraId: dados.categoriaFinanceiraId,
    centroCustoId: normalizarOpcional(dados.centroCustoId),
    centroLucroId: normalizarOpcional(dados.centroLucroId),
    safraId: normalizarOpcional(dados.safraId),
    projetoId: normalizarOpcional(dados.projetoId),
    contaBancariaId: normalizarOpcional(dados.contaBancariaId),
    formaPagamento: normalizarOpcional(dados.formaPagamento),
  };
}

/** Dados do documento fiscal já normalizados, para a classificação já resolvida. */
function camposFiscaisNormalizados(dados: TituloHeaderFormValues, classificacaoFiscal: ClassificacaoFiscal) {
  return {
    classificacaoFiscal,
    tipoComprovante: normalizarOpcional(dados.tipoComprovante) as TipoComprovante | null,
    numeroDocumentoFiscal: normalizarOpcional(dados.numeroDocumentoFiscal),
    serieDocumentoFiscal: normalizarOpcional(dados.serieDocumentoFiscal),
    chaveAcesso: normalizarOpcional(dados.chaveAcesso),
    dataEmissaoDocumentoFiscal: dados.dataEmissaoDocumentoFiscal instanceof Date ? dados.dataEmissaoDocumentoFiscal : null,
    // Motivo de "sem nota" só faz sentido no gerencial.
    motivoSemDocumento: classificacaoFiscal === "GERENCIAL" ? normalizarOpcional(dados.motivoSemDocumento) : null,
  };
}

type CamposFiscais = ReturnType<typeof camposFiscaisNormalizados>;

/**
 * Impede lançar a mesma nota duas vezes na filial: pela chave de acesso, ou por
 * contraparte + tipo + série + número. Títulos inativos não contam.
 */
async function garantirNotaNaoDuplicada(
  db: ClientePrisma,
  filialId: string,
  tipo: TipoTitulo,
  contraparteId: string,
  fiscais: CamposFiscais,
  tituloIdIgnorado?: string,
): Promise<void> {
  const base = { filialId, ativo: true, ...(tituloIdIgnorado && { id: { not: tituloIdIgnorado } }) };

  if (fiscais.chaveAcesso) {
    const existente = await db.titulo.findFirst({
      where: { ...base, chaveAcesso: fiscais.chaveAcesso },
      select: { documento: true },
    });
    if (existente) {
      throw new ErroClassificacaoFiscal(`Esta nota já está lançada no título ${existente.documento}`, ["chaveAcesso"]);
    }
  }

  if (fiscais.numeroDocumentoFiscal && fiscais.tipoComprovante) {
    const existente = await db.titulo.findFirst({
      where: {
        ...base,
        ...contraparteCampo(tipo, contraparteId),
        tipoComprovante: fiscais.tipoComprovante,
        serieDocumentoFiscal: fiscais.serieDocumentoFiscal,
        numeroDocumentoFiscal: fiscais.numeroDocumentoFiscal,
      },
      select: { documento: true },
    });
    if (existente) {
      throw new ErroClassificacaoFiscal(
        `Esta nota (mesmo número e série) já está lançada para esta contraparte no título ${existente.documento}`,
        ["numeroDocumentoFiscal"],
      );
    }
  }
}

/**
 * Garante que todo id referenciado pelo título pertence à filial/empresa da sessão.
 * A FK do banco só prova que a linha existe em *alguma* filial — sem esta checagem
 * um id colado à mão (especialmente via importação CSV) vazaria dados entre tenants.
 */
/** Quem cria o título: a sessão do usuário ou o contexto de outro módulo (recepção, venda). */
export type ContextoTitulo = Pick<SessaoAtiva, "empresaId" | "filialId" | "usuarioId">;

export async function validarReferenciasDoTitulo(
  sessao: ContextoTitulo,
  tipo: TipoTitulo,
  dados: TituloHeaderFormValues,
  db: ClientePrisma = prisma,
): Promise<{ classificacaoFiscalPadrao: ClassificacaoFiscal | null }> {
  const campos = camposNormalizados(tipo, dados);
  const filialId = sessao.filialId;

  const referenciasDaFilial: [string, string | null, () => Promise<unknown>][] = [
    ["Categoria financeira", campos.categoriaFinanceiraId, () =>
      db.categoriaFinanceira.findFirst({ where: { id: campos.categoriaFinanceiraId, filialId } }),
    ],
    ["Centro de custo", campos.centroCustoId, () =>
      db.centroCusto.findFirst({ where: { id: campos.centroCustoId ?? "", filialId } }),
    ],
    ["Centro de lucro", campos.centroLucroId, () =>
      db.centroLucro.findFirst({ where: { id: campos.centroLucroId ?? "", filialId } }),
    ],
    ["Safra", campos.safraId, () => db.safra.findFirst({ where: { id: campos.safraId ?? "", filialId } })],
    ["Projeto", campos.projetoId, () => db.projeto.findFirst({ where: { id: campos.projetoId ?? "", filialId } })],
    ["Conta bancária", campos.contaBancariaId, () =>
      db.contaBancaria.findFirst({ where: { id: campos.contaBancariaId ?? "", filialId } }),
    ],
  ];

  for (const [rotulo, valor, buscar] of referenciasDaFilial) {
    if (valor === null) continue;
    if (!(await buscar())) {
      throw new Error(`${rotulo} não pertence à filial ativa`);
    }
  }

  const contraparte =
    tipo === "PAGAR"
      ? await db.fornecedor.findFirst({
          where: { id: dados.contraparteId, empresaId: sessao.empresaId },
        })
      : await db.cliente.findFirst({ where: { id: dados.contraparteId, empresaId: sessao.empresaId } });

  if (!contraparte) {
    throw new Error(
      `${tipo === "PAGAR" ? "Fornecedor" : "Cliente"} não pertence à empresa ativa`,
    );
  }

  return { classificacaoFiscalPadrao: contraparte.classificacaoFiscalPadrao };
}

export async function listarTitulos(filialId: string, tipo: TipoTitulo, filtros: FiltroTitulos = {}) {
  const titulos = await prisma.titulo.findMany({
    where: {
      filialId,
      tipo,
      ...(filtros.categoriaId && { categoriaFinanceiraId: filtros.categoriaId }),
      ...(filtros.contraparteId &&
        (tipo === "PAGAR" ? { fornecedorId: filtros.contraparteId } : { clienteId: filtros.contraparteId })),
      ...(filtros.centroCustoId && { centroCustoId: filtros.centroCustoId }),
      ...(filtros.centroLucroId && { centroLucroId: filtros.centroLucroId }),
      ...(filtros.safraId && { safraId: filtros.safraId }),
      ...(filtros.projetoId && { projetoId: filtros.projetoId }),
      ...(filtros.classificacao && { classificacaoFiscal: filtros.classificacao }),
    },
    include: {
      _count: { select: { anexos: true } },
      fornecedor: true,
      cliente: true,
      categoriaFinanceira: true,
      centroCusto: true,
      centroLucro: true,
      safra: true,
      projeto: true,
      contaBancaria: { include: { banco: true } },
      parcelas: { include: { baixas: true }, orderBy: { numero: "asc" } },
    },
    orderBy: { criadoEm: "desc" },
  });

  // Recalcula em memória a partir das parcelas/baixas já carregadas e persiste as
  // divergências com um `updateMany` por status — evita 1 SELECT + 1 UPDATE por parcela.
  const hoje = new Date();
  const idsPorStatus = new Map<StatusParcela, string[]>();

  for (const titulo of titulos) {
    for (const parcela of titulo.parcelas) {
      const statusCalculado = calcularStatusParcela(
        {
          valorAtualizado: Number(parcela.valorAtualizado),
          dataVencimento: parcela.dataVencimento,
          status: parcela.status,
        },
        parcela.baixas
          .filter((baixa) => baixa.statusAprovacao === "APROVADO")
          .map((baixa) => ({ valorPago: Number(baixa.valorPago) })),
        hoje,
      );

      if (statusCalculado !== parcela.status) {
        const ids = idsPorStatus.get(statusCalculado);
        if (ids) ids.push(parcela.id);
        else idsPorStatus.set(statusCalculado, [parcela.id]);
        // Mantém o objeto retornado coerente com o que acabou de ser persistido.
        parcela.status = statusCalculado;
      }
    }
  }

  for (const [status, ids] of idsPorStatus) {
    await prisma.parcela.updateMany({ where: { id: { in: ids } }, data: { status } });
  }

  const temFiltroDeParcela =
    filtros.status !== undefined || filtros.vencimentoDe !== undefined || filtros.vencimentoAte !== undefined;
  if (!temFiltroDeParcela) return titulos;

  return titulos.filter((titulo) => titulo.parcelas.some((parcela) => parcelaBateFiltroDeParcela(parcela, filtros)));
}

export async function criarTitulo(
  sessao: SessaoAtiva,
  tipo: TipoTitulo,
  dados: TituloFormValues,
  db: ClientePrisma = prisma,
) {
  requirePermission(sessao.perfil, "titulo:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);
  return criarTituloInterno(sessao, tipo, dados, db);
}

/**
 * Núcleo da criação de título, sem checagem de perfil: usado por `criarTitulo`
 * e por módulos que geram títulos como parte da própria operação (a recepção de
 * fruto cria a conta a pagar com a permissão `producao:escrever`). Quem chama
 * é responsável pela permissão; validação, classificação fiscal e auditoria
 * ficam aqui.
 */
export async function criarTituloInterno(
  sessao: ContextoTitulo,
  tipo: TipoTitulo,
  dados: TituloFormValues,
  db: ClientePrisma,
) {
  const { classificacaoFiscalPadrao } = await validarReferenciasDoTitulo(sessao, tipo, dados, db);

  const classificacaoFiscal = resolverClassificacao(dados.classificacaoFiscal || undefined, classificacaoFiscalPadrao);
  const fiscais = camposFiscaisNormalizados(dados, classificacaoFiscal);
  garantirComprovanteValido(fiscais);
  await garantirNotaNaoDuplicada(db, sessao.filialId, tipo, dados.contraparteId, fiscais);

  const titulo = await db.titulo.create({
    data: {
      filialId: sessao.filialId,
      tipo,
      ...camposNormalizados(tipo, dados),
      ...fiscais,
      parcelas: {
        create: dados.parcelas.map((parcela) => ({
          numero: parcela.numero,
          dataVencimento: parcela.dataVencimento,
          valorOriginal: parcela.valorOriginal,
          valorAtualizado: parcela.valorOriginal,
        })),
      },
    },
    include: { parcelas: true },
  });

  await registrarAuditoria(
    {
      empresaId: sessao.empresaId,
      filialId: sessao.filialId,
      usuarioId: sessao.usuarioId,
      entidade: "Titulo",
      entidadeId: titulo.id,
      acao: "CRIAR",
      anterior: null,
      novo: { tipo, documento: dados.documento, parcelas: titulo.parcelas.length, classificacaoFiscal },
    },
    db,
  );

  return titulo;
}

export async function atualizarTitulo(sessao: SessaoAtiva, id: string, dados: TituloHeaderFormValues) {
  requirePermission(sessao.perfil, "titulo:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const anterior = await prisma.titulo.findUniqueOrThrow({ where: { id, filialId: sessao.filialId } });

  await validarReferenciasDoTitulo(sessao, anterior.tipo, dados);

  const campos = camposNormalizados(anterior.tipo, dados);

  // Na edição, a contraparte não reclassifica sozinha: sem classificação informada, mantém a atual.
  const classificacaoFiscal = dados.classificacaoFiscal || anterior.classificacaoFiscal;
  const reclassificou = classificacaoFiscal !== anterior.classificacaoFiscal;
  const motivoReclassificacao = normalizarOpcional(dados.motivoReclassificacao);
  if (reclassificou && !motivoReclassificacao) {
    throw new ErroClassificacaoFiscal("Informe o motivo da reclassificação", ["motivoReclassificacao"]);
  }

  // Campo fiscal ausente (undefined) mantém o valor gravado — quem não conhece os
  // campos novos não os apaga sem querer. Campo enviado vazio ("") limpa.
  const fiscaisInformados = camposFiscaisNormalizados(dados, classificacaoFiscal);
  const fiscais: CamposFiscais = {
    ...fiscaisInformados,
    tipoComprovante: dados.tipoComprovante === undefined ? anterior.tipoComprovante : fiscaisInformados.tipoComprovante,
    numeroDocumentoFiscal:
      dados.numeroDocumentoFiscal === undefined ? anterior.numeroDocumentoFiscal : fiscaisInformados.numeroDocumentoFiscal,
    serieDocumentoFiscal:
      dados.serieDocumentoFiscal === undefined ? anterior.serieDocumentoFiscal : fiscaisInformados.serieDocumentoFiscal,
    chaveAcesso: dados.chaveAcesso === undefined ? anterior.chaveAcesso : fiscaisInformados.chaveAcesso,
    dataEmissaoDocumentoFiscal:
      dados.dataEmissaoDocumentoFiscal === undefined
        ? anterior.dataEmissaoDocumentoFiscal
        : fiscaisInformados.dataEmissaoDocumentoFiscal,
    motivoSemDocumento:
      dados.motivoSemDocumento === undefined && classificacaoFiscal === "GERENCIAL"
        ? anterior.motivoSemDocumento
        : fiscaisInformados.motivoSemDocumento,
  };
  garantirComprovanteValido(fiscais);
  await garantirNotaNaoDuplicada(prisma, sessao.filialId, anterior.tipo, dados.contraparteId, fiscais, id);

  const mudouDadosDosLancamentos =
    reclassificou ||
    fiscais.tipoComprovante !== anterior.tipoComprovante ||
    fiscais.numeroDocumentoFiscal !== anterior.numeroDocumentoFiscal;

  return prisma.$transaction(async (tx) => {
    const titulo = await tx.titulo.update({ where: { id }, data: { ...campos, ...fiscais } });

    // Lançamentos das baixas já aprovadas acompanham o título (cópia usada nos relatórios de realizado).
    if (mudouDadosDosLancamentos) {
      await tx.lancamentoBancario.updateMany({
        where: { baixa: { parcela: { tituloId: id } } },
        data: {
          classificacaoFiscal: fiscais.classificacaoFiscal,
          tipoComprovante: fiscais.tipoComprovante,
          numeroComprovante: fiscais.numeroDocumentoFiscal,
        },
      });
    }

    await registrarAuditoria(
      {
        empresaId: sessao.empresaId,
        filialId: sessao.filialId,
        usuarioId: sessao.usuarioId,
        entidade: "Titulo",
        entidadeId: id,
        acao: reclassificou ? "RECLASSIFICAR" : "ATUALIZAR",
        // `anterior` e `novo` precisam estar na MESMA forma (fornecedorId/clienteId e
        // `null` nos opcionais vazios), senão o diff acusa alteração em todo campo a
        // cada edição — mesmo quando nada mudou.
        anterior: {
          fornecedorId: anterior.fornecedorId,
          clienteId: anterior.clienteId,
          documento: anterior.documento,
          dataEmissao: anterior.dataEmissao,
          dataCompetencia: anterior.dataCompetencia,
          categoriaFinanceiraId: anterior.categoriaFinanceiraId,
          centroCustoId: anterior.centroCustoId,
          centroLucroId: anterior.centroLucroId,
          safraId: anterior.safraId,
          projetoId: anterior.projetoId,
          contaBancariaId: anterior.contaBancariaId,
          formaPagamento: anterior.formaPagamento,
          classificacaoFiscal: anterior.classificacaoFiscal,
          tipoComprovante: anterior.tipoComprovante,
          numeroDocumentoFiscal: anterior.numeroDocumentoFiscal,
          serieDocumentoFiscal: anterior.serieDocumentoFiscal,
          chaveAcesso: anterior.chaveAcesso,
          dataEmissaoDocumentoFiscal: anterior.dataEmissaoDocumentoFiscal,
          motivoSemDocumento: anterior.motivoSemDocumento,
        },
        novo: { ...campos, ...fiscais, ...(reclassificou && { motivoReclassificacao }) },
      },
      tx,
    );

    return titulo;
  });
}

export async function alterarVencimentoParcela(sessao: SessaoAtiva, parcelaId: string, novoVencimento: Date) {
  requirePermission(sessao.perfil, "titulo:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const anterior = await prisma.parcela.findFirstOrThrow({
    where: { id: parcelaId, titulo: { filialId: sessao.filialId } },
  });

  await prisma.parcela.update({ where: { id: parcelaId }, data: { dataVencimento: novoVencimento } });
  await recalcularEPersistirStatusParcela(parcelaId);

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Parcela",
    entidadeId: parcelaId,
    acao: "ATUALIZAR",
    anterior: { dataVencimento: anterior.dataVencimento },
    novo: { dataVencimento: novoVencimento },
  });
}

export async function cancelarParcela(sessao: SessaoAtiva, parcelaId: string) {
  requirePermission(sessao.perfil, "titulo:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const anterior = await prisma.parcela.findFirstOrThrow({
    where: { id: parcelaId, titulo: { filialId: sessao.filialId } },
  });

  // CANCELADO e RENEGOCIADO são estados terminais: sobrescrever um RENEGOCIADO
  // apagaria o sentido da cadeia de renegociação (`parcelaOrigemId`).
  if (anterior.status === "CANCELADO" || anterior.status === "RENEGOCIADO") {
    throw new Error("Não é possível cancelar uma parcela já renegociada ou cancelada");
  }

  const parcela = await prisma.parcela.update({ where: { id: parcelaId }, data: { status: "CANCELADO" } });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Parcela",
    entidadeId: parcelaId,
    acao: "CANCELAR",
    anterior: { status: anterior.status },
    novo: { status: "CANCELADO" },
  });

  return parcela;
}
