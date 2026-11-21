import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { valoresAte } from "@/ajuda/roteiro";
import { formatarMoeda } from "@/lib/formatacao";
import { calcularRepasses, condicaoParaVenda } from "@/lib/producao/cartao";
import { calcularPedido, condicaoDasParcelas, gerarParcelasPorPrazos, interpretarPrazos } from "@/lib/producao/venda";
import { deData, estadoDoFormulario, MOTIVO_BLOQUEIO, paraTexto, totaisDoPedido } from "./cenas";
import { CITADOS, LOTES, MAQUININHA, OPERADORA, PARCELAS_131, PEDIDOS, pedido } from "./exemplo";
import { ajudaPedidos } from "./index";

const { roteiros, cenas } = ajudaPedidos;
const roteiroDe = (id: string) => roteiros.find((r) => r.id === id)!;
const ultimoValores = (id: string) => valoresAte(roteiroDe(id), roteiroDe(id).passos.length - 1);

describe("roteiros de Pedidos", () => {
  test("são os 6 roteiros, com ids únicos", () => {
    expect(roteiros.map((r) => r.id)).toEqual([
      "lancar-a-vista",
      "lancar-a-prazo",
      "vender-maquininha",
      "consultar-pedidos",
      "abrir-pedido",
      "corrigir-pedido",
    ]);
  });

  test("o faturamento de novembro é o do Painel e dos relatórios (R$ 5.700,00, sem o 127)", () => {
    const confirmados = PEDIDOS.filter((p) => !p.cancelado);
    expect(confirmados.map((p) => p.numero)).toEqual([131, 128, 120]);
    const totais = calcularPedido(confirmados.map((p) => p.item));
    expect(totais.valor).toBe(CITADOS.totalConfirmados);
    expect(totais.custo).toBe(CITADOS.custoConfirmados);
  });

  test("os valores do 128 e do 131 batem com calcularPedido", () => {
    const t128 = totaisDoPedido(pedido(128));
    expect([t128.valor, t128.custo, t128.margem]).toEqual([CITADOS.valor128, CITADOS.custo128, CITADOS.margem128]);
    expect(totaisDoPedido(pedido(131)).valor).toBe(CITADOS.valor131);
    expect(totaisDoPedido(pedido(127)).valor).toBe(2160);
  });

  test("o formulário do roteiro à vista chega aos números do 128", () => {
    const f = estadoDoFormulario(ultimoValores("lancar-a-vista"));
    expect(f.calculo).toEqual({ valor: CITADOS.valor128, custo: CITADOS.custo128, margem: CITADOS.margem128 });
    expect(f.retira).toBe(false);
  });

  test("as parcelas do 131 saem de gerarParcelasPorPrazos e a condição gravada é 14/28", () => {
    const leitura = interpretarPrazos(pedido(131).condicao!);
    if (!leitura.ok) throw new Error(leitura.erro);
    const parcelas = gerarParcelasPorPrazos(deData(pedido(131).data), CITADOS.valor131, leitura.prazos);
    expect(parcelas.map((p) => ({ vencimento: paraTexto(p.dataVencimento), valor: p.valor }))).toEqual(PARCELAS_131);
    expect(condicaoDasParcelas(deData(pedido(131).data), parcelas.map((p) => p.dataVencimento))).toBe("14/28");
  });

  test("o ajuste da 1ª parcela para R$ 400,00 mostra que sobram R$ 50,00 e o retorno a R$ 350,00 libera", () => {
    const roteiro = roteiroDe("lancar-a-prazo");
    const indiceAjuste = roteiro.passos.findIndex((p) => p.alvo === "novo.somaParcelas");
    const comErro = estadoDoFormulario(valoresAte(roteiro, indiceAjuste));
    expect(comErro.aviso).toBe(`sobram ${formatarMoeda(50)}`);
    const acertado = estadoDoFormulario(ultimoValores("lancar-a-prazo"));
    expect(acertado.erroParcelas).toBeNull();
  });

  test("os repasses da maquininha batem com calcularRepasses", () => {
    const total = calcularPedido([
      { quantidadeKg: MAQUININHA.quantidadeKg, precoKg: MAQUININHA.precoKg, custoKg: 0 },
    ]).valor;
    expect(total).toBe(CITADOS.totalMaquininha);
    const condicao = condicaoParaVenda(OPERADORA.condicoes, "CREDITO_PARCELADO", MAQUININHA.parcelas)!;
    const repasses = calcularRepasses(deData(MAQUININHA.data), total, condicao, MAQUININHA.parcelas);
    expect(repasses.map((r) => paraTexto(r.data))).toEqual(CITADOS.repasse.datas);
    for (const r of repasses) {
      expect([r.bruto, r.taxa, r.liquido]).toEqual([CITADOS.repasse.bruto, CITADOS.repasse.taxa, CITADOS.repasse.liquido]);
    }
    const f = estadoDoFormulario(ultimoValores("vender-maquininha"));
    expect(f.repasses).toEqual(repasses);
  });

  test("o saldo dos lotes vendidos fecha com a Rastreabilidade", () => {
    const agc = LOTES.find((l) => l.codigo === "AGC-261120-01")!;
    const loja = LOTES.find((l) => l.codigo === "AMC-261120-01/1")!;
    expect(agc.saldoKg - pedido(128).item.quantidadeKg).toBe(179);
    expect(loja.saldoKg - pedido(131).item.quantidadeKg).toBe(150);
  });

  test("a lista filtrada por “Em aberto” mostra só o 131", () => {
    const markup = renderToStaticMarkup(createElement(cenas.lista, { valores: { "lista.situacao": "Em aberto" } }));
    expect(markup).toContain(">131<");
    expect(markup).not.toContain(">128<");
  });

  test("no roteiro de correção, o 127 aparece confirmado antes e cancelado depois", () => {
    const roteiro = roteiroDe("corrigir-pedido");
    const antes = renderToStaticMarkup(createElement(cenas.pedido, { valores: valoresAte(roteiro, 0) }));
    expect(antes).not.toContain("Cancelado em");
    const indiceAviso = roteiro.passos.findIndex((p) => p.alvo === "pedido.aviso");
    const depois = renderToStaticMarkup(createElement(cenas.pedido, { valores: valoresAte(roteiro, indiceAviso) }));
    expect(depois).toContain("Cancelado em");
    const bloqueado = renderToStaticMarkup(createElement(cenas.pedido, { valores: ultimoValores("corrigir-pedido") }));
    expect(bloqueado).toContain(MOTIVO_BLOQUEIO);
  });

  test.each(roteiros.map((r) => [r.id, r] as const))("%s tem conteúdo completo", (_id, roteiro) => {
    expect(roteiro.passos.length).toBeGreaterThan(0);
    expect(roteiro.quandoUsar.trim()).not.toBe("");
    expect(roteiro.eDepois.texto.trim()).not.toBe("");
    if (roteiro.eDepois.proximoRoteiro) {
      expect(roteiros.some((r) => r.id === roteiro.eDepois.proximoRoteiro)).toBe(true);
    }
    for (const passo of roteiro.passos) {
      expect(passo.instrucao.trim()).not.toBe("");
      expect(cenas[passo.cena]).toBeDefined();
    }
  });

  test.each(roteiros.map((r) => [r.id, r] as const))("%s: o alvo de cada passo aparece na cena", (_id, roteiro) => {
    roteiro.passos.forEach((passo, indice) => {
      const markup = renderToStaticMarkup(createElement(cenas[passo.cena], { valores: valoresAte(roteiro, indice) }));
      expect(markup, `passo ${indice + 1} (${passo.alvo})`).toContain(`data-alvo="${passo.alvo}"`);
    });
  });
});
