import { prisma } from "@/server/db/client";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { TipoTitulo } from "@prisma/client";

/** Compara CNPJ/CPF ignorando pontuação — o cadastro não normaliza o valor digitado. */
export function normalizarDocumento(valor: string): string {
  return valor.replace(/\D/g, "");
}

/** Compara nome/código ignorando maiúsculas/minúsculas e espaços nas pontas. */
export function normalizarChave(valor: string): string {
  return valor.trim().toLowerCase();
}

export type CadastrosParaResolucao = {
  rotuloContraparte: string;
  mapaContraparte: Map<string, string>;
  mapaCategoria: Map<string, string>;
  mapaCentroCusto: Map<string, string>;
  mapaCentroLucro: Map<string, string>;
  mapaSafra: Map<string, string>;
  mapaProjeto: Map<string, string>;
  mapaContaBancaria: Map<string, string>;
};

export async function carregarCadastrosParaResolucao(
  sessao: SessaoAtiva,
  tipo: TipoTitulo,
): Promise<CadastrosParaResolucao> {
  const [contrapartes, categorias, centrosCusto, centrosLucro, safras, projetos, contasBancarias] =
    await Promise.all([
      tipo === "PAGAR"
        ? prisma.fornecedor.findMany({ where: { empresaId: sessao.empresaId }, select: { id: true, cnpjCpf: true } })
        : prisma.cliente.findMany({ where: { empresaId: sessao.empresaId }, select: { id: true, cnpjCpf: true } }),
      prisma.categoriaFinanceira.findMany({ where: { filialId: sessao.filialId }, select: { id: true, nome: true } }),
      prisma.centroCusto.findMany({ where: { filialId: sessao.filialId }, select: { id: true, codigo: true } }),
      prisma.centroLucro.findMany({ where: { filialId: sessao.filialId }, select: { id: true, codigo: true } }),
      prisma.safra.findMany({ where: { filialId: sessao.filialId }, select: { id: true, nome: true } }),
      prisma.projeto.findMany({ where: { filialId: sessao.filialId }, select: { id: true, codigo: true } }),
      prisma.contaBancaria.findMany({
        where: { filialId: sessao.filialId },
        select: { id: true, agencia: true, conta: true },
      }),
    ]);

  return {
    rotuloContraparte: tipo === "PAGAR" ? "Fornecedor" : "Cliente",
    mapaContraparte: new Map(contrapartes.map((c) => [normalizarDocumento(c.cnpjCpf), c.id])),
    mapaCategoria: new Map(categorias.map((c) => [normalizarChave(c.nome), c.id])),
    mapaCentroCusto: new Map(centrosCusto.map((c) => [normalizarChave(c.codigo), c.id])),
    mapaCentroLucro: new Map(centrosLucro.map((c) => [normalizarChave(c.codigo), c.id])),
    mapaSafra: new Map(safras.map((s) => [normalizarChave(s.nome), s.id])),
    mapaProjeto: new Map(projetos.map((p) => [normalizarChave(p.codigo), p.id])),
    mapaContaBancaria: new Map(
      contasBancarias.map((c) => [`${normalizarChave(c.agencia)}|${normalizarChave(c.conta)}`, c.id]),
    ),
  };
}

/**
 * Versão restrita de `carregarCadastrosParaResolucao` para rotas que só
 * precisam resolver conta bancária (agência+conta) — evita buscar
 * fornecedores/clientes/categorias/centros/safras/projetos que não são
 * usados (ex.: `baixas`, `extratos/importar`).
 */
export async function carregarContaBancariaParaResolucao(
  sessao: SessaoAtiva,
): Promise<Pick<CadastrosParaResolucao, "mapaContaBancaria">> {
  const contasBancarias = await prisma.contaBancaria.findMany({
    where: { filialId: sessao.filialId },
    select: { id: true, agencia: true, conta: true },
  });
  return {
    mapaContaBancaria: new Map(
      contasBancarias.map((c) => [`${normalizarChave(c.agencia)}|${normalizarChave(c.conta)}`, c.id]),
    ),
  };
}

export function resolverContraparte(
  cadastros: CadastrosParaResolucao,
  cnpjCpfBruto: string,
  erros: string[],
  camposComErroResolucao: Set<string>,
  campoRequisicao: string = "cnpjCpf",
): string {
  const valor = cnpjCpfBruto.trim();
  if (!valor) return "";
  const encontrado = cadastros.mapaContraparte.get(normalizarDocumento(valor));
  if (!encontrado) {
    erros.push(`${cadastros.rotuloContraparte} com CNPJ/CPF "${valor}" não encontrado`);
    camposComErroResolucao.add(campoRequisicao);
    return "";
  }
  return encontrado;
}

export function resolverCategoriaFinanceira(
  cadastros: CadastrosParaResolucao,
  nomeBruto: string,
  erros: string[],
  camposComErroResolucao: Set<string>,
  campoRequisicao: string = "categoriaFinanceira",
): string {
  const valor = nomeBruto.trim();
  if (!valor) return "";
  const encontrado = cadastros.mapaCategoria.get(normalizarChave(valor));
  if (!encontrado) {
    erros.push(`Categoria financeira "${valor}" não encontrada`);
    camposComErroResolucao.add(campoRequisicao);
    return "";
  }
  return encontrado;
}

export function resolverCodigoOpcional(
  mapa: Map<string, string>,
  valorBruto: string | undefined,
  rotulo: string,
  campoRequisicao: string,
  erros: string[],
  camposComErroResolucao: Set<string>,
): string {
  const valor = (valorBruto ?? "").trim();
  if (!valor) return "";
  const encontrado = mapa.get(normalizarChave(valor));
  if (!encontrado) {
    erros.push(`${rotulo} "${valor}" não encontrado`);
    camposComErroResolucao.add(campoRequisicao);
    return "";
  }
  return encontrado;
}

export function resolverContaBancariaOpcional(
  cadastros: Pick<CadastrosParaResolucao, "mapaContaBancaria">,
  agenciaBruta: string | undefined,
  contaBruta: string | undefined,
  erros: string[],
  camposComErroResolucao: Set<string>,
): string {
  const agencia = (agenciaBruta ?? "").trim();
  const conta = (contaBruta ?? "").trim();
  if (!agencia && !conta) return "";
  if (!agencia || !conta) {
    erros.push("Informe agência e conta bancária juntas, ou deixe as duas em branco");
    camposComErroResolucao.add("contaBancariaAgencia");
    camposComErroResolucao.add("contaBancariaConta");
    return "";
  }
  const encontrado = cadastros.mapaContaBancaria.get(`${normalizarChave(agencia)}|${normalizarChave(conta)}`);
  if (!encontrado) {
    erros.push(`Conta bancária agência "${agencia}" / conta "${conta}" não encontrada`);
    camposComErroResolucao.add("contaBancariaAgencia");
    camposComErroResolucao.add("contaBancariaConta");
    return "";
  }
  return encontrado;
}
