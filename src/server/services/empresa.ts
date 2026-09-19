import { put, del } from "@vercel/blob";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { EmpresaFormValues } from "@/lib/schemas/empresa";

export const TAMANHO_MAXIMO_LOGO_BYTES = 1 * 1024 * 1024;
const TIPOS_LOGO_ACEITOS = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];

function validarArquivoLogo(arquivo: File): void {
  if (arquivo.size > TAMANHO_MAXIMO_LOGO_BYTES) {
    throw new Error(`Logo maior que o limite de ${TAMANHO_MAXIMO_LOGO_BYTES / (1024 * 1024)} MB`);
  }
  if (!TIPOS_LOGO_ACEITOS.includes(arquivo.type)) {
    throw new Error("Formato de logo não aceito — use PNG, JPG, SVG ou WebP");
  }
}

/** undefined = não mexe no campo; null = limpa; string = nova url. */
async function processarLogo(
  empresaId: string,
  logoUrlAtual: string | null,
  arquivo: File | null,
  removerLogo: boolean,
): Promise<string | null | undefined> {
  if (arquivo && arquivo.size > 0) {
    validarArquivoLogo(arquivo);
    const blob = await put(`empresas/${empresaId}/logo-${Date.now()}`, arquivo, {
      access: "public",
    });
    if (logoUrlAtual) await del(logoUrlAtual).catch(() => {});
    return blob.url;
  }
  if (removerLogo && logoUrlAtual) {
    await del(logoUrlAtual).catch(() => {});
    return null;
  }
  return undefined;
}

export async function listarEmpresas() {
  return prisma.empresa.findMany({ orderBy: { razaoSocial: "asc" } });
}

export async function criarEmpresa(sessao: SessaoAtiva, dados: EmpresaFormValues, logo: File | null = null) {
  requirePermission(sessao.perfil, "empresa:gerenciar");

  // Valida ANTES da transação — um arquivo inválido não deve deixar uma empresa órfã pra trás.
  if (logo && logo.size > 0) validarArquivoLogo(logo);

  let empresa = await prisma.$transaction(async (tx) => {
    const novaEmpresa = await tx.empresa.create({ data: dados });
    const vinculo = await tx.usuarioEmpresa.create({
      data: { usuarioId: sessao.usuarioId, empresaId: novaEmpresa.id, perfil: "ADMINISTRADOR" },
    });
    const matriz = await tx.filial.create({
      data: { empresaId: novaEmpresa.id, nome: "Matriz", cnpjCpf: dados.cnpjCpf },
    });
    await tx.usuarioEmpresaFilial.create({
      data: { usuarioEmpresaId: vinculo.id, filialId: matriz.id, podeAlterar: true, ativo: true },
    });
    return novaEmpresa;
  });

  if (logo && logo.size > 0) {
    try {
      const logoUrl = await processarLogo(empresa.id, null, logo, false);
      if (logoUrl) {
        empresa = await prisma.empresa.update({ where: { id: empresa.id }, data: { logoUrl } });
      }
    } catch (erro) {
      console.warn(`Falha ao subir logo da empresa ${empresa.id} recem-criada:`, erro);
    }
  }

  await registrarAuditoria({
    empresaId: empresa.id,
    filialId: null,
    usuarioId: sessao.usuarioId,
    entidade: "Empresa",
    entidadeId: empresa.id,
    acao: "CRIAR",
    anterior: null,
    novo: { ...dados, logoUrl: empresa.logoUrl },
  });

  return empresa;
}

export async function atualizarEmpresa(
  sessao: SessaoAtiva,
  id: string,
  dados: EmpresaFormValues,
  logo: File | null = null,
  removerLogo = false,
) {
  requirePermission(sessao.perfil, "empresa:gerenciar");

  const anterior = await prisma.empresa.findUniqueOrThrow({ where: { id } });
  const novoLogoUrl = await processarLogo(id, anterior.logoUrl, logo, removerLogo);

  const empresa = await prisma.empresa.update({
    where: { id },
    data: { ...dados, ...(novoLogoUrl !== undefined ? { logoUrl: novoLogoUrl } : {}) },
  });

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
      cnpjCpf: anterior.cnpjCpf,
      moedaPadrao: anterior.moedaPadrao,
      corPrimaria: anterior.corPrimaria,
      logoUrl: anterior.logoUrl,
    },
    novo: { ...dados, logoUrl: novoLogoUrl !== undefined ? novoLogoUrl : anterior.logoUrl },
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
