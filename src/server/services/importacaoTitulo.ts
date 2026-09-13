import Papa from "papaparse";
import { prisma } from "@/server/db/client";
import { tituloSchema } from "@/lib/schemas/titulo";
import { criarTitulo } from "@/server/services/titulo";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { TipoTitulo } from "@prisma/client";

export type LinhaImportacao = {
  linha: number;
  bruta: Record<string, string>;
  erros: string[];
};

/** Compara CNPJ/CPF ignorando pontuação — o cadastro não normaliza o valor digitado. */
function normalizarDocumento(valor: string): string {
  return valor.replace(/\D/g, "");
}

/** Compara nome/código ignorando maiúsculas/minúsculas e espaços nas pontas. */
function normalizarChave(valor: string): string {
  return valor.trim().toLowerCase();
}

async function construirResolvedor(sessao: SessaoAtiva, tipo: TipoTitulo) {
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

  const rotuloContraparte = tipo === "PAGAR" ? "Fornecedor" : "Cliente";
  const mapaContraparte = new Map(contrapartes.map((c) => [normalizarDocumento(c.cnpjCpf), c.id]));
  const mapaCategoria = new Map(categorias.map((c) => [normalizarChave(c.nome), c.id]));
  const mapaCentroCusto = new Map(centrosCusto.map((c) => [normalizarChave(c.codigo), c.id]));
  const mapaCentroLucro = new Map(centrosLucro.map((c) => [normalizarChave(c.codigo), c.id]));
  const mapaSafra = new Map(safras.map((s) => [normalizarChave(s.nome), s.id]));
  const mapaProjeto = new Map(projetos.map((p) => [normalizarChave(p.codigo), p.id]));
  const mapaContaBancaria = new Map(
    contasBancarias.map((c) => [`${normalizarChave(c.agencia)}|${normalizarChave(c.conta)}`, c.id]),
  );

  function resolverCodigoOpcional(
    valorBruto: string | undefined,
    mapa: Map<string, string>,
    rotulo: string,
    erros: string[],
  ): string {
    const valor = (valorBruto ?? "").trim();
    if (!valor) return "";
    const encontrado = mapa.get(normalizarChave(valor));
    if (!encontrado) {
      erros.push(`${rotulo} "${valor}" não encontrado`);
      return "";
    }
    return encontrado;
  }

  function resolverLinha(bruta: Record<string, string>): {
    dados: Record<string, unknown>;
    erros: string[];
    camposComErroResolucao: Set<string>;
  } {
    const erros: string[] = [];
    const camposComErroResolucao = new Set<string>();

    const cnpjCpfBruto = (bruta.cnpjCpf ?? "").trim();
    let contraparteId = "";
    if (cnpjCpfBruto) {
      const encontrado = mapaContraparte.get(normalizarDocumento(cnpjCpfBruto));
      if (!encontrado) {
        erros.push(`${rotuloContraparte} com CNPJ/CPF "${cnpjCpfBruto}" não encontrado`);
        camposComErroResolucao.add("contraparteId");
      } else {
        contraparteId = encontrado;
      }
    }

    const categoriaBruta = (bruta.categoriaFinanceira ?? "").trim();
    let categoriaFinanceiraId = "";
    if (categoriaBruta) {
      const encontrado = mapaCategoria.get(normalizarChave(categoriaBruta));
      if (!encontrado) {
        erros.push(`Categoria financeira "${categoriaBruta}" não encontrada`);
        camposComErroResolucao.add("categoriaFinanceiraId");
      } else {
        categoriaFinanceiraId = encontrado;
      }
    }

    const centroCustoId = resolverCodigoOpcional(bruta.centroCusto, mapaCentroCusto, "Centro de custo", erros);
    const centroLucroId = resolverCodigoOpcional(bruta.centroLucro, mapaCentroLucro, "Centro de lucro", erros);
    const safraId = resolverCodigoOpcional(bruta.safra, mapaSafra, "Safra", erros);
    const projetoId = resolverCodigoOpcional(bruta.projeto, mapaProjeto, "Projeto", erros);

    const agenciaBruta = (bruta.contaBancariaAgencia ?? "").trim();
    const contaBruta = (bruta.contaBancariaConta ?? "").trim();
    let contaBancariaId = "";
    if (agenciaBruta || contaBruta) {
      if (!agenciaBruta || !contaBruta) {
        erros.push("Informe agência e conta bancária juntas, ou deixe as duas em branco");
      } else {
        const encontrado = mapaContaBancaria.get(`${normalizarChave(agenciaBruta)}|${normalizarChave(contaBruta)}`);
        if (!encontrado) {
          erros.push(`Conta bancária agência "${agenciaBruta}" / conta "${contaBruta}" não encontrada`);
        } else {
          contaBancariaId = encontrado;
        }
      }
    }

    const dados = {
      contraparteId,
      documento: bruta.documento,
      dataEmissao: bruta.dataEmissao,
      dataCompetencia: bruta.dataCompetencia,
      categoriaFinanceiraId,
      centroCustoId,
      centroLucroId,
      safraId,
      projetoId,
      contaBancariaId,
      formaPagamento: bruta.formaPagamento,
      parcelas: [
        {
          numero: bruta.numeroParcela || "1",
          dataVencimento: bruta.dataVencimento,
          valorOriginal: bruta.valorOriginal,
        },
      ],
    };

    return { dados, erros, camposComErroResolucao };
  }

  return { resolverLinha };
}

export async function validarCsv(
  sessao: SessaoAtiva,
  tipo: TipoTitulo,
  conteudoCsv: string,
): Promise<LinhaImportacao[]> {
  const resultado = Papa.parse<Record<string, string>>(conteudoCsv, { header: true, skipEmptyLines: true });
  const { resolverLinha } = await construirResolvedor(sessao, tipo);

  return resultado.data.map((bruta, indice) => {
    const { dados, erros: errosResolucao, camposComErroResolucao } = resolverLinha(bruta);
    const parsed = tituloSchema.safeParse(dados);
    const errosSchema = parsed.success
      ? []
      : parsed.error.issues
          .filter((issue) => !camposComErroResolucao.has(String(issue.path[0])))
          .map((issue) => issue.message);
    return { linha: indice + 2, bruta, erros: [...errosResolucao, ...errosSchema] };
  });
}

export async function confirmarImportacao(sessao: SessaoAtiva, tipo: TipoTitulo, linhas: LinhaImportacao[]) {
  if (linhas.length === 0) {
    throw new Error("Nenhuma linha para importar");
  }
  if (linhas.some((linha) => linha.erros.length > 0)) {
    throw new Error("Existem linhas inválidas — corrija ou remova antes de importar");
  }

  const { resolverLinha } = await construirResolvedor(sessao, tipo);

  return prisma.$transaction(async (tx) => {
    const criados = [];
    for (const linha of linhas) {
      const { dados, erros } = resolverLinha(linha.bruta);
      if (erros.length > 0) {
        throw new Error("Existem linhas inválidas — corrija ou remova antes de importar");
      }
      const dadosValidados = tituloSchema.parse(dados);
      criados.push(await criarTitulo(sessao, tipo, dadosValidados, tx));
    }
    return criados;
  });
}
