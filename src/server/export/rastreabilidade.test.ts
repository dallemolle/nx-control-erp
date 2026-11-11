import { describe, expect, test } from "vitest";
import type { LinhaCliente, Rastreio } from "@/server/services/rastreabilidade";
import { COLUNAS_CLIENTES, nomeDoArquivo, secoesDoRastreio } from "./rastreabilidade";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const OP = {
  numero: "OP-261110-01",
  data: d("2026-11-10"),
  status: "ENCERRADA" as const,
  responsavel: "Joana",
  branqueamentoTemperaturaC: 85,
  branqueamentoTempoS: 12,
  rendimento: 0.5,
  balanco: { diferencaKg: 0, percentual: 0, status: "OK" as const },
  branqueamento: "OK" as const,
};

const CLIENTE: LinhaCliente = {
  caminho: "POLPA",
  loteVendido: "AGC-261110-01",
  opNumero: "OP-261110-01",
  pedidoNumero: 7,
  pedidoData: d("2026-11-11"),
  pedidoCancelado: true,
  kg: 10,
  entrega: null,
  cliente: {
    nome: "Mercado",
    cnpjCpf: null,
    contato: null,
    telefone: "93 9999",
    email: null,
    municipio: "Santarém",
    enderecoEntrega: null,
  },
};

const base = (categoria: "FRUTO" | "POLPA"): Rastreio => ({
  lote: {
    id: "x",
    codigo: "FA-261110-01",
    produto: "Fruto de açaí",
    categoria,
    data: d("2026-11-10"),
    validade: d("2026-11-11"),
    local: "Recepção",
    quantidadeInicialKg: 100,
    saldoKg: 19,
    status: "OK",
  },
  recepcao: null,
  opOrigem: null,
  frutosConsumidos: [],
  opsQueConsumiram: [],
  destino: {
    entradaKg: 100,
    estornoEntradaKg: 0,
    vendidoKg: 20,
    consumidoOpKg: 60,
    ajustes: [],
    saldoKg: 20,
    confere: true,
  },
  clientes: [CLIENTE],
});

describe("secoesDoRastreio", () => {
  test("fruto: lote, recepção, OPs, polpas, destino e clientes", () => {
    const r: Rastreio = {
      ...base("FRUTO"),
      recepcao: {
        origem: "PROPRIA",
        talhao: "Talhão 1",
        fornecedor: null,
        qualidade: "A",
        data: d("2026-11-10"),
        pesoBrutoKg: 100,
        descarteKg: 0,
        documento: null,
        cancelada: false,
      },
      opsQueConsumiram: [
        {
          ...OP,
          kgDesteLote: 60,
          consumoRemovido: false,
          lotesPolpa: [{ codigo: "AGC-261110-01", produto: "Polpa", kg: 40, saldoKg: 30, removido: false }],
        },
      ],
    };
    const secoes = secoesDoRastreio(r);
    expect(secoes.map((s) => s.titulo)).toEqual([
      "Lote",
      "Origem: recepção",
      "OPs que consumiram o lote",
      "Lotes de polpa gerados",
      "Destino do lote",
      "Clientes que receberam",
    ]);
    const polpas = secoes[3];
    expect(polpas.colunas[0].valor(polpas.linhas[0])).toBe("OP-261110-01");
  });

  test("polpa: OP de origem e frutos consumidos; destino que não confere avisa no título", () => {
    const r: Rastreio = {
      ...base("POLPA"),
      opOrigem: OP,
      destino: { ...base("POLPA").destino, confere: false },
    };
    expect(secoesDoRastreio(r).map((s) => s.titulo)).toEqual([
      "Lote",
      "Origem: OP",
      "Frutos consumidos",
      "Destino do lote (não confere com o saldo)",
      "Clientes que receberam",
    ]);
  });
});

describe("COLUNAS_CLIENTES", () => {
  test("retira, cancelado e caminho", () => {
    const valor = (rotulo: string) => COLUNAS_CLIENTES.find((c) => c.rotulo === rotulo)!.valor(CLIENTE);
    expect(valor("Caminho")).toBe("Polpa");
    expect(valor("Entrega")).toBe("Retira");
    expect(valor("Cancelado")).toBe("Sim");
    expect(valor("CPF/CNPJ")).toBe("");
  });
});

describe("nomeDoArquivo", () => {
  test("troca o que não for letra, número, - ou _", () => {
    expect(nomeDoArquivo("FA-261110-01")).toBe("rastreabilidade-FA-261110-01");
    expect(nomeDoArquivo("lote/1 a")).toBe("rastreabilidade-lote_1_a");
  });
});
