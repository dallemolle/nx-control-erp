/**
 * Lê o CHANGELOG.md gerado pelo release-please e devolve uma estrutura pronta
 * para a tela "Novidades": sem códigos de commit, sem itens internos (build,
 * banco, testes…), sem duplicadas e com nomes em português para o usuário.
 *
 * Duplicadas acontecem porque o merge commit de um PR guarda o título do PR;
 * quando ele começa com `feat:`/`fix:`, o release-please conta a mudança de
 * novo — às vezes cortada com "…". O arquivo fica como está (histórico); a
 * limpeza é feita aqui, na leitura.
 */

export type TipoSecao = "NOVIDADES" | "CORRECOES" | "DESEMPENHO" | "ATENCAO";

export type ItemNovidade = { modulo: string | null; texto: string };
export type SecaoNovidade = { tipo: TipoSecao; titulo: string; itens: ItemNovidade[] };
export type VersaoNovidade = { versao: string; data: string | null; secoes: SecaoNovidade[] };

const SECOES: Record<string, TipoSecao> = {
  features: "NOVIDADES",
  novidades: "NOVIDADES",
  "bug fixes": "CORRECOES",
  "correções": "CORRECOES",
  "performance improvements": "DESEMPENHO",
  desempenho: "DESEMPENHO",
  "⚠ breaking changes": "ATENCAO",
  "breaking changes": "ATENCAO",
  "atenção": "ATENCAO",
};

const TITULOS_SECAO: Record<TipoSecao, string> = {
  ATENCAO: "Atenção",
  NOVIDADES: "Novidades",
  CORRECOES: "Correções",
  DESEMPENHO: "Desempenho",
};

const ORDEM_SECAO: TipoSecao[] = ["ATENCAO", "NOVIDADES", "CORRECOES", "DESEMPENHO"];

/** Escopos de commit que só interessam à equipe de desenvolvimento. */
const MODULOS_INTERNOS = new Set(["build", "ci", "db", "deps", "test", "tests", "chore", "docs", "release", "infra"]);

const NOMES_MODULO: Record<string, string> = {
  api: "API",
  auditoria: "Auditoria",
  conciliacao: "Conciliação",
  controladoria: "Controladoria",
  dashboard: "Dashboard",
  estrategico: "Planejamento estratégico",
  export: "Exportação",
  financeiro: "Financeiro",
  fiscal: "Fiscal",
  orcamento: "Orçamento",
  relatorios: "Relatórios",
  tesouraria: "Tesouraria",
  ui: "Interface",
};

function nomeDoModulo(escopo: string): string {
  return NOMES_MODULO[escopo] ?? escopo.charAt(0).toUpperCase() + escopo.slice(1).replace(/-/g, " ");
}

// "## [0.1.11](url) (2026-11-07)" ou "## 0.1.0 (2026-08-24)"
const CABECALHO_VERSAO = /^##\s+\[?([0-9][^\]\s]*)\]?(?:\([^)]*\))?\s*(?:\((\d{4}-\d{2}-\d{2})\))?/;
const CABECALHO_SECAO = /^###\s+(.+?)\s*$/;
// "* **escopo:** texto ([abc1234](url))" — escopo opcional, link do commit no fim.
const ITEM = /^\*\s+(?:\*\*([^*]+?):\*\*\s+)?(.+?)\s*$/;
const REFERENCIA_COMMIT = /\s*\(\[[0-9a-f]{7,40}\]\([^)]*\)\).*$/;

function limparTexto(texto: string): string {
  return texto
    .replace(REFERENCIA_COMMIT, "")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .trim();
}

function chave(item: ItemNovidade): string {
  return `${item.modulo ?? ""}|${item.texto.toLocaleLowerCase("pt-BR")}`;
}

/**
 * Remove repetições dentro de uma seção: iguais (mesmo módulo e texto) e as
 * cópias cortadas com "…" quando existe a versão completa do mesmo texto.
 */
export function removerDuplicadas(itens: ItemNovidade[]): ItemNovidade[] {
  const completos = itens.filter((item) => !item.texto.endsWith("…"));
  const vistos = new Set<string>();
  const resultado: ItemNovidade[] = [];

  for (const item of itens) {
    if (item.texto.endsWith("…")) {
      const prefixo = item.texto.slice(0, -1).trimEnd().toLocaleLowerCase("pt-BR");
      const temCompleto = completos.some(
        (outro) => outro.modulo === item.modulo && outro.texto.toLocaleLowerCase("pt-BR").startsWith(prefixo),
      );
      if (temCompleto) continue;
    }
    const k = chave(item);
    if (vistos.has(k)) continue;
    vistos.add(k);
    resultado.push(item);
  }
  return resultado;
}

export function interpretarChangelog(markdown: string): VersaoNovidade[] {
  const versoes: VersaoNovidade[] = [];
  let versaoAtual: { versao: string; data: string | null; porTipo: Map<TipoSecao, ItemNovidade[]> } | null = null;
  let secaoAtual: TipoSecao | null = null;

  const fecharVersao = () => {
    if (!versaoAtual) return;
    const secoes = ORDEM_SECAO.flatMap((tipo) => {
      const itens = removerDuplicadas(versaoAtual!.porTipo.get(tipo) ?? []);
      return itens.length > 0 ? [{ tipo, titulo: TITULOS_SECAO[tipo], itens }] : [];
    });
    versoes.push({ versao: versaoAtual.versao, data: versaoAtual.data, secoes });
  };

  for (const linhaBruta of markdown.split(/\r?\n/)) {
    const linha = linhaBruta.trimEnd();

    const versao = CABECALHO_VERSAO.exec(linha);
    if (versao) {
      fecharVersao();
      versaoAtual = { versao: versao[1], data: versao[2] ?? null, porTipo: new Map() };
      secaoAtual = null;
      continue;
    }

    const secao = CABECALHO_SECAO.exec(linha);
    if (secao) {
      // Seção desconhecida (ex.: "Miscellaneous Chores") = interna: itens ignorados.
      secaoAtual = SECOES[secao[1].toLocaleLowerCase("pt-BR")] ?? null;
      continue;
    }

    const item = ITEM.exec(linha);
    if (item && versaoAtual && secaoAtual) {
      const escopo = item[1]?.trim().toLowerCase() ?? null;
      if (escopo && MODULOS_INTERNOS.has(escopo)) continue;
      const texto = limparTexto(item[2]);
      if (texto === "") continue;
      const itens = versaoAtual.porTipo.get(secaoAtual) ?? [];
      itens.push({ modulo: escopo ? nomeDoModulo(escopo) : null, texto: texto.charAt(0).toUpperCase() + texto.slice(1) });
      versaoAtual.porTipo.set(secaoAtual, itens);
    }
  }
  fecharVersao();

  return versoes;
}
