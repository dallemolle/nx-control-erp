import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { requireAlteracaoFilial, requirePermission } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { OperadoraCartaoFormValues } from "@/lib/schemas/operadoraCartao";
import type { CondicaoCartao } from "@/lib/producao/cartao";

type Tx = Prisma.TransactionClient;

export async function listarOperadoras(filialId: string) {
  return prisma.operadoraCartao.findMany({
    where: { filialId },
    include: {
      condicoes: { orderBy: [{ modalidade: "asc" }, { parcelasDe: "asc" }] },
      contaBancaria: { include: { banco: { select: { nome: true } } } },
      categoriaTaxa: { select: { nome: true } },
      fornecedor: { select: { cnpjCpf: true } },
    },
    orderBy: { nome: "asc" },
  });
}

export type OperadoraListada = Awaited<ReturnType<typeof listarOperadoras>>[number];

/** Decimal do banco → número da função de cálculo. */
export function condicoesDaOperadora(operadora: {
  condicoes: (Omit<CondicaoCartao, "taxaPercentual"> & { taxaPercentual: Prisma.Decimal | number })[];
}): CondicaoCartao[] {
  return operadora.condicoes.map((c) => ({
    modalidade: c.modalidade,
    parcelasDe: c.parcelasDe,
    parcelasAte: c.parcelasAte,
    taxaPercentual: Number(c.taxaPercentual),
    prazoDias: c.prazoDias,
    antecipado: c.antecipado,
  }));
}

async function validarReferencias(tx: Tx, sessao: SessaoAtiva, dados: OperadoraCartaoFormValues) {
  const conta = await tx.contaBancaria.findFirst({
    where: { id: dados.contaBancariaId, filialId: sessao.filialId, ativo: true },
    select: { tipo: true },
  });
  if (!conta) throw new Error("Conta não encontrada ou inativa");
  if (conta.tipo === "CAIXA") throw new Error("A conta de depósito não pode ser uma conta Caixa");
  const categoria = await tx.categoriaFinanceira.findFirst({
    where: { id: dados.categoriaTaxaId, filialId: sessao.filialId, ativo: true },
    select: { tipo: true },
  });
  if (!categoria) throw new Error("Categoria não encontrada ou inativa");
  if (categoria.tipo !== "DESPESA") throw new Error("A categoria da taxa deve ser de despesa");
}

/** Fornecedor (taxa) e cliente (repasses) da empresa com o CNPJ; cria os que faltam (D-38). */
async function contrapartesPorCnpj(tx: Tx, sessao: SessaoAtiva, nome: string, cnpjCpf: string) {
  const empresaId = sessao.empresaId;
  let fornecedor = await tx.fornecedor.findUnique({ where: { empresaId_cnpjCpf: { empresaId, cnpjCpf } } });
  if (fornecedor && !fornecedor.ativo) throw new Error("O fornecedor com este CNPJ está inativo; reative o cadastro");
  fornecedor ??= await tx.fornecedor.create({ data: { empresaId, nome, cnpjCpf } });
  let cliente = await tx.cliente.findUnique({ where: { empresaId_cnpjCpf: { empresaId, cnpjCpf } } });
  if (cliente && !cliente.ativo) throw new Error("O cliente com este CNPJ está inativo; reative o cadastro");
  cliente ??= await tx.cliente.create({ data: { empresaId, nome, cnpjCpf } });
  return { fornecedorId: fornecedor.id, clienteId: cliente.id };
}

function traduzirNomeRepetido(erro: unknown): never {
  if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
    throw new Error("Já existe uma operadora com este nome");
  }
  throw erro;
}

export async function criarOperadora(sessao: SessaoAtiva, dados: OperadoraCartaoFormValues) {
  requirePermission(sessao.perfil, "cadastro:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);
  return prisma
    .$transaction(async (tx) => {
      await validarReferencias(tx, sessao, dados);
      const contrapartes = await contrapartesPorCnpj(tx, sessao, dados.nome, dados.cnpjCpf);
      const operadora = await tx.operadoraCartao.create({
        data: {
          filialId: sessao.filialId,
          nome: dados.nome,
          contaBancariaId: dados.contaBancariaId,
          categoriaTaxaId: dados.categoriaTaxaId,
          ...contrapartes,
          condicoes: { create: dados.condicoes },
        },
      });
      await registrarAuditoria(
        {
          empresaId: sessao.empresaId,
          filialId: sessao.filialId,
          usuarioId: sessao.usuarioId,
          entidade: "OperadoraCartao",
          entidadeId: operadora.id,
          acao: "CRIAR",
          anterior: null,
          novo: { ...dados, ...contrapartes },
        },
        tx,
      );
      return operadora;
    })
    .catch(traduzirNomeRepetido);
}

export async function atualizarOperadora(sessao: SessaoAtiva, id: string, dados: OperadoraCartaoFormValues) {
  requirePermission(sessao.perfil, "cadastro:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);
  return prisma
    .$transaction(async (tx) => {
      const anterior = await tx.operadoraCartao.findFirstOrThrow({
        where: { id, filialId: sessao.filialId },
        include: { condicoes: true },
      });
      await validarReferencias(tx, sessao, dados);
      const contrapartes = await contrapartesPorCnpj(tx, sessao, dados.nome, dados.cnpjCpf);
      await tx.condicaoOperadoraCartao.deleteMany({ where: { operadoraId: id } });
      const operadora = await tx.operadoraCartao.update({
        where: { id },
        data: {
          nome: dados.nome,
          contaBancariaId: dados.contaBancariaId,
          categoriaTaxaId: dados.categoriaTaxaId,
          ...contrapartes,
          condicoes: { create: dados.condicoes },
        },
      });
      await registrarAuditoria(
        {
          empresaId: sessao.empresaId,
          filialId: sessao.filialId,
          usuarioId: sessao.usuarioId,
          entidade: "OperadoraCartao",
          entidadeId: id,
          acao: "ATUALIZAR",
          anterior: {
            nome: anterior.nome,
            contaBancariaId: anterior.contaBancariaId,
            categoriaTaxaId: anterior.categoriaTaxaId,
            fornecedorId: anterior.fornecedorId,
            clienteId: anterior.clienteId,
            condicoes: condicoesDaOperadora(anterior),
          },
          novo: { ...dados, ...contrapartes },
        },
        tx,
      );
      return operadora;
    })
    .catch(traduzirNomeRepetido);
}

export async function definirAtivoOperadora(sessao: SessaoAtiva, id: string, ativo: boolean) {
  requirePermission(sessao.perfil, "cadastro:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);
  await prisma.operadoraCartao.findFirstOrThrow({ where: { id, filialId: sessao.filialId } });
  const operadora = await prisma.operadoraCartao.update({ where: { id }, data: { ativo } });
  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "OperadoraCartao",
    entidadeId: id,
    acao: ativo ? "REATIVAR" : "INATIVAR",
    anterior: { ativo: !ativo },
    novo: { ativo },
  });
  return operadora;
}
