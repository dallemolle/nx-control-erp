import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { valoresAte } from "@/ajuda/roteiro";
import { configuracaoProducaoSchema } from "@/lib/schemas/configuracaoProducao";
import { balancoMassa } from "@/lib/producao/op";
import { statusDoLote } from "@/lib/producao/statusLote";
import { CONFIGURACAO_PRODUCAO_PADRAO } from "@/server/services/configuracaoProducao";
import { COMPRA, PRAZO_PRODUTOR_DIAS } from "@/ajuda/recepcao/exemplo";
import { OPS } from "@/ajuda/relatorio-processamento/exemplo";
import {
  ajudaConfiguracaoProducao,
  OP_ACEROLA,
  VALORES_INICIAIS,
} from "./index";

function data(br: string): Date {
  const [dia, mes, ano] = br.split("/").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

describe("ajuda de Configuração de produção", () => {
  test("tem os três roteiros, com o alvo de cada passo na cena", () => {
    expect(ajudaConfiguracaoProducao.roteiros.map((r) => r.id)).toEqual([
      "preparar-recepcao-vendas",
      "dados-etiqueta",
      "alertas-controles",
    ]);
    for (const roteiro of ajudaConfiguracaoProducao.roteiros) {
      roteiro.passos.forEach((passo, indice) => {
        const markup = renderToStaticMarkup(
          createElement(ajudaConfiguracaoProducao.cenas[passo.cena], {
            valores: valoresAte(roteiro, indice),
          }),
        );
        expect(
          markup,
          `${roteiro.id}, passo ${indice + 1} (${passo.alvo})`,
        ).toContain(`data-alvo="${passo.alvo}"`);
      });
    }
  });

  test("a tela começa com os padrões do sistema", () => {
    const p = CONFIGURACAO_PRODUCAO_PADRAO;
    expect(VALORES_INICIAIS["alerta.congelado"]).toBe(
      String(p.alertaVencimentoCongeladoDias),
    );
    expect(VALORES_INICIAIS["alerta.resfriado"]).toBe(
      String(p.alertaVencimentoResfriadoDias),
    );
    expect(VALORES_INICIAIS["branq.temperatura"]).toBe(
      String(p.branqueamentoTemperaturaMinC),
    );
    expect(VALORES_INICIAIS["branq.tempo"]).toBe(
      String(p.branqueamentoTempoMinS),
    );
    expect(VALORES_INICIAIS["balanco.tolerancia"]).toBe(
      String(p.toleranciaBalancoMassa * 100),
    );
    expect(VALORES_INICIAIS["compra.prazo"]).toBe(
      String(p.prazoPagamentoProdutorDias),
    );
  });

  test("os números do exemplo passam na validação da tela", () => {
    const r = configuracaoProducaoSchema.safeParse({
      registroAdepara: "PA-0452/2026",
      alertaVencimentoCongeladoDias: VALORES_INICIAIS["alerta.congelado"],
      alertaVencimentoResfriadoDias: VALORES_INICIAIS["alerta.resfriado"],
      branqueamentoTemperaturaMinC: VALORES_INICIAIS["branq.temperatura"],
      branqueamentoTempoMinS: VALORES_INICIAIS["branq.tempo"],
      toleranciaBalancoMassaPercentual: VALORES_INICIAIS["balanco.tolerancia"],
      prazoPagamentoProdutorDias: String(PRAZO_PRODUTOR_DIAS),
    });
    expect(r.success).toBe(true);
    expect(r.data?.toleranciaBalancoMassa).toBe(0.03);
  });

  test("o prazo de 7 dias dá o vencimento do José da Silva na Recepção", () => {
    const vencimento = data(COMPRA.data);
    vencimento.setUTCDate(vencimento.getUTCDate() + PRAZO_PRODUTOR_DIAS);
    expect(vencimento.getTime()).toBe(data(COMPRA.vencimento).getTime());
  });

  test("a OP de acerola marca Verificar com 3% e deixa de marcar com 10%", () => {
    const op = OPS.find((o) => o.numero === OP_ACEROLA.numero)!;
    expect(op.balancoVerificar).toBe(true);
    const e = {
      frutoKg: op.frutoKg,
      aguaLitros: op.aguaLitros,
      polpaKg: op.polpaKg,
      carocoResiduoKg: op.carocoResiduoKg,
      perdaKg: op.perdaKg,
    };
    expect(op.frutoKg + op.aguaLitros).toBe(OP_ACEROLA.entradaKg);
    expect(op.polpaKg + op.carocoResiduoKg + op.perdaKg).toBe(
      OP_ACEROLA.saidaKg,
    );
    expect(balancoMassa(e, 0.03)).toMatchObject({
      percentual: 0.1,
      status: "VERIFICAR",
    });
    expect(balancoMassa(e, 0.1).status).toBe("OK");
  });

  test("com 1 dia, o lote resfriado fica Vencendo na véspera e no dia, e OK dois dias antes", () => {
    const alertas = {
      alertaVencimentoCongeladoDias: 30,
      alertaVencimentoResfriadoDias: 1,
    };
    const lote = (validade: string) => ({
      saldoKg: 10,
      validade: data(validade),
      conservacao: "RESFRIADO" as const,
    });
    const hoje = data("20/11/2026");
    expect(statusDoLote(lote("20/11/2026"), hoje, alertas)).toBe("VENCENDO");
    expect(statusDoLote(lote("21/11/2026"), hoje, alertas)).toBe("VENCENDO");
    expect(statusDoLote(lote("22/11/2026"), hoje, alertas)).toBe("OK");
  });
});
