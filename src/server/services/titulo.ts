import { prisma } from "@/server/db/client";
import { requirePermission, requireAlteracaoFilial } from "@/server/auth/permissions";
import { registrarAuditoria, type ClientePrisma } from "@/server/audit/registrar";
import { recalcularEPersistirStatusParcela, calcularStatusParcela } from "@/server/services/parcela";
import { SEM_VALOR } from "@/lib/schemas/enums";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { StatusParcela, TipoTitulo } from "@prisma/client";
import type { TituloFormValues, TituloHeaderFormValues } from "@/lib/schemas/titulo";

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

/**
 * Garante que todo id referenciado pelo título pertence à filial/empresa da sessão.
 * A FK do banco só prova que a linha existe em *alguma* filial — sem esta checagem
 * um id colado à mão (especialmente via importação CSV) vazaria dados entre tenants.
 */
export async function validarReferenciasDoTitulo(
  sessao: SessaoAtiva,
  tipo: TipoTitulo,
  dados: TituloHeaderFormValues,
  db: ClientePrisma = prisma,
): Promise<void> {
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
}

export async function listarTitulos(filialId: string, tipo: TipoTitulo) {
  const titulos = await prisma.titulo.findMany({
    where: { filialId, tipo },
    include: {
      fornecedor: true,
      cliente: true,
      categoriaFinanceira: true,
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

  return titulos;
}

export async function criarTitulo(
  sessao: SessaoAtiva,
  tipo: TipoTitulo,
  dados: TituloFormValues,
  db: ClientePrisma = prisma,
) {
  requirePermission(sessao.perfil, "titulo:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  await validarReferenciasDoTitulo(sessao, tipo, dados, db);

  const titulo = await db.titulo.create({
    data: {
      filialId: sessao.filialId,
      tipo,
      ...camposNormalizados(tipo, dados),
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
      novo: { tipo, documento: dados.documento, parcelas: titulo.parcelas.length },
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

  const titulo = await prisma.titulo.update({ where: { id }, data: campos });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Titulo",
    entidadeId: id,
    acao: "ATUALIZAR",
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
    },
    novo: campos,
  });

  return titulo;
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
