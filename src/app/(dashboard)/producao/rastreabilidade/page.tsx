import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { buscarLotes, rastrearLote } from "@/server/services/rastreabilidade";
import { formatarData } from "@/lib/formatacao";
import { ExportarLinks } from "../../_shared/exportar-links";
import { KG } from "../processamento/formatos";
import { hrefRastreio, LinkRastreio } from "../_shared/link-rastreio";
import { CartaoClientes, CartaoDestino, CartaoLote, CartaoOrigem, CartaoParaFrente } from "./cartoes";

const LIMITE_BUSCA = 20;

export default async function RastreabilidadePage({
  searchParams,
}: {
  searchParams: Promise<{ lote?: string; cancelados?: string }>;
}) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "producao:ler");

  const sp = await searchParams;
  const termo = (sp.lote ?? "").trim();
  const incluirCancelados = sp.cancelados === "1";
  const rastreio = termo ? await rastrearLote(sessao, termo, { incluirCancelados }) : null;
  const encontrados = termo && !rastreio ? await buscarLotes(sessao, termo) : [];

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Rastreabilidade</h1>
        <p className="text-sm text-muted-foreground">
          De onde veio um lote e para quem foi, até os clientes da polpa feita com o fruto. Use no recall e na
          fiscalização.
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1">
          <Label htmlFor="lote">Código do lote</Label>
          <Input id="lote" name="lote" defaultValue={termo} placeholder="Ex.: FA-261110-01 ou FA-2611" className="w-64" />
        </div>
        {incluirCancelados ? <input type="hidden" name="cancelados" value="1" /> : null}
        <Button type="submit">Rastrear</Button>
      </form>

      {termo && !rastreio ? (
        <Card>
          <CardHeader>
            <CardTitle>{encontrados.length === 0 ? "Nenhum lote encontrado" : `Lotes com "${termo}" no código`}</CardTitle>
          </CardHeader>
          {encontrados.length > 0 ? (
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lote</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Saldo (kg)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {encontrados.map((l) => (
                    <TableRow key={l.codigo}>
                      <TableCell className="font-medium">
                        <LinkRastreio codigo={l.codigo} incluirCancelados={incluirCancelados} />
                      </TableCell>
                      <TableCell>{l.produto}</TableCell>
                      <TableCell>{formatarData(l.data)}</TableCell>
                      <TableCell className="text-right tabular-nums">{KG.format(l.saldoKg)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {encontrados.length === LIMITE_BUSCA ? (
                <p className="pt-2 text-xs text-muted-foreground">
                  Mostrando os {LIMITE_BUSCA} mais recentes. Digite mais do código para filtrar.
                </p>
              ) : null}
            </CardContent>
          ) : null}
        </Card>
      ) : null}

      {rastreio ? (
        <>
          <CartaoLote
            rastreio={rastreio}
            acoes={
              <>
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={<Link href={hrefRastreio(rastreio.lote.codigo, !incluirCancelados)} />}
                >
                  {incluirCancelados ? "Ocultar cancelados" : "Mostrar cancelados"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={<Link href={`/producao/lotes/${rastreio.lote.id}/etiqueta`} target="_blank" />}
                >
                  Etiqueta
                </Button>
              </>
            }
          />
          <ExportarLinks
            baseHref="/producao/rastreabilidade/export"
            queryString={new URLSearchParams({
              lote: rastreio.lote.codigo,
              ...(incluirCancelados ? { cancelados: "1" } : {}),
            }).toString()}
          />
          <CartaoOrigem rastreio={rastreio} incluirCancelados={incluirCancelados} />
          {rastreio.lote.categoria === "FRUTO" ? (
            <CartaoParaFrente rastreio={rastreio} incluirCancelados={incluirCancelados} />
          ) : null}
          <CartaoDestino destino={rastreio.destino} />
          <CartaoClientes clientes={rastreio.clientes} incluirCancelados={incluirCancelados} />
        </>
      ) : null}
    </div>
  );
}
