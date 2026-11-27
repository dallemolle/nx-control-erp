import { put, del } from "@vercel/blob";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { EmpresaFormValues } from "@/lib/schemas/empresa";
import { comMensagemDeDuplicidade } from "./duplicidade";

export const TAMANHO_MAXIMO_LOGO_BYTES = 1 * 1024 * 1024;
const TIPOS_LOGO_ACEITOS = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
const TIPOS_FAVICON_ACEITOS = ["image/png", "image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon"];

export type TipoImagemEmpresa = "logo" | "logo-escuro" | "favicon";

/**
 * Logo usa um Blob Store público separado do store privado dos anexos de título.
 * Com dois stores conectados ao projeto, o SDK precisa do storeId explícito pra saber
 * qual usar via OIDC — na Vercel isso funciona sem nenhum token manual; localmente
 * requer `vercel link && vercel env pull` uma vez (ver .env.example).
 */
function storeIdBlobLogo(): string | undefined {
  return process.env.BLOB_LOGO_READ_WRITE_TOKEN_STORE_ID;
}

function validarArquivoLogo(arquivo: File, tipo: TipoImagemEmpresa = "logo"): void {
  const nome = tipo === "favicon" ? "Favicon" : "Logo";
  if (arquivo.size > TAMANHO_MAXIMO_LOGO_BYTES) {
    throw new Error(`${nome} maior que o limite de ${TAMANHO_MAXIMO_LOGO_BYTES / (1024 * 1024)} MB`);
  }
  if (tipo === "favicon" ? !TIPOS_FAVICON_ACEITOS.includes(arquivo.type) : !TIPOS_LOGO_ACEITOS.includes(arquivo.type)) {
    throw new Error(
      tipo === "favicon"
        ? "Formato de favicon não aceito — use PNG, SVG ou ICO"
        : "Formato de logo não aceito — use PNG, JPG, SVG ou WebP",
    );
  }
}

/** Logo, logo para fundo escuro ou favicon no Blob público. undefined = não mexe; null = limpa; string = nova url. */
export async function processarImagemEmpresa(
  empresaId: string,
  urlAtual: string | null,
  arquivo: File | null,
  remover: boolean,
  tipo: TipoImagemEmpresa,
): Promise<string | null | undefined> {
  if (arquivo && arquivo.size > 0) {
    validarArquivoLogo(arquivo, tipo);
    const blob = await put(`empresas/${empresaId}/${tipo}-${Date.now()}`, arquivo, {
      access: "public",
      storeId: storeIdBlobLogo(),
    });
    if (urlAtual) await del(urlAtual, { storeId: storeIdBlobLogo() }).catch(() => {});
    return blob.url;
  }
  if (remover && urlAtual) {
    await del(urlAtual, { storeId: storeIdBlobLogo() }).catch(() => {});
    return null;
  }
  return undefined;
}

/** Empresas em que a pessoa é Administrador com vínculo ativo: só estas aparecem e podem ser alteradas. */
function ondeAdministra(usuarioId: string) {
  return { usuarios: { some: { usuarioId, ativo: true, perfil: "ADMINISTRADOR" as const } } };
}

export async function listarEmpresas(sessao: SessaoAtiva) {
  requirePermission(sessao.perfil, "empresa:gerenciar");
  return prisma.empresa.findMany({ where: ondeAdministra(sessao.usuarioId), orderBy: { razaoSocial: "asc" } });
}

/**
 * A empresa, se a pessoa a administra. Empresa de outro cliente dá o mesmo erro de inexistente, para não revelar
 * que ela existe.
 */
export async function empresaAdministrada(sessao: SessaoAtiva, empresaId: string) {
  requirePermission(sessao.perfil, "empresa:gerenciar");
  const empresa = await prisma.empresa.findFirst({ where: { id: empresaId, ...ondeAdministra(sessao.usuarioId) } });
  if (!empresa) throw new Error("Empresa não encontrada");
  return empresa;
}

const MSG_CNPJ_DUPLICADO = "Já existe uma empresa com este CNPJ/CPF";

/** Logo e cor ficam no Tema e marca (`atualizarMarca`); aqui, só os dados cadastrais. */
export async function criarEmpresa(sessao: SessaoAtiva, dados: EmpresaFormValues) {
  requirePermission(sessao.perfil, "empresa:gerenciar");

  // A Matriz nasce com o CNPJ da empresa: o repetido pode estar em qualquer das duas tabelas.
  const empresa = await comMensagemDeDuplicidade(() => prisma.$transaction(async (tx) => {
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
  }), MSG_CNPJ_DUPLICADO);

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
  const anterior = await empresaAdministrada(sessao, id);

  const empresa = await comMensagemDeDuplicidade(
    () => prisma.empresa.update({ where: { id }, data: dados }),
    MSG_CNPJ_DUPLICADO,
  );

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
      exigirAprovacaoPorOutro: anterior.exigirAprovacaoPorOutro,
    },
    novo: dados,
  });

  return empresa;
}

export async function definirAtivoEmpresa(sessao: SessaoAtiva, id: string, ativo: boolean) {
  await empresaAdministrada(sessao, id);
  // Inativa, a empresa não abre sessão: quem está nela seria jogado para fora na próxima tela.
  if (!ativo && id === sessao.empresaId) {
    throw new Error("Troque de empresa antes de inativar esta");
  }

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
