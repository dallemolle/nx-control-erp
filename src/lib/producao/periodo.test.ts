import { describe, expect, test } from "vitest";
import { dataDaUrl, hojeDeCalendario, periodoDaUrl } from "./periodo";

const dia = (d: Date) => d.toISOString().slice(0, 10);

describe("datas de calendário da produção", () => {
  test("hoje é a data de Brasília, também depois das 21h (UTC já virou o dia)", () => {
    expect(dia(hojeDeCalendario(new Date("2026-11-10T01:30:00Z")))).toBe("2026-11-09");
    expect(dia(hojeDeCalendario(new Date("2026-11-09T15:00:00Z")))).toBe("2026-11-09");
  });

  test("dataDaUrl aceita só AAAA-MM-DD válida", () => {
    expect(dia(dataDaUrl("2026-11-09")!)).toBe("2026-11-09");
    expect(dataDaUrl("09/11/2026")).toBeUndefined();
    expect(dataDaUrl("2026-13-40")).toBeUndefined();
    expect(dataDaUrl(undefined)).toBeUndefined();
  });

  test("período padrão é o mês de hoje; datas da URL têm prioridade", () => {
    const agora = new Date("2026-11-09T15:00:00Z");
    const padrao = periodoDaUrl({}, agora);
    expect([dia(padrao.inicio), dia(padrao.fim)]).toEqual(["2026-11-01", "2026-11-30"]);
    const informado = periodoDaUrl({ inicio: "2026-10-05", fim: "2026-10-20" }, agora);
    expect([dia(informado.inicio), dia(informado.fim)]).toEqual(["2026-10-05", "2026-10-20"]);
  });
});
