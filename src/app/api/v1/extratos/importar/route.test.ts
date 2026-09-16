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

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("APIEXT", "TESOURARIA");
    chaveCompleta = (await gerarChave(fixture.sessaoAdmin, fixture.usuarioId, "Chave tesouraria")).chaveCompleta;
  });

  afterAll(async () => {
    await prisma.apiKey.deleteMany({ where: { usuarioId: fixture.usuarioId } });
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  function headers() {
    return {
      authorization: `Bearer ${chaveCompleta}`,
      "x-empresa-id": fixture.empresaId,
      "x-filial-id": fixture.filialId,
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

  test("conta bancária não encontrada -> 422", async () => {
    const formData = new FormData();
    formData.set("contaBancariaAgencia", "0000");
    formData.set("contaBancariaConta", "0000-0");
    formData.set("arquivo", new File([OFX_EXEMPLO], "extrato.ofx", { type: "application/x-ofx" }));

    const request = new Request("http://localhost/api/v1/extratos/importar", { method: "POST", headers: headers(), body: formData });

    expect((await POST(request)).status).toBe(422);
  });
});
