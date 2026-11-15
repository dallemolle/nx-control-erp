import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { Tema } from "@/lib/tema/schema";
import { validarTema, type ResultadoValidacao } from "@/lib/tema/validar";
import { processarImagemEmpresa } from "./empresa";

export const MSG_CONFIRMAR_AVISOS = "O tema tem avisos de contraste: confirme para aplicar";

/** JSON colado ou enviado → validação; texto que não é JSON vira erro, não exceção. */
export function analisarTexto(texto: string): ResultadoValidacao {
  try {
    return validarTema(JSON.parse(texto));
  } catch (erro) {
    return { ok: false, erros: [`JSON inválido: ${erro instanceof Error ? erro.message : String(erro)}`] };
  }
}

async function empresaGerenciavel(sessao: SessaoAtiva, empresaId: string) {
  requirePermission(sessao.perfil, "empresa:gerenciar");
  const empresa = await prisma.empresa.findUnique({ where: { id: empresaId } });
  if (!empresa) throw new Error("Empresa não encontrada");
  return empresa;
}

type Registro = Record<string, unknown> | null;

function auditar(sessao: SessaoAtiva, empresaId: string, acao: string, anterior: Registro, novo: Registro) {
  return registrarAuditoria({
    empresaId,
    filialId: null,
    usuarioId: sessao.usuarioId,
    entidade: "Empresa",
    entidadeId: empresaId,
    acao,
    anterior,
    novo,
  });
}

/** Valida e grava o tema da empresa; com avisos de contraste, só com confirmação. */
export async function importarTema(
  sessao: SessaoAtiva,
  empresaId: string,
  texto: string,
  confirmarAvisos: boolean,
): Promise<{ avisos: string[] }> {
  const empresa = await empresaGerenciavel(sessao, empresaId);
  const resultado = analisarTexto(texto);
  if (!resultado.ok) throw new Error(resultado.erros.join("\n"));
  if (resultado.avisos.length > 0 && !confirmarAvisos) throw new Error(MSG_CONFIRMAR_AVISOS);

  await prisma.empresa.update({
    where: { id: empresaId },
    data: { tema: resultado.tema as Prisma.InputJsonValue },
  });
  await auditar(sessao, empresaId, "IMPORTAR_TEMA", { tema: empresa.tema }, { tema: resultado.tema });
  return { avisos: resultado.avisos };
}

/** Volta ao visual padrão do sistema; logos e favicon ficam. */
export async function restaurarTemaPadrao(sessao: SessaoAtiva, empresaId: string): Promise<void> {
  const empresa = await empresaGerenciavel(sessao, empresaId);
  await prisma.empresa.update({ where: { id: empresaId }, data: { tema: Prisma.DbNull } });
  await auditar(sessao, empresaId, "RESTAURAR_TEMA", { tema: empresa.tema }, { tema: null });
}

/** Uploads do logo (fundo claro), do logo para fundo escuro e do favicon. */
export async function atualizarMarca(
  sessao: SessaoAtiva,
  empresaId: string,
  arquivos: {
    logo?: File | null;
    removerLogo?: boolean;
    logoEscuro: File | null;
    favicon: File | null;
    removerLogoEscuro: boolean;
    removerFavicon: boolean;
  },
): Promise<void> {
  const empresa = await empresaGerenciavel(sessao, empresaId);
  const logoUrl = await processarImagemEmpresa(
    empresaId,
    empresa.logoUrl,
    arquivos.logo ?? null,
    arquivos.removerLogo ?? false,
    "logo",
  );
  const logoEscuroUrl = await processarImagemEmpresa(
    empresaId,
    empresa.logoEscuroUrl,
    arquivos.logoEscuro,
    arquivos.removerLogoEscuro,
    "logo-escuro",
  );
  const faviconUrl = await processarImagemEmpresa(
    empresaId,
    empresa.faviconUrl,
    arquivos.favicon,
    arquivos.removerFavicon,
    "favicon",
  );
  const data = {
    ...(logoUrl !== undefined ? { logoUrl } : {}),
    ...(logoEscuroUrl !== undefined ? { logoEscuroUrl } : {}),
    ...(faviconUrl !== undefined ? { faviconUrl } : {}),
  };
  if (Object.keys(data).length === 0) return;

  await prisma.empresa.update({ where: { id: empresaId }, data });
  await auditar(
    sessao,
    empresaId,
    "ATUALIZAR_MARCA",
    { logoUrl: empresa.logoUrl, logoEscuroUrl: empresa.logoEscuroUrl, faviconUrl: empresa.faviconUrl },
    data,
  );
}

/** Tema gravado pronto para aplicar, ou null (sem tema ou inválido, ex.: o formato mudou). */
export function temaAplicavel(valor: Prisma.JsonValue | null): Tema | null {
  if (valor === null) return null;
  const resultado = validarTema(valor);
  if (resultado.ok) return resultado.tema;
  console.warn("Tema da empresa inválido; usando o padrão:", resultado.erros.join("; "));
  return null;
}
