import type { FilialDesativadaComPendencia } from "@/server/services/filiaisConsolidadas";
import { formatarMoeda } from "@/lib/formatacao";

function descreverPendencia(filial: FilialDesativadaComPendencia): string {
  const partes: string[] = [];
  if (filial.parcelasEmAberto > 0) {
    const parcelas = filial.parcelasEmAberto === 1 ? "1 parcela" : `${filial.parcelasEmAberto} parcelas`;
    partes.push(`${parcelas} em aberto (${formatarMoeda(filial.valorEmAberto)})`);
  }
  if (Math.abs(filial.saldoEmCaixa) >= 0.005) {
    partes.push(`saldo em caixa de ${formatarMoeda(filial.saldoEmCaixa)}`);
  }
  return partes.join(" e ");
}

/**
 * Os consolidados somam só filiais ativas. Se uma desativada ainda tem
 * parcela em aberto ou saldo, avisa — o dinheiro existe, só não entra aqui.
 */
export function AvisoFiliaisDesativadas({ filiais }: { filiais: FilialDesativadaComPendencia[] }) {
  if (filiais.length === 0) return null;
  return (
    <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground" role="note">
      <p>
        {filiais.length === 1
          ? "Uma filial desativada não entra nestes números, mas ainda tem pendências:"
          : "Filiais desativadas não entram nestes números, mas ainda têm pendências:"}
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {filiais.map((filial) => (
          <li key={filial.id}>
            <span className="font-medium text-foreground">{filial.nome}</span>: {descreverPendencia(filial)}.
          </li>
        ))}
      </ul>
      <p className="mt-1">Para tratar essas pendências, um administrador pode reativar a filial em Administração → Filiais.</p>
    </div>
  );
}
