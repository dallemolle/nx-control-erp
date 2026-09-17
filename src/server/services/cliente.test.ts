import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { criarCliente, atualizarCliente } from "./cliente";
import { FilialSomenteLeituraError } from "@/server/auth/permissions";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { ClienteFormValues } from "@/lib/schemas/cliente";

describe("cliente - permissão de alteração por filial", () => {
  let empresaId: string;
  let filialId: string;

  beforeAll(async () => {
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    const empresa = await prisma.empresa.create({
      data: {
        razaoSocial: "Teste Cliente Filial Ltda",
        nomeFantasia: "Teste Cliente Filial",
        cnpjCpf: `${randomSuffix}/0001-99`,
      },
    });
    empresaId = empresa.id;

    const randomSuffix2 = Math.random().toString(36).substring(2, 10);
    const filial = await prisma.filial.create({
      data: {
        empresaId,
        nome: "Filial Teste",
        cnpjCpf: `${randomSuffix2}/0002-99`,
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

describe("cliente - dados bancários", () => {
  let empresaId: string;
  let filialId: string;
  let bancoId: string;
  let usuarioId: string;
  let sessao: SessaoAtiva;
  const clientesCriados: string[] = [];

  const dadosBase = {
    nome: "Cliente Bancário",
    cnpjCpf: "12.345.678/0001-90",
    contato: "",
    email: "",
    telefone: "",
  };

  beforeAll(async () => {
    const sufixo = Math.random().toString(36).substring(2, 10);
    const empresa = await prisma.empresa.create({
      data: {
        razaoSocial: "Teste Cliente Bancário Ltda",
        nomeFantasia: "Teste Cliente Bancário",
        cnpjCpf: `${sufixo}/0001-98`,
      },
    });
    empresaId = empresa.id;

    const filial = await prisma.filial.create({
      data: { empresaId, nome: "Filial Bancária", cnpjCpf: `${sufixo}/0002-98`, ativo: true },
    });
    filialId = filial.id;

    const banco = await prisma.banco.create({ data: { codigo: `b${sufixo}`, nome: "Banco Teste" } });
    bancoId = banco.id;

    const usuario = await prisma.usuario.create({
      data: { nome: "Usuário Bancário", email: `bancario-${sufixo}@teste.local`, senhaHash: "x" },
    });
    usuarioId = usuario.id;

    sessao = {
      usuarioId,
      nome: usuario.nome,
      empresaId,
      perfil: "FINANCEIRO",
      filialId,
      podeAlterarFilial: true,
    };
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { empresaId } });
    await prisma.cliente.deleteMany({ where: { id: { in: clientesCriados } } });
    await prisma.usuario.delete({ where: { id: usuarioId } });
    await prisma.banco.delete({ where: { id: bancoId } });
    await prisma.filial.delete({ where: { id: filialId } });
    await prisma.empresa.delete({ where: { id: empresaId } });
    await prisma.$disconnect();
  });

  test("PIX sem chave falha na validação do schema", async () => {
    const { clienteSchema } = await import("@/lib/schemas/cliente");
    const resultado = clienteSchema.safeParse({
      ...dadosBase,
      meioPagamento: "PIX",
      tipoChavePix: "__nenhum__",
      chavePix: "",
    });
    expect(resultado.success).toBe(false);
  });

  test("cria com PIX completo e zera campos de depósito", async () => {
    const dados: ClienteFormValues = {
      ...dadosBase,
      cnpjCpf: "11.111.111/0001-11",
      meioPagamento: "PIX",
      tipoChavePix: "EMAIL",
      chavePix: "cliente@teste.local",
      bancoId: "__nenhum__",
      agencia: "",
      conta: "",
      tipoContaTerceiro: "__nenhum__",
      titularConta: "",
    };

    const cliente = await criarCliente(sessao, dados);
    clientesCriados.push(cliente.id);

    expect(cliente.meioPagamento).toBe("PIX");
    expect(cliente.tipoChavePix).toBe("EMAIL");
    expect(cliente.chavePix).toBe("cliente@teste.local");
    expect(cliente.bancoId).toBeNull();
    expect(cliente.agencia).toBeNull();
    expect(cliente.conta).toBeNull();
    expect(cliente.tipoContaTerceiro).toBeNull();
    expect(cliente.titularConta).toBeNull();
  });

  test("cria com depósito bancário completo e zera campos de PIX", async () => {
    const dados: ClienteFormValues = {
      ...dadosBase,
      cnpjCpf: "22.222.222/0001-22",
      meioPagamento: "DEPOSITO_BANCARIO",
      tipoChavePix: "__nenhum__",
      chavePix: "",
      bancoId,
      agencia: "0001",
      conta: "12345-6",
      tipoContaTerceiro: "CORRENTE",
      titularConta: "João da Silva",
    };

    const cliente = await criarCliente(sessao, dados);
    clientesCriados.push(cliente.id);

    expect(cliente.meioPagamento).toBe("DEPOSITO_BANCARIO");
    expect(cliente.bancoId).toBe(bancoId);
    expect(cliente.agencia).toBe("0001");
    expect(cliente.conta).toBe("12345-6");
    expect(cliente.tipoContaTerceiro).toBe("CORRENTE");
    expect(cliente.titularConta).toBe("João da Silva");
    expect(cliente.tipoChavePix).toBeNull();
    expect(cliente.chavePix).toBeNull();
  });

  test("sem meio de pagamento, nenhum campo bancário é exigido", async () => {
    const dados: ClienteFormValues = {
      ...dadosBase,
      cnpjCpf: "33.333.333/0001-33",
      meioPagamento: "__nenhum__",
      tipoChavePix: "__nenhum__",
      chavePix: "",
      bancoId: "__nenhum__",
      agencia: "",
      conta: "",
      tipoContaTerceiro: "__nenhum__",
      titularConta: "",
    };

    const cliente = await criarCliente(sessao, dados);
    clientesCriados.push(cliente.id);

    expect(cliente.meioPagamento).toBeNull();
    expect(cliente.tipoChavePix).toBeNull();
    expect(cliente.bancoId).toBeNull();
  });

  test("atualizar de PIX para depósito limpa os campos de PIX", async () => {
    const criado = await criarCliente(sessao, {
      ...dadosBase,
      cnpjCpf: "44.444.444/0001-44",
      meioPagamento: "PIX",
      tipoChavePix: "CELULAR",
      chavePix: "11999999999",
      bancoId: "__nenhum__",
      agencia: "",
      conta: "",
      tipoContaTerceiro: "__nenhum__",
      titularConta: "",
    });
    clientesCriados.push(criado.id);

    const atualizado = await atualizarCliente(sessao, criado.id, {
      ...dadosBase,
      cnpjCpf: "44.444.444/0001-44",
      meioPagamento: "DEPOSITO_BANCARIO",
      tipoChavePix: "__nenhum__",
      chavePix: "",
      bancoId,
      agencia: "0002",
      conta: "9999-9",
      tipoContaTerceiro: "POUPANCA",
      titularConta: "",
    });

    expect(atualizado.meioPagamento).toBe("DEPOSITO_BANCARIO");
    expect(atualizado.tipoChavePix).toBeNull();
    expect(atualizado.chavePix).toBeNull();
    expect(atualizado.bancoId).toBe(bancoId);
    expect(atualizado.tipoContaTerceiro).toBe("POUPANCA");

    const auditoria = await prisma.auditLog.findFirst({
      where: { entidade: "Cliente", entidadeId: criado.id, acao: "ATUALIZAR" },
      orderBy: { criadoEm: "desc" },
    });
    expect(auditoria).not.toBeNull();
    const novo = auditoria!.valorNovo as Record<string, unknown>;
    expect(novo.meioPagamento).toBe("DEPOSITO_BANCARIO");
    expect(novo.tipoChavePix).toBeNull();
  });
});
