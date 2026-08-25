import { describe, expect, test } from "vitest";
import { requirePermission, PermissionError } from "./permissions";

describe("requirePermission", () => {
  test("ADMINISTRADOR pode executar qualquer ação", () => {
    expect(() => requirePermission("ADMINISTRADOR", "empresa:gerenciar")).not.toThrow();
  });

  test("CONSULTA não pode escrever em cadastros", () => {
    expect(() => requirePermission("CONSULTA", "cadastro:escrever")).toThrow(PermissionError);
  });

  test("CONSULTA pode ler cadastros", () => {
    expect(() => requirePermission("CONSULTA", "cadastro:ler")).not.toThrow();
  });

  test("AUDITOR não pode escrever em cadastros", () => {
    expect(() => requirePermission("AUDITOR", "cadastro:escrever")).toThrow(PermissionError);
  });

  test("FINANCEIRO pode escrever em cadastros", () => {
    expect(() => requirePermission("FINANCEIRO", "cadastro:escrever")).not.toThrow();
  });
});
