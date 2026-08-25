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

  const empresa = await prisma.empresa.upsert({
    where: { cnpj: "00.000.000/0001-00" },
    update: {},
    create: {
      razaoSocial: "Empresa Demonstração Ltda",
      nomeFantasia: "Empresa Demonstração",
      cnpj: "00.000.000/0001-00",
      moedaPadrao: "BRL",
    },
  });

  const senhaAdminPadrao = process.env.SEED_ADMIN_SENHA ?? "TrocarSenha123!";
  const admin = await prisma.usuario.upsert({
    where: { email: "admin@nx-control-erp.local" },
    update: {},
    create: {
      nome: "Administrador",
      email: "admin@nx-control-erp.local",
      senhaHash: await bcrypt.hash(senhaAdminPadrao, 12),
    },
  });

  await prisma.usuarioEmpresa.upsert({
    where: { usuarioId_empresaId: { usuarioId: admin.id, empresaId: empresa.id } },
    update: {},
    create: { usuarioId: admin.id, empresaId: empresa.id, perfil: "ADMINISTRADOR" },
  });

  console.log(`Seed concluído. Login: admin@nx-control-erp.local / senha: ${senhaAdminPadrao}`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
