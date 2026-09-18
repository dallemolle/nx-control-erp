import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import {
  criarFixtureFinanceiro,
  limparFixtureFinanceiro,
  type FixtureFinanceiro,
} from "@/server/services/financeiroTestFixtures";
import { gerarChave } from "@/server/services/apiKey";
import { POST } from "./route";

const OFX_EXEMPLO = `
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260901120000
<TRNAMT>500.00
<FITID>APIEXTRATO1
<NAME>DEPOSITO TESTE
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>
`;

describe("POST /api/v1/extratos/importar", () => {
  let fixture: FixtureFinanceiro;
  let chaveCompleta: string;
  let chaveConsulta: string;
  let usuarioConsultaId: string;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("APIEXT", "TESOURARIA");
    chaveCompleta = (await gerarChave(fixture.sessaoAdmin, fixture.usuarioId, "Chave tesouraria")).chaveCompleta;

    const usuarioConsulta = await prisma.usuario.create({
      data: { nome: "Consulta APIEXT", email: "consulta-apiext@teste.local", senhaHash: "x" },
    });
    usuarioConsultaId = usuarioConsulta.id;
    const vinculoConsulta = await prisma.usuarioEmpresa.create({
      data: { usuarioId: usuarioConsulta.id, empresaId: fixture.empresaId, perfil: "CONSULTA", ativo: true },
    });
    await prisma.usuarioEmpresaFilial.create({
      data: { usuarioEmpresaId: vinculoConsulta.id, filialId: fixture.filialId, podeAlterar: false, ativo: true },
    });
    chaveConsulta = (await gerarChave(fixture.sessaoAdmin, usuarioConsulta.id, "Chave consulta")).chaveCompleta;
  });

  afterAll(async () => {
    await prisma.apiKey.deleteMany({ where: { usuarioId: { in: [fixture.usuarioId, usuarioConsultaId] } } });
    await prisma.usuarioEmpresaFilial.deleteMany({ where: { usuarioEmpresa: { usuarioId: usuarioConsultaId } } });
    await prisma.usuarioEmpresa.deleteMany({ where: { usuarioId: usuarioConsultaId } });
    await prisma.usuario.delete({ where: { id: usuarioConsultaId } });
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  function headers(chave: string = chaveCompleta) {
    return {
      authorization: `Bearer ${chave}`,
      "x-filial-cnpjcpf": fixture.filialCnpjCpf,
    };
  }

  test("importa o extrato resolvendo a conta bancária por agência+conta", async () => {
    const conta = await prisma.contaBancaria.findUniqueOrThrow({ where: { id: fixture.contaBancariaId } });

    const formData = new FormData();
    formData.set("contaBancariaAgencia", conta.agencia);
    formData.set("contaBancariaConta", conta.conta);
    formData.set("arquivo", new File([OFX_EXEMPLO], "extrato.ofx", { type: "application/x-ofx" }));

    const request = new Request("http://localhost/api/v1/extratos/importar", { method: "POST", headers: headers(), body: formData });

    const resposta = await POST(request);
    expect(resposta.status).toBe(201);
    const corpo = await resposta.json();
    expect(corpo.totalLinhas).toBe(1);
    expect(corpo.linhasNovas).toBe(1);
  });

  test("conta bancária não encontrada -> 422 com campos de requisição", async () => {
    const formData = new FormData();
    formData.set("contaBancariaAgencia", "0000");
    formData.set("contaBancariaConta", "0000-0");
    formData.set("arquivo", new File([OFX_EXEMPLO], "extrato.ofx", { type: "application/x-ofx" }));

    const request = new Request("http://localhost/api/v1/extratos/importar", { method: "POST", headers: headers(), body: formData });

    const resposta = await POST(request);
    expect(resposta.status).toBe(422);
    const corpo = await resposta.json();
    expect(corpo.campos).toContain("contaBancariaAgencia");
    expect(corpo.campos).toContain("contaBancariaConta");
  });

  test("agência e conta ambas em branco -> 422 'Informe a conta bancária'", async () => {
    const formData = new FormData();
    formData.set("arquivo", new File([OFX_EXEMPLO], "extrato.ofx", { type: "application/x-ofx" }));

    const request = new Request("http://localhost/api/v1/extratos/importar", { method: "POST", headers: headers(), body: formData });

    const resposta = await POST(request);
    expect(resposta.status).toBe(422);
    const corpo = await resposta.json();
    expect(corpo.erro).toContain("Informe a conta bancária");
  });

  test("arquivo acima do limite de 2MB -> 422 com a mensagem original, não 500", async () => {
    const conta = await prisma.contaBancaria.findUniqueOrThrow({ where: { id: fixture.contaBancariaId } });

    const formData = new FormData();
    formData.set("contaBancariaAgencia", conta.agencia);
    formData.set("contaBancariaConta", conta.conta);
    const conteudoGrande = "A".repeat(2 * 1024 * 1024 + 1);
    formData.set("arquivo", new File([conteudoGrande], "grande.ofx", { type: "application/x-ofx" }));

    const request = new Request("http://localhost/api/v1/extratos/importar", { method: "POST", headers: headers(), body: formData });

    const resposta = await POST(request);
    expect(resposta.status).toBe(422);
    const corpo = await resposta.json();
    expect(corpo.erro).toContain("limite");
  });

  test("OFX malformado (falta TRNAMT/DTPOSTED/FITID) -> 422 com a mensagem original, não 500", async () => {
    const conta = await prisma.contaBancaria.findUniqueOrThrow({ where: { id: fixture.contaBancariaId } });
    const ofxMalformado = `
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN>
<TRNTYPE>CREDIT
<NAME>SEM CAMPOS OBRIGATORIOS
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>
`;

    const formData = new FormData();
    formData.set("contaBancariaAgencia", conta.agencia);
    formData.set("contaBancariaConta", conta.conta);
    formData.set("arquivo", new File([ofxMalformado], "malformado.ofx", { type: "application/x-ofx" }));

    const request = new Request("http://localhost/api/v1/extratos/importar", { method: "POST", headers: headers(), body: formData });

    const resposta = await POST(request);
    expect(resposta.status).toBe(422);
    const corpo = await resposta.json();
    expect(corpo.erro).toContain("inválida");
  });

  test("perfil CONSULTA não consegue importar extrato -> 403, não 422", async () => {
    const conta = await prisma.contaBancaria.findUniqueOrThrow({ where: { id: fixture.contaBancariaId } });

    const formData = new FormData();
    formData.set("contaBancariaAgencia", conta.agencia);
    formData.set("contaBancariaConta", conta.conta);
    formData.set("arquivo", new File([OFX_EXEMPLO], "extrato.ofx", { type: "application/x-ofx" }));

    const request = new Request("http://localhost/api/v1/extratos/importar", {
      method: "POST",
      headers: headers(chaveConsulta),
      body: formData,
    });

    const resposta = await POST(request);
    expect(resposta.status).toBe(403);
  });
});
