import { prisma } from "@/server/db/client";
import { hashChaveApi } from "@/server/services/apiKey";
import { normalizarDocumento } from "@/server/services/resolucaoCadastros";
import { requireVinculoAtivo, AcessoNegadoError } from "@/server/services/usuarioEmpresa";
import { requireVinculoFilialAtivo, AcessoFilialNegadoError } from "@/server/services/usuarioEmpresaFilial";
import type { SessaoAtiva } from "@/server/auth/sessao";

export class ApiAuthError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiAuthError";
    this.status = status;
  }
}

export async function requireSessaoApi(request: Request): Promise<SessaoAtiva> {
  const cabecalhoAuth = request.headers.get("authorization") ?? "";
  const [esquema, chave] = cabecalhoAuth.split(" ");
  if (esquema !== "Bearer" || !chave) {
    throw new ApiAuthError(401, "Chave de API ausente ou mal formada");
  }

  const apiKey = await prisma.apiKey.findUnique({
    where: { chaveHash: hashChaveApi(chave) },
    include: { usuario: true },
  });
  if (!apiKey) {
    throw new ApiAuthError(401, "Chave de API inválida");
  }
  if (apiKey.revogadaEm) {
    throw new ApiAuthError(401, "Chave de API revogada");
  }
  if (!apiKey.usuario.ativo) {
    throw new ApiAuthError(401, "Usuário inativo");
  }

  await prisma.apiKey.update({ where: { id: apiKey.id }, data: { ultimoUsoEm: new Date() } });

  const filialCnpjCpfBruto = request.headers.get("x-filial-cnpjcpf");
  if (!filialCnpjCpfBruto) {
    throw new ApiAuthError(400, "Informe o header X-Filial-CnpjCpf");
  }

  // Uma filial pertence a exatamente uma empresa (FK obrigatória) — dado o CNPJ/CPF
  // da filial, a empresa é derivada, sem precisar de um segundo identificador na
  // requisição. A tabela de filiais é pequena (uma por unidade operacional real),
  // então buscar todas e comparar normalizado em memória é consistente com o mesmo
  // padrão já usado para fornecedor/cliente em resolucaoCadastros.ts.
  const filialCnpjCpfNormalizado = normalizarDocumento(filialCnpjCpfBruto);
  const filiais = await prisma.filial.findMany({ select: { id: true, empresaId: true, cnpjCpf: true } });
  const filial = filiais.find((f) => normalizarDocumento(f.cnpjCpf) === filialCnpjCpfNormalizado);

  // Mensagem única tanto para "não existe" quanto para "existe mas sem vínculo" —
  // evita que a resposta revele se aquele CNPJ/CPF está cadastrado no sistema.
  const erroFilial = () => new ApiAuthError(403, "Filial não encontrada, ou usuário sem vínculo com ela");
  if (!filial) {
    throw erroFilial();
  }

  let perfil;
  try {
    perfil = await requireVinculoAtivo(apiKey.usuarioId, filial.empresaId);
  } catch (erro) {
    if (erro instanceof AcessoNegadoError) {
      throw erroFilial();
    }
    throw erro;
  }

  try {
    const { podeAlterar } = await requireVinculoFilialAtivo(apiKey.usuarioId, filial.empresaId, filial.id);
    return {
      usuarioId: apiKey.usuarioId,
      nome: apiKey.usuario.nome,
      empresaId: filial.empresaId,
      perfil,
      filialId: filial.id,
      podeAlterarFilial: podeAlterar,
    };
  } catch (erro) {
    if (erro instanceof AcessoFilialNegadoError) {
      throw erroFilial();
    }
    throw erro;
  }
}
