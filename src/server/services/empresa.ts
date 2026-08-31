import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { EmpresaFormValues } from "@/lib/schemas/empresa";

export async function listarEmpresas() {
  return prisma.empresa.findMany({ orderBy: { razaoSocial: "asc" } });
}

export async function criarEmpresa(sessao: SessaoAtiva, dados: EmpresaFormValues) {
  requirePermission(sessao.perfil, "empresa:gerenciar");

  const empresa = await prisma.$transaction(async (tx) => {
    const novaEmpresa = await tx.empresa.create({ data: dados });
    const vinculo = await tx.usuarioEmpresa.create({
      data: { usuarioId: sessao.usuarioId, empresaId: novaEmpresa.id, perfil: "ADMINISTRADOR" },
    });
    const matriz = await tx.filial.create({
      data: { empresaId: novaEmpresa.id, nome: "Matriz", cnpj: dados.cnpj },
    });
    await tx.usuarioEmpresaFilial.create({
      data: { usuarioEmpresaId: vinculo.id, filialId: matriz.id, podeAlterar: true, ativo: true },
    });
    return novaEmpresa;
  });

  await registrarAuditoria({
    empresaId: empresa.id,
    filialId: null,
    usuarioId: sessao.usuarioId,
    entidade: "Empresa",
    entidadeId: empresa.id,
    acao: "CRIAR",
    anterior: null,
    novo: dados,
  });

  return empresa;
}

export async function atualizarEmpresa(sessao: SessaoAtiva, id: string, dados: EmpresaFormValues) {
  requirePermission(sessao.perfil, "empresa:gerenciar");

  const anterior = await prisma.empresa.findUniqueOrThrow({ where: { id } });
  const empresa = await prisma.empresa.update({ where: { id }, data: dados });

  await registrarAuditoria({
    empresaId: id,
    filialId: null,
    usuarioId: sessao.usuarioId,
    entidade: "Empresa",
    entidadeId: id,
    acao: "ATUALIZAR",
    anterior: {
      razaoSocial: anterior.razaoSocial,
      nomeFantasia: anterior.nomeFantasia,
      cnpj: anterior.cnpj,
      moedaPadrao: anterior.moedaPadrao,
    },
    novo: dados,
  });

  return empresa;
}

export async function definirAtivoEmpresa(sessao: SessaoAtiva, id: string, ativo: boolean) {
  requirePermission(sessao.perfil, "empresa:gerenciar");

  const empresa = await prisma.empresa.update({ where: { id }, data: { ativo } });

  await registrarAuditoria({
    empresaId: id,
    filialId: null,
    usuarioId: sessao.usuarioId,
    entidade: "Empresa",
    entidadeId: id,
    acao: ativo ? "REATIVAR" : "INATIVAR",
    anterior: { ativo: !ativo },
    novo: { ativo },
  });

  return empresa;
}
