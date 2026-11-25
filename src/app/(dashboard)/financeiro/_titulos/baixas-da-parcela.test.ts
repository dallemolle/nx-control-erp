import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { BaixasDaParcela, textoDosAjustes } from "./baixas-da-parcela";
import type { BaixaDaParcela } from "./titulos-para-cliente";

const aprovada: BaixaDaParcela = {
  id: "b1",
  data: new Date("2026-10-15T00:00:00.000Z"),
  registradaEm: new Date("2026-10-15T13:00:00.000Z"),
  status: "APROVADO",
  valorPago: 1012,
  valorJuros: 12,
  valorMulta: 0,
  valorDesconto: 0,
  conta: "Sicredi - Ag 0101/CC 98765-4",
  registradaPor: "Maria",
  aprovadaPor: "João",
  estornadaPor: null,
  estornadaEm: null,
  motivoEstorno: null,
  conciliada: false,
  deRepasse: false,
};

const html = (baixas: BaixaDaParcela[], podeEstornar = true) =>
  renderToStaticMarkup(createElement(BaixasDaParcela, { baixas, podeEstornar, onEstornar: () => {} }));

describe("BaixasDaParcela", () => {
  test("mostra data, conta, valor, ajustes e quem registrou e aprovou", () => {
    const saida = html([aprovada]);
    expect(saida).toContain("Baixa de 15/10/2026");
    expect(saida).toContain("Sicredi - Ag 0101/CC 98765-4");
    expect(saida).toContain("+ juros R$");
    expect(saida).toContain("registrada por Maria · aprovada por João");
    expect(saida).toContain(">Estornar<");
    expect(saida).toContain('aria-label="Estornar baixa de 15/10/2026 de R$');
  });

  test("sem permissão, nem botão nem explicação", () => {
    const saida = html([{ ...aprovada, conciliada: true }], false);
    expect(saida).not.toContain(">Estornar<");
    expect(saida).not.toContain("desconcilie");
  });

  test("conciliada e de repasse trocam o botão pelo motivo", () => {
    expect(html([{ ...aprovada, conciliada: true }])).toContain("Conciliada: desconcilie antes de estornar");
    expect(html([{ ...aprovada, deRepasse: true }])).toContain("Repasse de cartão: desfaça em Repasses de cartão");
    expect(html([{ ...aprovada, conciliada: true }])).not.toContain(">Estornar<");
  });

  test("estornada: selo, quem, quando (Brasília) e motivo, sem ações", () => {
    const saida = html([
      {
        ...aprovada,
        status: "ESTORNADO",
        estornadaPor: "João",
        estornadaEm: new Date("2026-10-16T12:40:00.000Z"),
        motivoEstorno: "conta errada",
      },
    ]);
    expect(saida).toContain("Estornada");
    expect(saida).toContain("estornada por João em 16/10/2026 09:40: conta errada");
    expect(saida).not.toContain(">Estornar<");
  });
});

describe("BaixasDaParcela com baixa pendente", () => {
  test("pendente: selo, quem e quando registrou, sem Estornar", () => {
    const saida = html(
      [{ ...aprovada, status: "PENDENTE", aprovadaPor: null, registradaEm: new Date("2026-10-15T13:20:00.000Z") }],
      true,
    );
    expect(saida).toContain("Aguardando aprovação");
    expect(saida).toContain("registrada por Maria em 15/10/2026 10:20");
    expect(saida).not.toContain("Estornar");
  });
});

describe("BaixasDaParcela sem o usuário do estorno", () => {
  test("usuário apagado: não escreve null", () => {
    const saida = renderToStaticMarkup(
      createElement(BaixasDaParcela, {
        baixas: [
          {
            ...aprovada,
            status: "ESTORNADO",
            estornadaPor: null,
            estornadaEm: new Date("2026-10-16T12:40:00.000Z"),
            motivoEstorno: "conta errada",
          },
        ],
        podeEstornar: true,
        onEstornar: () => {},
      }),
    );
    expect(saida).toContain("estornada em 16/10/2026 09:40: conta errada");
    expect(saida).not.toContain("null");
  });
});

describe("textoDosAjustes", () => {
  test("só os ajustes diferentes de zero", () => {
    expect(textoDosAjustes({ valorJuros: 0, valorMulta: 0, valorDesconto: 0 })).toBe("");
    expect(textoDosAjustes({ valorJuros: 12, valorMulta: 2, valorDesconto: 5 })).toMatch(
      /^\+ juros R\$\s12,00 · \+ multa R\$\s2,00 · − desconto R\$\s5,00$/,
    );
  });
});
