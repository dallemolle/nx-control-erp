import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatarMoeda } from "@/lib/formatacao";
import type { Unidade } from "@/lib/producao/relatorios";

const KG = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const PCT = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
const INTEIRO = new Intl.NumberFormat("pt-BR");

/** Célula numérica; a unidade vai no cabeçalho da coluna. */
export function formatarCelula(valor: number | null, unidade: Unidade): string {
  if (valor === null) return "—";
  if (unidade === "kg") return KG.format(valor);
  if (unidade === "%") return PCT.format(valor);
  if (unidade === "nº") return INTEIRO.format(valor);
  return formatarMoeda(valor);
}

export type ColunaTabela = { rotulo: string; detalhe?: string; numero?: boolean };

const classe = (numero?: boolean) => (numero ? "text-right tabular-nums" : undefined);

/** Tabela de relatório: título, cabeçalho (com detalhe em 2ª linha), linhas e total em negrito. */
export function TabelaRelatorio({
  titulo,
  colunas,
  linhas,
  total,
  vazio = "Nada no período.",
}: {
  titulo: string;
  colunas: ColunaTabela[];
  linhas: { chave: string; celulas: ReactNode[] }[];
  total?: ReactNode[];
  vazio?: string;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">{titulo}</h2>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {colunas.map((c, i) => (
                <TableHead key={i} className={c.numero ? "text-right" : undefined}>
                  {c.rotulo}
                  {c.detalhe ? (
                    <span className="block text-xs font-normal text-muted-foreground">{c.detalhe}</span>
                  ) : null}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colunas.length} className="py-6 text-center text-sm text-muted-foreground">
                  {vazio}
                </TableCell>
              </TableRow>
            ) : null}
            {linhas.map((l) => (
              <TableRow key={l.chave}>
                {l.celulas.map((celula, i) => (
                  <TableCell key={i} className={classe(colunas[i]?.numero)}>
                    {celula}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {total && linhas.length > 0 ? (
              <TableRow className="font-semibold">
                {total.map((celula, i) => (
                  <TableCell key={i} className={classe(colunas[i]?.numero)}>
                    {celula}
                  </TableCell>
                ))}
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
