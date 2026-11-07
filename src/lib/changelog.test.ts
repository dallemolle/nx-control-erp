import { describe, expect, test } from "vitest";
import { interpretarChangelog, removerDuplicadas } from "./changelog";

const URL = "https://github.com/dallemolle/nx-control-erp/commit";

const EXEMPLO = `# Changelog

## [0.1.11](https://github.com/dallemolle/nx-control-erp/compare/nx-control-erp-v0.1.10...nx-control-erp-v0.1.11) (2026-11-07)


### Features

* **auditoria:** PDF limitado aos 2.000 registros mais recentes, com … ([00d6b0b](${URL}/00d6b0b))
* **auditoria:** PDF limitado aos 2.000 registros mais recentes, com aviso ([31b1d53](${URL}/31b1d53))

## [0.1.10](https://github.com/x/compare/a...b) (2026-11-07)


### Bug Fixes

* **build:** deploy deixa de levar o projeto inteiro no pacote do serv… ([efbd5c4](${URL}/efbd5c4))
* **build:** deploy deixa de levar o projeto inteiro no pacote do servidor ([4d77a8e](${URL}/4d77a8e))

## [0.1.6](https://github.com/x/compare/a...b) (2026-09-20)


### Features

* **estrategico:** filtro \`Fiscal\` no fluxo ([aaaaaaa](${URL}/aaaaaaa))


### Bug Fixes

* deriva tons de hover da cor da empresa na sidebar ([0ddd2b0](${URL}/0ddd2b0))
* deriva tons de hover da cor da empresa na sidebar ([723f337](${URL}/723f337))
* deriva tons de hover da cor da empresa na sidebar ([a47fc31](${URL}/a47fc31))


### Performance Improvements

* **dashboard:** consultas consolidadas em lote ([bbbbbbb](${URL}/bbbbbbb))


### Miscellaneous Chores

* atualiza dependências ([ccccccc](${URL}/ccccccc))

## 0.1.0 (2026-08-24)


### Features

* primeira versão ([ddddddd](${URL}/ddddddd))
`;

describe("interpretarChangelog", () => {
  const versoes = interpretarChangelog(EXEMPLO);

  test("lê versões na ordem do arquivo, com número e data", () => {
    expect(versoes.map((v) => [v.versao, v.data])).toEqual([
      ["0.1.11", "2026-11-07"],
      ["0.1.10", "2026-11-07"],
      ["0.1.6", "2026-09-20"],
      ["0.1.0", "2026-08-24"],
    ]);
  });

  test("remove a cópia cortada com … e o código do commit", () => {
    expect(versoes[0].secoes).toEqual([
      {
        tipo: "NOVIDADES",
        titulo: "Novidades",
        itens: [{ modulo: "Auditoria", texto: "PDF limitado aos 2.000 registros mais recentes, com aviso" }],
      },
    ]);
  });

  test("esconde itens internos (build) — a versão fica sem seções", () => {
    expect(versoes[1].secoes).toEqual([]);
  });

  test("traduz seções, nomeia módulos, junta repetidas e ignora seções internas", () => {
    const secoes = versoes[2].secoes;
    expect(secoes.map((s) => s.titulo)).toEqual(["Novidades", "Correções", "Desempenho"]);
    expect(secoes[0].itens).toEqual([{ modulo: "Planejamento estratégico", texto: "Filtro Fiscal no fluxo" }]);
    expect(secoes[1].itens).toEqual([{ modulo: null, texto: "Deriva tons de hover da cor da empresa na sidebar" }]);
    expect(secoes[2].itens).toEqual([{ modulo: "Dashboard", texto: "Consultas consolidadas em lote" }]);
  });

  test("aceita cabeçalho de versão sem link (primeira release)", () => {
    expect(versoes[3].secoes[0].itens[0].texto).toBe("Primeira versão");
  });

  test("arquivo vazio ou sem versões devolve lista vazia", () => {
    expect(interpretarChangelog("")).toEqual([]);
    expect(interpretarChangelog("# Changelog\n")).toEqual([]);
  });

  test("seções já em português (config nova do release-please) são reconhecidas", () => {
    const md = "## [0.2.0](x) (2026-12-01)\n\n### Novidades\n\n* **financeiro:** algo novo ([1234567](x))\n\n### Correções\n\n* algo corrigido ([7654321](x))\n";
    expect(interpretarChangelog(md)[0].secoes.map((s) => s.titulo)).toEqual(["Novidades", "Correções"]);
  });
});

describe("removerDuplicadas", () => {
  test("mantém a cortada quando não existe a versão completa (não some com informação)", () => {
    const itens = [{ modulo: "Auditoria", texto: "Texto que só existe cortado …" }];
    expect(removerDuplicadas(itens)).toEqual(itens);
  });

  test("módulos diferentes com o mesmo texto não são duplicadas", () => {
    const itens = [
      { modulo: "Financeiro", texto: "Exportação em PDF" },
      { modulo: "Auditoria", texto: "Exportação em PDF" },
    ];
    expect(removerDuplicadas(itens)).toHaveLength(2);
  });
});
