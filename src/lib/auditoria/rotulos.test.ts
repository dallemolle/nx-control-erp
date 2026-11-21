import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  ROTULOS_ACAO_AUDITORIA,
  ROTULOS_ENTIDADE_AUDITORIA,
  rotuloAcaoAuditoria,
  rotuloEntidadeAuditoria,
} from "./rotulos";

/** Os arquivos do servidor que gravam auditoria (sem os testes). */
function arquivosQueAuditam(): string[] {
  const raiz = join(process.cwd(), "src", "server");
  return readdirSync(raiz, { recursive: true, encoding: "utf8" })
    .filter((caminho) => caminho.endsWith(".ts") && !caminho.endsWith(".test.ts"))
    .map((caminho) => readFileSync(join(raiz, caminho), "utf8"))
    .filter((codigo) => codigo.includes("registrarAuditoria("));
}

function codigosGravados() {
  const entidades = new Set<string>();
  const acoes = new Set<string>();
  for (const codigo of arquivosQueAuditam()) {
    for (const [, entidade] of codigo.matchAll(/\bentidade: "([A-Z]\w+)"/g)) entidades.add(entidade);
    // `acao: "CRIAR"`, `acao: ativo ? "REATIVAR" : "INATIVAR"` e o código passado aos `auditar(...)` locais.
    for (const [, expressao] of codigo.matchAll(/\bacao: ([^,\n]+)/g)) {
      for (const [, acao] of expressao.matchAll(/"([A-Z][A-Z_]+)"/g)) acoes.add(acao);
    }
    for (const [, acao] of codigo.matchAll(/\bauditar\([^"]*?"([A-Z][A-Z_]+)"/g)) acoes.add(acao);
  }
  return { entidades: [...entidades].sort(), acoes: [...acoes].sort() };
}

describe("rótulos da Auditoria", () => {
  test("toda entidade e ação gravada pelo servidor tem rótulo", () => {
    const { entidades, acoes } = codigosGravados();
    expect(entidades.length).toBeGreaterThan(30);
    expect(acoes.length).toBeGreaterThan(25);
    expect(entidades.filter((e) => !Object.hasOwn(ROTULOS_ENTIDADE_AUDITORIA, e))).toEqual([]);
    expect(acoes.filter((a) => !Object.hasOwn(ROTULOS_ACAO_AUDITORIA, a))).toEqual([]);
  });

  test("traduz o código e deixa como está o que não conhece", () => {
    expect(rotuloEntidadeAuditoria("CategoriaFinanceira")).toBe("Categoria financeira");
    expect(rotuloAcaoAuditoria("CRIAR_LANCAMENTO_E_CONCILIAR")).toBe("Criar lançamento e conciliar");
    expect(rotuloEntidadeAuditoria("Desconhecida")).toBe("Desconhecida");
    expect(rotuloAcaoAuditoria("constructor")).toBe("constructor");
  });
});
