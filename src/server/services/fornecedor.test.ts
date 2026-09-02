import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { criarFornecedor, atualizarFornecedor } from "./fornecedor";
import { FilialSomenteLeituraError } from "@/server/auth/permissions";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { FornecedorFormValues } from "@/lib/schemas/fornecedor";

describe("fornecedor - permissão de alteração por filial", () => {
  let empresaId: string;
  let filialId: string;

  beforeAll(async () => {
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    const empresa = await prisma.empresa.create({
      data: {
        razaoSocial: "Teste Fornecedor Filial Ltda",
        nomeFantasia: "Teste Fornecedor Filial",
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
      nome: "Fornecedor Teste",
      cnpjCpf: "12.345.678/0001-90",
      contato: "Contato",
      email: "fornecedor@teste.local",
      telefone: "1234567890",
    };

    await expect(criarFornecedor(sessao, dados)).rejects.toThrow(FilialSomenteLeituraError);
  });
});

describe("fornecedor - dados bancários", () => {
  let empresaId: string;
  let filialId: string;
  let bancoId: string;
  let usuarioId: string;
  let sessao: SessaoAtiva;
  const fornecedoresCriados: string[] = [];

  const dadosBase = {
    nome: "Fornecedor Bancário",
    cnpjCpf: "12.345.678/0001-90",
    contato: "",
    email: "",
    telefone: "",
  };

  beforeAll(async () => {
    const sufixo = Math.random().toString(36).substring(2, 10);
    const empresa = await prisma.empresa.create({
      data: {
        razaoSocial: "Teste Fornecedor Bancário Ltda",
        nomeFantasia: "Teste Fornecedor Bancário",
        cnpj: `${sufixo}/0001-97`,
      },
    });
    empresaId = empresa.id;

    const filial = await prisma.filial.create({
      data: { empresaId, nome: "Filial Bancária", cnpj: `${sufixo}/0002-97`, ativo: true },
    });
    filialId = filial.id;

    const banco = await prisma.banco.create({ data: { codigo: `f${sufixo}`, nome: "Banco Teste" } });
    bancoId = banco.id;

    const usuario = await prisma.usuario.create({
      data: { nome: "Usuário Bancário", email: `fbancario-${sufixo}@teste.local`, senhaHash: "x" },
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
    await prisma.fornecedor.deleteMany({ where: { id: { in: fornecedoresCriados } } });
    await prisma.usuario.delete({ where: { id: usuarioId } });
    await prisma.banco.delete({ where: { id: bancoId } });
    await prisma.filial.delete({ where: { id: filialId } });
    await prisma.empresa.delete({ where: { id: empresaId } });
    await prisma.$disconnect();
  });

  test("PIX sem chave falha na validação do schema", async () => {
    const { fornecedorSchema } = await import("@/lib/schemas/fornecedor");
    const resultado = fornecedorSchema.safeParse({
      ...dadosBase,
      meioPagamento: "PIX",
      tipoChavePix: "__nenhum__",
      chavePix: "",
    });
    expect(resultado.success).toBe(false);
  });

  test("cria com PIX completo e zera campos de depósito", async () => {
    const dados: FornecedorFormValues = {
      ...dadosBase,
      cnpjCpf: "11.111.111/0001-11",
      meioPagamento: "PIX",
      tipoChavePix: "CPF_CNPJ",
      chavePix: "12345678900",
      bancoId: "__nenhum__",
      agencia: "",
      conta: "",
      tipoContaTerceiro: "__nenhum__",
      titularConta: "",
    };

    const fornecedor = await criarFornecedor(sessao, dados);
    fornecedoresCriados.push(fornecedor.id);

    expect(fornecedor.meioPagamento).toBe("PIX");
    expect(fornecedor.tipoChavePix).toBe("CPF_CNPJ");
    expect(fornecedor.chavePix).toBe("12345678900");
    expect(fornecedor.bancoId).toBeNull();
    expect(fornecedor.agencia).toBeNull();
    expect(fornecedor.conta).toBeNull();
    expect(fornecedor.tipoContaTerceiro).toBeNull();
    expect(fornecedor.titularConta).toBeNull();
  });

  test("cria com depósito bancário completo e zera campos de PIX", async () => {
    const dados: FornecedorFormValues = {
      ...dadosBase,
      cnpjCpf: "22.222.222/0001-22",
      meioPagamento: "DEPOSITO_BANCARIO",
      tipoChavePix: "__nenhum__",
      chavePix: "",
      bancoId,
      agencia: "0001",
      conta: "12345-6",
      tipoContaTerceiro: "CORRENTE",
      titularConta: "Empresa Fornecedora Ltda",
    };

    const fornecedor = await criarFornecedor(sessao, dados);
    fornecedoresCriados.push(fornecedor.id);

    expect(fornecedor.meioPagamento).toBe("DEPOSITO_BANCARIO");
    expect(fornecedor.bancoId).toBe(bancoId);
    expect(fornecedor.agencia).toBe("0001");
    expect(fornecedor.conta).toBe("12345-6");
    expect(fornecedor.tipoContaTerceiro).toBe("CORRENTE");
    expect(fornecedor.titularConta).toBe("Empresa Fornecedora Ltda");
    expect(fornecedor.tipoChavePix).toBeNull();
    expect(fornecedor.chavePix).toBeNull();
  });

  test("sem meio de pagamento, nenhum campo bancário é exigido", async () => {
    const dados: FornecedorFormValues = {
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

    const fornecedor = await criarFornecedor(sessao, dados);
    fornecedoresCriados.push(fornecedor.id);

    expect(fornecedor.meioPagamento).toBeNull();
    expect(fornecedor.tipoChavePix).toBeNull();
    expect(fornecedor.bancoId).toBeNull();
  });

  test("atualizar de PIX para depósito limpa os campos de PIX", async () => {
    const criado = await criarFornecedor(sessao, {
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
    fornecedoresCriados.push(criado.id);

    const atualizado = await atualizarFornecedor(sessao, criado.id, {
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
      where: { entidade: "Fornecedor", entidadeId: criado.id, acao: "ATUALIZAR" },
      orderBy: { criadoEm: "desc" },
    });
    expect(auditoria).not.toBeNull();
    const novo = auditoria!.valorNovo as Record<string, unknown>;
    expect(novo.meioPagamento).toBe("DEPOSITO_BANCARIO");
    expect(novo.tipoChavePix).toBeNull();
  });
});
