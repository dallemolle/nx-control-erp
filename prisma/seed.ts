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
  // Sentinela das contas Caixa (dinheiro em espécie); a migration add_tipo_conta_caixa também o cria.
  { codigo: "CX", nome: "Caixa interno (dinheiro em espécie)" },
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
    where: { cnpjCpf: empresaCnpj },
    update: {},
    create: {
      razaoSocial: process.env.SEED_EMPRESA_RAZAO_SOCIAL ?? "Empresa Demonstração Ltda",
      nomeFantasia: process.env.SEED_EMPRESA_NOME_FANTASIA ?? "Empresa Demonstração",
      cnpjCpf: empresaCnpj,
      moedaPadrao: "BRL",
    },
  });

  // Migration 2 (backfill) só cria a Filial Matriz para empresas que já
  // existiam na hora da migração. Um banco criado do zero (CI, dev novo)
  // depende do seed pra ter a Filial.
  const filial = await prisma.filial.upsert({
    where: { cnpjCpf: empresaCnpj },
    update: {},
    create: {
      empresaId: empresa.id,
      nome: "Matriz",
      cnpjCpf: empresaCnpj,
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

  await seedCatalogoProducao(empresa.id, filial.id);

  console.log(`Seed concluído. Login: ${adminEmail} / senha: ${senhaAdminPadrao}`);
}

/**
 * Catálogo de exemplo da Fase 7 (doc 1 de docs/modulos/producao-estoque-vendas),
 * sem preços nem dados reais. O catálogo real entra pela importação da planilha.
 */
async function seedCatalogoProducao(empresaId: string, filialId: string) {
  const frutas = [
    { nome: "Açaí", exigeBranqueamento: true },
    { nome: "Acerola", exigeBranqueamento: false },
  ];
  const frutaId: Record<string, string> = {};
  for (const f of frutas) {
    const fruta = await prisma.fruta.upsert({
      where: { empresaId_nome: { empresaId, nome: f.nome } },
      update: {},
      create: { empresaId, ...f },
    });
    frutaId[f.nome] = fruta.id;
  }

  const congelada = { conservacao: "CONGELADO", validadeDias: 365, armazenamento: "-18 °C" } as const;
  const resfriada = { conservacao: "RESFRIADO", validadeDias: 2, armazenamento: "0 a 5 °C" } as const;
  const produtos = [
    {
      codigo: "FA",
      descricao: "Fruto de açaí",
      categoria: "FRUTO",
      fruta: "Açaí",
      conservacao: "IN_NATURA",
      validadeDias: 1,
      armazenamento: "Sombra / ventilado",
      unidadeComercial: "rasa",
      fatorUnidadeKg: 14,
    },
    {
      codigo: "FC",
      descricao: "Fruto de acerola",
      categoria: "FRUTO",
      fruta: "Acerola",
      conservacao: "IN_NATURA",
      validadeDias: 2,
      armazenamento: "Sombra / refrigerado",
    },
    { codigo: "AGC", descricao: "Polpa de açaí grosso/especial – congelada", categoria: "POLPA", fruta: "Açaí", ...congelada },
    { codigo: "AMC", descricao: "Polpa de açaí médio/regular – congelada", categoria: "POLPA", fruta: "Açaí", ...congelada },
    { codigo: "APC", descricao: "Polpa de açaí fino/popular – congelada", categoria: "POLPA", fruta: "Açaí", ...congelada },
    { codigo: "AGR", descricao: "Açaí grosso/especial – resfriado", categoria: "POLPA", fruta: "Açaí", ...resfriada },
    { codigo: "AMR", descricao: "Açaí médio/regular – resfriado", categoria: "POLPA", fruta: "Açaí", ...resfriada },
    { codigo: "APR", descricao: "Açaí fino/popular – resfriado", categoria: "POLPA", fruta: "Açaí", ...resfriada },
    { codigo: "ACC", descricao: "Polpa de acerola – congelada", categoria: "POLPA", fruta: "Acerola", ...congelada },
  ] as const;
  for (const { fruta, ...produto } of produtos) {
    await prisma.produto.upsert({
      where: { empresaId_codigo: { empresaId, codigo: produto.codigo } },
      update: {},
      create: { empresaId, frutaId: frutaId[fruta], ...produto },
    });
  }

  for (const t of [
    { nome: "Talhão Açaí 01", fruta: "Açaí", areaHa: 2 },
    { nome: "Talhão Acerola 01", fruta: "Acerola", areaHa: 1 },
  ]) {
    await prisma.talhao.upsert({
      where: { filialId_nome: { filialId, nome: t.nome } },
      update: {},
      create: { filialId, nome: t.nome, frutaId: frutaId[t.fruta], areaHa: t.areaHa },
    });
  }

  for (const local of [
    { nome: "Recepção", tipo: "RECEPCAO" },
    { nome: "Câmara fria 01", tipo: "CAMARA_FRIA", temperatura: "-18 °C" },
  ] as const) {
    await prisma.localArmazenamento.upsert({
      where: { filialId_nome: { filialId, nome: local.nome } },
      update: {},
      create: { filialId, ...local },
    });
  }
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
