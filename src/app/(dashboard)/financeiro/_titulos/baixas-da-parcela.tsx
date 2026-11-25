"use client";
// Espelhado na ajuda (src/ajuda/_titulos/cenas.tsx): mudou rótulo ou texto? Ajuste a ajuda junto.

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formatacao";
import type { BaixaDaParcela } from "./titulos-para-cliente";

/** "+ juros R$ 12,00 · − desconto R$ 5,00": só os ajustes diferentes de zero. */
export function textoDosAjustes(baixa: Pick<BaixaDaParcela, "valorJuros" | "valorMulta" | "valorDesconto">): string {
  return [
    baixa.valorJuros > 0 ? `+ juros ${formatarMoeda(baixa.valorJuros)}` : null,
    baixa.valorMulta > 0 ? `+ multa ${formatarMoeda(baixa.valorMulta)}` : null,
    baixa.valorDesconto > 0 ? `− desconto ${formatarMoeda(baixa.valorDesconto)}` : null,
  ]
    .filter((ajuste) => ajuste !== null)
    .join(" · ");
}

function AcaoDoEstorno({ baixa, onEstornar }: { baixa: BaixaDaParcela; onEstornar: (baixa: BaixaDaParcela) => void }) {
  if (baixa.deRepasse) {
    return <span className="text-xs text-muted-foreground">Repasse de cartão: desfaça em Repasses de cartão</span>;
  }
  if (baixa.conciliada) {
    return <span className="text-xs text-muted-foreground">Conciliada: desconcilie antes de estornar</span>;
  }
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label={`Estornar baixa de ${formatarData(baixa.data)} de ${formatarMoeda(baixa.valorPago)}`}
      onClick={() => onEstornar(baixa)}
    >
      Estornar
    </Button>
  );
}

/** As baixas pendentes, aprovadas e estornadas de uma parcela, com o estorno para quem pode aprovar. */
export function BaixasDaParcela({
  baixas,
  podeEstornar,
  onEstornar,
}: {
  baixas: BaixaDaParcela[];
  podeEstornar: boolean;
  onEstornar: (baixa: BaixaDaParcela) => void;
}) {
  return (
    <div className="space-y-1 text-sm">
      <div className="text-xs font-medium text-muted-foreground">Baixas</div>
      <ul className="space-y-2">
        {baixas.map((baixa) => {
          const estornada = baixa.status === "ESTORNADO";
          const pendente = baixa.status === "PENDENTE";
          const ajustes = textoDosAjustes(baixa);
          return (
            <li key={baixa.id} className="flex flex-wrap items-start justify-between gap-2">
              <div className={estornada ? "text-muted-foreground" : undefined}>
                <p>
                  {`Baixa de ${formatarData(baixa.data)} · ${baixa.conta} · `}
                  <span className={estornada ? "line-through" : "font-medium"}>{formatarMoeda(baixa.valorPago)}</span>
                  {ajustes ? ` (${ajustes})` : null}
                  {estornada && (
                    <Badge variant="secondary" className="ml-2">
                      Estornada
                    </Badge>
                  )}
                  {pendente && (
                    <Badge variant="outline" className="ml-2">
                      Aguardando aprovação
                    </Badge>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {`registrada por ${baixa.registradaPor}` +
                    (pendente ? ` em ${formatarDataHora(baixa.registradaEm)}` : "") +
                    (baixa.aprovadaPor ? ` · aprovada por ${baixa.aprovadaPor}` : "")}
                </p>
                {estornada && baixa.estornadaEm && (
                  <p className="text-xs">
                    {`estornada${baixa.estornadaPor ? ` por ${baixa.estornadaPor}` : ""} ` +
                      `em ${formatarDataHora(baixa.estornadaEm)}: ${baixa.motivoEstorno}`}
                  </p>
                )}
              </div>
              {!estornada && !pendente && podeEstornar && <AcaoDoEstorno baixa={baixa} onEstornar={onEstornar} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
