import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import { atualizarTitulo, criarTitulo, listarTitulos } from "./titulo";
import { aprovarBaixa, registrarBaixa } from "./baixa";
import { ErroClassificacaoFiscal } from "./classificacaoFiscal";
import type { TituloFormValues } from "@/lib/schemas/titulo";

// 43 dígitos + DV 2 (ver classificacaoFiscal.test.ts).
const CHAVE_VALIDA = "35240312345678000195550010000012341123456782";

describe("titulo — classificação fiscal × gerencial", () => {
  let fixture: FixtureFinanceiro;
  let outraFilial: FixtureFinanceiro;
  let fornecedorGerencialId: string;

  function dadosTitulo(sobrescrever: Partial<TituloFormValues> = {}): TituloFormValues {
    return {
      contraparteId: fixture.fornecedorId,
      documento: `DOC-${Math.random().toString(36).slice(2, 8)}`,
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: "",
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date(), valorOriginal: 500 }],
      ...sobrescrever,
    };
  }

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("TCF");
    outraFilial = await criarFixtureFinanceiro("TCF2");
    const fornecedor = await prisma.fornecedor.create({
      data: {
        empresaId: fixture.empresaId,
        nome: "Produtor sem nota",
        cnpjCpf: "123.456.789-09",
        classificacaoFiscalPadrao: "GERENCIAL",
      },
    });
    fornecedorGerencialId = fornecedor.id;
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await limparFixtureFinanceiro(outraFilial);
    await prisma.$disconnect();
  });

  describe("resolução na criação", () => {
    test("sem classificação informada e sem padrão da contraparte, nasce FISCAL", async () => {
      const titulo = await criarTitulo(fixture.sessao, "PAGAR", dadosTitulo());
      expect(titulo.classificacaoFiscal).toBe("FISCAL");
    });

    test("sem classificação informada, usa o padrão GERENCIAL do fornecedor", async () => {
      const titulo = await criarTitulo(
        fixture.sessao,
        "PAGAR",
        dadosTitulo({ contraparteId: fornecedorGerencialId, tipoComprovante: "RECIBO", motivoSemDocumento: "não emite nota" }),
      );
      expect(titulo.classificacaoFiscal).toBe("GERENCIAL");
      expect(titulo.tipoComprovante).toBe("RECIBO");
      expect(titulo.motivoSemDocumento).toBe("não emite nota");
    });

    test("classificação informada vence o padrão do fornecedor", async () => {
      const titulo = await criarTitulo(
        fixture.sessao,
        "PAGAR",
        dadosTitulo({ contraparteId: fornecedorGerencialId, classificacaoFiscal: "FISCAL", tipoComprovante: "NF_ENTRADA" }),
      );
      expect(titulo.classificacaoFiscal).toBe("FISCAL");
      expect(titulo.tipoComprovante).toBe("NF_ENTRADA");
    });

    test("comprovante incoerente com a classificação resolvida é recusado", async () => {
      // Fornecedor sem padrão → FISCAL; recibo é gerencial.
      await expect(criarTitulo(fixture.sessao, "PAGAR", dadosTitulo({ tipoComprovante: "RECIBO" }))).rejects.toThrow(
        ErroClassificacaoFiscal,
      );
    });

    test("motivo de 'sem nota' é descartado em título FISCAL", async () => {
      const titulo = await criarTitulo(fixture.sessao, "PAGAR", dadosTitulo({ motivoSemDocumento: "qualquer" }));
      expect(titulo.motivoSemDocumento).toBeNull();
    });
  });

  describe("duplicidade de nota", () => {
    test("mesma chave de acesso na filial é recusada, citando o título existente", async () => {
      await criarTitulo(
        fixture.sessao,
        "PAGAR",
        dadosTitulo({ documento: "NF-CHAVE-1", tipoComprovante: "NFE", chaveAcesso: CHAVE_VALIDA }),
      );

      await expect(
        criarTitulo(fixture.sessao, "PAGAR", dadosTitulo({ tipoComprovante: "NFE", chaveAcesso: CHAVE_VALIDA })),
      ).rejects.toThrow(/NF-CHAVE-1/);
    });

    test("a mesma chave em outra filial não conflita", async () => {
      const titulo = await criarTitulo(outraFilial.sessao, "PAGAR", {
        ...dadosTitulo({ tipoComprovante: "NFE", chaveAcesso: CHAVE_VALIDA }),
        contraparteId: outraFilial.fornecedorId,
        categoriaFinanceiraId: outraFilial.categoriaFinanceiraId,
      });
      expect(titulo.chaveAcesso).toBe(CHAVE_VALIDA);
    });

    test("mesmo fornecedor + tipo + série + número é recusado; série diferente passa", async () => {
      await criarTitulo(
        fixture.sessao,
        "PAGAR",
        dadosTitulo({ tipoComprovante: "NFSE", numeroDocumentoFiscal: "777", serieDocumentoFiscal: "A" }),
      );

      await expect(
        criarTitulo(
          fixture.sessao,
          "PAGAR",
          dadosTitulo({ tipoComprovante: "NFSE", numeroDocumentoFiscal: "777", serieDocumentoFiscal: "A" }),
        ),
      ).rejects.toThrow(ErroClassificacaoFiscal);

      const outraSerie = await criarTitulo(
        fixture.sessao,
        "PAGAR",
        dadosTitulo({ tipoComprovante: "NFSE", numeroDocumentoFiscal: "777", serieDocumentoFiscal: "B" }),
      );
      expect(outraSerie.serieDocumentoFiscal).toBe("B");
    });
  });

  describe("edição e reclassificação", () => {
    test("reclassificar sem motivo é recusado", async () => {
      const titulo = await criarTitulo(fixture.sessao, "PAGAR", dadosTitulo());
      await expect(
        atualizarTitulo(fixture.sessao, titulo.id, { ...dadosTitulo({ documento: titulo.documento }), classificacaoFiscal: "GERENCIAL" }),
      ).rejects.toThrow(/motivo da reclassificação/);
    });

    test("reclassificar propaga aos lançamentos de baixas aprovadas e audita RECLASSIFICAR", async () => {
      const titulo = await criarTitulo(
        fixture.sessao,
        "PAGAR",
        dadosTitulo({ contraparteId: fornecedorGerencialId, tipoComprovante: "RECIBO" }),
      );
      const baixa = await registrarBaixa(fixture.sessao, titulo.parcelas[0].id, {
        data: new Date(),
        valorPago: 500,
        valorJuros: 0,
        valorMulta: 0,
        valorDesconto: 0,
        contaBancariaId: fixture.contaBancariaId,
      });
      await aprovarBaixa(fixture.sessaoAdmin, baixa.id);

      const lancamentoAntes = await prisma.lancamentoBancario.findFirstOrThrow({ where: { baixaId: baixa.id } });
      expect(lancamentoAntes.classificacaoFiscal).toBe("GERENCIAL");
      expect(lancamentoAntes.tipoComprovante).toBe("RECIBO");

      await atualizarTitulo(fixture.sessao, titulo.id, {
        ...dadosTitulo({ contraparteId: fornecedorGerencialId, documento: titulo.documento }),
        classificacaoFiscal: "FISCAL",
        tipoComprovante: "NFE",
        numeroDocumentoFiscal: "4321",
        chaveAcesso: "0".repeat(44),
        motivoReclassificacao: "Produtor emitiu nota avulsa",
      });

      const lancamentoDepois = await prisma.lancamentoBancario.findFirstOrThrow({ where: { baixaId: baixa.id } });
      expect(lancamentoDepois.classificacaoFiscal).toBe("FISCAL");
      expect(lancamentoDepois.tipoComprovante).toBe("NFE");
      expect(lancamentoDepois.numeroComprovante).toBe("4321");

      const auditoria = await prisma.auditLog.findFirstOrThrow({
        where: { entidade: "Titulo", entidadeId: titulo.id, acao: "RECLASSIFICAR" },
      });
      const anterior = auditoria.valorAnterior as Record<string, unknown>;
      const novo = auditoria.valorNovo as Record<string, unknown>;
      expect(anterior.classificacaoFiscal).toBe("GERENCIAL");
      expect(novo.classificacaoFiscal).toBe("FISCAL");
      expect(novo.motivoReclassificacao).toBe("Produtor emitiu nota avulsa");
    });

    test("edição sem os campos fiscais (cliente antigo) mantém os dados da nota gravados", async () => {
      const titulo = await criarTitulo(
        fixture.sessao,
        "PAGAR",
        dadosTitulo({ tipoComprovante: "NFSE", numeroDocumentoFiscal: "900", serieDocumentoFiscal: "1" }),
      );

      const atualizado = await atualizarTitulo(fixture.sessao, titulo.id, {
        contraparteId: fixture.fornecedorId,
        documento: "DOC-EDITADO",
        dataEmissao: new Date(),
        dataCompetencia: new Date(),
        categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      });

      expect(atualizado.documento).toBe("DOC-EDITADO");
      expect(atualizado.classificacaoFiscal).toBe("FISCAL");
      expect(atualizado.tipoComprovante).toBe("NFSE");
      expect(atualizado.numeroDocumentoFiscal).toBe("900");
      expect(atualizado.serieDocumentoFiscal).toBe("1");

      const auditoria = await prisma.auditLog.findFirstOrThrow({
        where: { entidade: "Titulo", entidadeId: titulo.id, acao: "ATUALIZAR" },
      });
      expect(auditoria.acao).toBe("ATUALIZAR");
    });

    test("campo fiscal enviado vazio limpa o valor", async () => {
      const titulo = await criarTitulo(
        fixture.sessao,
        "PAGAR",
        dadosTitulo({ tipoComprovante: "NFSE", numeroDocumentoFiscal: "901" }),
      );
      const atualizado = await atualizarTitulo(fixture.sessao, titulo.id, {
        ...dadosTitulo({ documento: titulo.documento }),
        numeroDocumentoFiscal: "",
      });
      expect(atualizado.numeroDocumentoFiscal).toBeNull();
      expect(atualizado.tipoComprovante).toBe("NFSE");
    });
  });

  describe("listagem", () => {
    test("filtra por classificação e traz a contagem de anexos; sem filtro traz todos", async () => {
      const todos = await listarTitulos(fixture.filialId, "PAGAR");
      const fiscais = await listarTitulos(fixture.filialId, "PAGAR", { classificacao: "FISCAL" });
      const gerenciais = await listarTitulos(fixture.filialId, "PAGAR", { classificacao: "GERENCIAL" });

      expect(gerenciais.length).toBeGreaterThan(0);
      expect(fiscais.every((titulo) => titulo.classificacaoFiscal === "FISCAL")).toBe(true);
      expect(gerenciais.every((titulo) => titulo.classificacaoFiscal === "GERENCIAL")).toBe(true);
      expect(fiscais.length + gerenciais.length).toBe(todos.length);
      expect(todos[0]._count.anexos).toBe(0);
    });
  });
});
