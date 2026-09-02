import { prisma } from "@/server/db/client";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { Perfil } from "@prisma/client";

export type FixtureFinanceiro = {
  empresaId: string;
  filialId: string;
  usuarioId: string;
  usuarioAdminId: string;
  fornecedorId: string;
  clienteId: string;
  categoriaFinanceiraId: string;
  bancoId: string;
  contaBancariaId: string;
  sessao: SessaoAtiva;
  /** Sessão ADMINISTRADOR na mesma filial — usar para "arrange" (criar dados de setup) em testes cujo perfil principal não tem titulo:escrever, como TESOURARIA. */
  sessaoAdmin: SessaoAtiva;
  sessaoSomenteLeitura: SessaoAtiva;
};

export async function criarFixtureFinanceiro(
  sufixo: string,
  perfil: Perfil = "FINANCEIRO",
): Promise<FixtureFinanceiro> {
  const empresa = await prisma.empresa.create({
    data: {
      razaoSocial: `Teste Financeiro ${sufixo} Ltda`,
      nomeFantasia: `Teste Financeiro ${sufixo}`,
      cnpj: `11.111.${sufixo}/0001-11`,
    },
  });

  const filial = await prisma.filial.create({
    data: { empresaId: empresa.id, nome: `Filial ${sufixo}`, cnpj: `11.111.${sufixo}/0001-22` },
  });

  const usuario = await prisma.usuario.create({
    data: { nome: `Usuario ${sufixo}`, email: `financeiro-${sufixo}@teste.local`, senhaHash: "x" },
  });

  const usuarioAdmin = await prisma.usuario.create({
    data: { nome: `Admin ${sufixo}`, email: `admin-${sufixo}@teste.local`, senhaHash: "x" },
  });

  const usuarioEmpresa = await prisma.usuarioEmpresa.create({
    data: { usuarioId: usuario.id, empresaId: empresa.id, perfil, ativo: true },
  });

  const usuarioEmpresaAdmin = await prisma.usuarioEmpresa.create({
    data: { usuarioId: usuarioAdmin.id, empresaId: empresa.id, perfil: "ADMINISTRADOR", ativo: true },
  });

  await prisma.usuarioEmpresaFilial.create({
    data: { usuarioEmpresaId: usuarioEmpresa.id, filialId: filial.id, podeAlterar: true, ativo: true },
  });

  await prisma.usuarioEmpresaFilial.create({
    data: { usuarioEmpresaId: usuarioEmpresaAdmin.id, filialId: filial.id, podeAlterar: true, ativo: true },
  });

  const fornecedor = await prisma.fornecedor.create({
    data: { empresaId: empresa.id, nome: `Fornecedor ${sufixo}`, cnpjCpf: `22.222.${sufixo}/0001-33` },
  });

  const cliente = await prisma.cliente.create({
    data: { empresaId: empresa.id, nome: `Cliente ${sufixo}`, cnpjCpf: `33.333.${sufixo}/0001-44` },
  });

  const categoria = await prisma.categoriaFinanceira.create({
    data: { filialId: filial.id, nome: `Categoria ${sufixo}`, tipo: "DESPESA" },
  });

  const banco = await prisma.banco.create({ data: { codigo: `9${sufixo}`, nome: `Banco ${sufixo}` } });

  const contaBancaria = await prisma.contaBancaria.create({
    data: { filialId: filial.id, bancoId: banco.id, agencia: "0001", conta: `${sufixo}-1`, saldoInicial: 0 },
  });

  const sessao: SessaoAtiva = {
    usuarioId: usuario.id,
    nome: usuario.nome,
    empresaId: empresa.id,
    perfil,
    filialId: filial.id,
    podeAlterarFilial: true,
  };

  const sessaoAdmin: SessaoAtiva = {
    usuarioId: usuarioAdmin.id,
    nome: usuarioAdmin.nome,
    empresaId: empresa.id,
    perfil: "ADMINISTRADOR",
    filialId: filial.id,
    podeAlterarFilial: true,
  };

  return {
    empresaId: empresa.id,
    filialId: filial.id,
    usuarioId: usuario.id,
    usuarioAdminId: usuarioAdmin.id,
    fornecedorId: fornecedor.id,
    clienteId: cliente.id,
    categoriaFinanceiraId: categoria.id,
    bancoId: banco.id,
    contaBancariaId: contaBancaria.id,
    sessao,
    sessaoAdmin,
    sessaoSomenteLeitura: { ...sessao, podeAlterarFilial: false },
  };
}

export async function limparFixtureFinanceiro(fixture: FixtureFinanceiro): Promise<void> {
  await prisma.lancamentoBancario.deleteMany({ where: { filialId: fixture.filialId } });
  await prisma.saldoBancarioInformado.deleteMany({ where: { contaBancaria: { filialId: fixture.filialId } } });
  await prisma.anexo.deleteMany({ where: { titulo: { filialId: fixture.filialId } } });
  await prisma.baixa.deleteMany({ where: { parcela: { titulo: { filialId: fixture.filialId } } } });
  await prisma.parcela.deleteMany({ where: { titulo: { filialId: fixture.filialId } } });
  await prisma.titulo.deleteMany({ where: { filialId: fixture.filialId } });
  await prisma.auditLog.deleteMany({ where: { filialId: fixture.filialId } });
  await prisma.contaBancaria.deleteMany({ where: { filialId: fixture.filialId } });
  await prisma.banco.delete({ where: { id: fixture.bancoId } });
  await prisma.categoriaFinanceira.deleteMany({ where: { filialId: fixture.filialId } });
  await prisma.fornecedor.deleteMany({ where: { empresaId: fixture.empresaId } });
  await prisma.cliente.deleteMany({ where: { empresaId: fixture.empresaId } });
  await prisma.usuarioEmpresaFilial.deleteMany({ where: { filialId: fixture.filialId } });
  await prisma.usuarioEmpresa.deleteMany({ where: { empresaId: fixture.empresaId } });
  await prisma.usuario.delete({ where: { id: fixture.usuarioId } });
  await prisma.usuario.delete({ where: { id: fixture.usuarioAdminId } });
  await prisma.filial.deleteMany({ where: { empresaId: fixture.empresaId } });
  await prisma.empresa.delete({ where: { id: fixture.empresaId } });
}
