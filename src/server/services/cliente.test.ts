import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { criarCliente } from "./cliente";
import { FilialSomenteLeituraError } from "@/server/auth/permissions";
import type { SessaoAtiva } from "@/server/auth/sessao";

describe("cliente - permissão de alteração por filial", () => {
  let empresaId: string;
  let filialId: string;

  beforeAll(async () => {
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    const empresa = await prisma.empresa.create({
      data: {
        razaoSocial: "Teste Cliente Filial Ltda",
        nomeFantasia: "Teste Cliente Filial",
        cnpj: `${randomSuffix}/0001-99`,
      },
    });
    empresaId = empresa.id;

    const randomSuffix2 = Math.random().toString(36).substring(2, 10);
    const filial = await prisma.filial.create({
      data: {
        empresaId,
        nome: "Filial Teste",
        cnpj: `${randomSuffix2}/0002-99`,
        ativo: true,
      },
    });
    filialId = filial.id;
  });

  afterAll(async () => {
    await prisma.filial.delete({ where: { id: filialId } });
    await prisma.empresa.delete({ where: { id: empresaId } });
    await prisma.$disconnect();
  });

  test("lança FilialSomenteLeituraError quando podeAlterarFilial é false", async () => {
    const sessao: SessaoAtiva = {
      usuarioId: "test-usuario-id",
      nome: "Usuário Teste",
      empresaId,
      perfil: "FINANCEIRO",
      filialId,
      podeAlterarFilial: false,
    };

    const dados = {
      nome: "Cliente Teste",
      cnpjCpf: "12.345.678/0001-90",
      contato: "Contato",
      email: "cliente@teste.local",
      telefone: "1234567890",
    };

    await expect(criarCliente(sessao, dados)).rejects.toThrow(FilialSomenteLeituraError);
  });
});
