import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const BANCOS = [
  { codigo: "001", nome: "Banco do Brasil" },
  { codigo: "033", nome: "Santander" },
  { codigo: "104", nome: "Caixa Econômica Federal" },
  { codigo: "237", nome: "Bradesco" },
  { codigo: "341", nome: "Itaú Unibanco" },
  { codigo: "260", nome: "Nubank" },
  { codigo: "077", nome: "Inter" },
];

async function main() {
  for (const banco of BANCOS) {
    await prisma.banco.upsert({
      where: { codigo: banco.codigo },
      update: { nome: banco.nome },
      create: banco,
    });
  }

  const empresaCnpj = process.env.SEED_EMPRESA_CNPJ ?? "00.000.000/0001-00";
  const empresa = await prisma.empresa.upsert({
    where: { cnpj: empresaCnpj },
    update: {},
    create: {
      razaoSocial: process.env.SEED_EMPRESA_RAZAO_SOCIAL ?? "Empresa Demonstração Ltda",
      nomeFantasia: process.env.SEED_EMPRESA_NOME_FANTASIA ?? "Empresa Demonstração",
      cnpj: empresaCnpj,
      moedaPadrao: "BRL",
    },
  });

  // Migration 2 (backfill) só cria a Filial Matriz para empresas que já
  // existiam na hora da migração. Um banco criado do zero (CI, dev novo)
  // depende do seed pra ter a Filial.
  const filial = await prisma.filial.upsert({
    where: { cnpj: empresaCnpj },
    update: {},
    create: {
      empresaId: empresa.id,
      nome: "Matriz",
      cnpj: empresaCnpj,
    },
  });

  const adminNome = process.env.SEED_ADMIN_NOME ?? "Administrador";
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@nx-control-erp.local";
  const senhaAdminPadrao = process.env.SEED_ADMIN_SENHA ?? "TrocarSenha123!";
  const admin = await prisma.usuario.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      nome: adminNome,
      email: adminEmail,
      senhaHash: await bcrypt.hash(senhaAdminPadrao, 12),
    },
  });

  const usuarioEmpresa = await prisma.usuarioEmpresa.upsert({
    where: { usuarioId_empresaId: { usuarioId: admin.id, empresaId: empresa.id } },
    update: {},
    create: { usuarioId: admin.id, empresaId: empresa.id, perfil: "ADMINISTRADOR" },
  });

  await prisma.usuarioEmpresaFilial.upsert({
    where: {
      usuarioEmpresaId_filialId: { usuarioEmpresaId: usuarioEmpresa.id, filialId: filial.id },
    },
    update: {},
    create: { usuarioEmpresaId: usuarioEmpresa.id, filialId: filial.id, podeAlterar: true },
  });

  console.log(`Seed concluído. Login: ${adminEmail} / senha: ${senhaAdminPadrao}`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
