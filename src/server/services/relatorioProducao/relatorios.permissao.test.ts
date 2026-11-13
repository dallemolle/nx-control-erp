import { describe, expect, test, vi } from "vitest";
import { PermissionError } from "@/server/auth/permissions";
import type { SessaoAtiva } from "@/server/auth/sessao";
import { buscarRelatorioMensal } from "./mensal";
import { buscarRelatorioVendas } from "./vendas";

vi.mock("@/server/auth/permissions", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/auth/permissions")>();
  return {
    ...real,
    requirePermission: (perfil: Parameters<typeof real.requirePermission>[0], acao: Parameters<typeof real.requirePermission>[1]) => {
      if (acao === "producao:ler") throw new real.PermissionError(perfil, acao);
    },
  };
});

describe("relatórios de produção: permissão", () => {
  const sessao: SessaoAtiva = {
    usuarioId: "u",
    nome: "Teste",
    empresaId: "e",
    perfil: "CONSULTA",
    filialId: "f",
    podeAlterarFilial: false,
  };
  const dia = new Date("2026-11-20T00:00:00.000Z");

  test("sem producao:ler o mensal é recusado antes de consultar o banco", async () => {
    await expect(buscarRelatorioMensal(sessao, 2026)).rejects.toThrow(PermissionError);
  });

  test("sem producao:ler o de vendas é recusado antes de consultar o banco", async () => {
    await expect(buscarRelatorioVendas(sessao, { inicio: dia, fim: dia }, dia)).rejects.toThrow(PermissionError);
  });
});
