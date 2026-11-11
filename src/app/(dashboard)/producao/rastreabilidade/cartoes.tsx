import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatarData } from "@/lib/formatacao";
import { linhasDoDestino, type DestinoLote } from "@/lib/producao/destinoLote";
import { ROTULOS_CATEGORIA_PRODUTO, ROTULOS_STATUS_ENTREGA } from "@/lib/schemas/enums";
import { descreverOrigem, type LinhaCliente, type OpRastreio, type Rastreio } from "@/server/services/rastreabilidade";
import { BranqueamentoBadge, KG, PERCENTUAL, StatusOPBadge, VerificacaoBadge } from "../processamento/formatos";
import { LinkRastreio } from "../_shared/link-rastreio";
import { StatusLoteBadge } from "../_shared/status-lote-badge";

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="text-sm font-medium tabular-nums">{children}</dd>
    </div>
  );
}

function Vazio({ colunas, texto }: { colunas: number; texto: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colunas} className="py-6 text-center text-sm text-muted-foreground">
        {texto}
      </TableCell>
    </TableRow>
  );
}

function Removido() {
  return (
    <Badge variant="outline" className="ml-2">
      Removido
    </Badge>
  );
}

function LinkOP({ numero }: { numero: string }) {
  return (
    <Link href={`/producao/processamento/${encodeURIComponent(numero)}`} className="underline-offset-4 hover:underline">
      {numero}
    </Link>
  );
}

export function CartaoLote({ rastreio, acoes }: { rastreio: Rastreio; acoes: React.ReactNode }) {
  const { lote } = rastreio;
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
            {lote.codigo}
            <StatusLoteBadge status={lote.status} />
          </CardTitle>
          <CardDescription>
            {ROTULOS_CATEGORIA_PRODUTO[lote.categoria]} · {lote.produto}
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">{acoes}</div>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Dado rotulo={lote.categoria === "FRUTO" ? "Recepção" : "Fabricação"}>{formatarData(lote.data)}</Dado>
          <Dado rotulo="Validade">{formatarData(lote.validade)}</Dado>
          <Dado rotulo="Local">{lote.local}</Dado>
          <Dado rotulo="Quantidade inicial">{KG.format(lote.quantidadeInicialKg)} kg</Dado>
          <Dado rotulo="Saldo">{KG.format(lote.saldoKg)} kg</Dado>
        </dl>
      </CardContent>
    </Card>
  );
}

function ResumoOP({ op }: { op: OpRastreio }) {
  return (
    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
      <Dado rotulo="OP">
        <span className="flex flex-wrap items-center gap-1">
          <LinkOP numero={op.numero} />
          <StatusOPBadge status={op.status} />
        </span>
      </Dado>
      <Dado rotulo="Data">{formatarData(op.data)}</Dado>
      <Dado rotulo="Responsável">{op.responsavel ?? "—"}</Dado>
      <Dado rotulo="Branqueamento">
        <span className="flex flex-wrap items-center gap-1">
          {op.branqueamentoTemperaturaC === null ? "—" : `${op.branqueamentoTemperaturaC} °C`}
          {" · "}
          {op.branqueamentoTempoS === null ? "—" : `${op.branqueamentoTempoS} s`}
          <BranqueamentoBadge status={op.branqueamento} />
        </span>
      </Dado>
      <Dado rotulo="Rendimento · balanço">
        <span className="flex flex-wrap items-center gap-1">
          {op.rendimento === null ? "—" : PERCENTUAL.format(op.rendimento)}
          {" · "}
          {KG.format(op.balanco.diferencaKg)} kg
          <VerificacaoBadge status={op.balanco.status} />
        </span>
      </Dado>
    </dl>
  );
}

export function CartaoOrigem({ rastreio, incluirCancelados }: { rastreio: Rastreio; incluirCancelados: boolean }) {
  const { recepcao, opOrigem } = rastreio;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Origem</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {recepcao ? (
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <Dado rotulo="Recepção">
              {formatarData(recepcao.data)}
              {recepcao.cancelada ? (
                <Badge variant="destructive" className="ml-2">
                  Excluída
                </Badge>
              ) : null}
            </Dado>
            <Dado rotulo="Origem">{descreverOrigem(recepcao)}</Dado>
            <Dado rotulo="Qualidade">{recepcao.qualidade ?? "—"}</Dado>
            <Dado rotulo="Peso bruto · descarte">
              {KG.format(recepcao.pesoBrutoKg)} kg · {KG.format(recepcao.descarteKg)} kg
            </Dado>
            <Dado rotulo="Documento">{recepcao.documento ?? "—"}</Dado>
          </dl>
        ) : null}
        {opOrigem ? (
          <>
            <ResumoOP op={opOrigem} />
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lote de fruto</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">kg consumido</TableHead>
                    <TableHead>Recepção</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Qualidade</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rastreio.frutosConsumidos.length === 0 ? <Vazio colunas={6} texto="Nenhum fruto consumido." /> : null}
                  {rastreio.frutosConsumidos.map((f, n) => (
                    <TableRow key={`${f.codigo}-${n}`} className={f.removido ? "text-muted-foreground" : undefined}>
                      <TableCell className="font-medium whitespace-nowrap">
                        <LinkRastreio codigo={f.codigo} incluirCancelados={incluirCancelados} />
                        {f.removido ? <Removido /> : null}
                      </TableCell>
                      <TableCell>{f.produto}</TableCell>
                      <TableCell className="text-right tabular-nums">{KG.format(f.kgConsumido)}</TableCell>
                      <TableCell>{formatarData(f.dataRecepcao)}</TableCell>
                      <TableCell>{descreverOrigem(f.origem)}</TableCell>
                      <TableCell>{f.origem?.qualidade ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        ) : null}
        {!recepcao && !opOrigem ? (
          <p className="text-sm text-muted-foreground">Lote sem recepção nem OP de origem registrada.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function CartaoParaFrente({ rastreio, incluirCancelados }: { rastreio: Rastreio; incluirCancelados: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Para frente</CardTitle>
        <CardDescription>OPs que usaram este fruto e os lotes de polpa que elas geraram.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {rastreio.opsQueConsumiram.length === 0 ? (
          <p className="text-sm text-muted-foreground">Este fruto não foi usado em nenhuma OP.</p>
        ) : null}
        {rastreio.opsQueConsumiram.map((op) => (
          <section key={op.numero} className="space-y-3 border-t pt-4 first:border-t-0 first:pt-0">
            <ResumoOP op={op} />
            <p className="text-sm">
              Usou <span className="font-medium tabular-nums">{KG.format(op.kgDesteLote)} kg</span> deste lote
              {op.consumoRemovido ? <Removido /> : null}
            </p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lote de polpa</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">kg produzido</TableHead>
                    <TableHead className="text-right">Saldo (kg)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {op.lotesPolpa.length === 0 ? <Vazio colunas={4} texto="Nenhuma polpa lançada." /> : null}
                  {op.lotesPolpa.map((p) => (
                    <TableRow key={p.codigo} className={p.removido ? "text-muted-foreground" : undefined}>
                      <TableCell className="font-medium whitespace-nowrap">
                        <LinkRastreio codigo={p.codigo} incluirCancelados={incluirCancelados} />
                        {p.removido ? <Removido /> : null}
                      </TableCell>
                      <TableCell>{p.produto}</TableCell>
                      <TableCell className="text-right tabular-nums">{KG.format(p.kg)}</TableCell>
                      <TableCell className="text-right tabular-nums">{KG.format(p.saldoKg)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        ))}
      </CardContent>
    </Card>
  );
}

export function CartaoDestino({ destino }: { destino: DestinoLote }) {
  const linhas = linhasDoDestino(destino);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Destino do lote</CardTitle>
        <CardDescription>Para onde foi cada kg, pelos movimentos de estoque.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!destino.confere ? (
          <p className="text-sm text-destructive">A soma dos movimentos não bate com o saldo do lote. Avise o suporte.</p>
        ) : null}
        <Table className="max-w-md">
          <TableBody>
            {linhas.map((l, n) => (
              <TableRow key={l.rotulo} className={n === linhas.length - 1 ? "font-medium" : undefined}>
                <TableCell>{l.rotulo}</TableCell>
                <TableCell className="text-right tabular-nums">{KG.format(l.kg)} kg</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function resumoDosClientes(clientes: LinhaCliente[]) {
  const validos = clientes.filter((c) => !c.pedidoCancelado);
  return {
    clientes: new Set(validos.map((c) => `${c.cliente.cnpjCpf ?? ""}|${c.cliente.nome}`)).size,
    kg: validos.reduce((s, c) => s + c.kg, 0),
  };
}

export function CartaoClientes({ clientes, incluirCancelados }: { clientes: LinhaCliente[]; incluirCancelados: boolean }) {
  const resumo = resumoDosClientes(clientes);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Clientes que receberam</CardTitle>
        <CardDescription>
          {resumo.clientes} {resumo.clientes === 1 ? "cliente" : "clientes"} · {KG.format(resumo.kg)} kg
          {incluirCancelados ? " (sem contar pedidos cancelados)" : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pedido</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Lote vendido</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>Endereço</TableHead>
              <TableHead className="text-right">kg</TableHead>
              <TableHead>Entrega</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clientes.length === 0 ? <Vazio colunas={8} texto="Nenhuma venda deste lote." /> : null}
            {clientes.map((c, n) => (
              <TableRow
                key={`${c.pedidoNumero}-${c.loteVendido}-${n}`}
                className={c.pedidoCancelado ? "text-muted-foreground" : undefined}
              >
                <TableCell className="whitespace-nowrap">
                  <Link href={`/vendas/pedidos/${c.pedidoNumero}`} className="underline-offset-4 hover:underline">
                    {c.pedidoNumero}
                  </Link>
                  {c.pedidoCancelado ? (
                    <Badge variant="destructive" className="ml-2">
                      Cancelado
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell>{formatarData(c.pedidoData)}</TableCell>
                <TableCell className="whitespace-nowrap">
                  <LinkRastreio codigo={c.loteVendido} incluirCancelados={incluirCancelados} />
                  {c.opNumero ? (
                    <p className="text-xs text-muted-foreground">
                      polpa da <LinkOP numero={c.opNumero} />
                    </p>
                  ) : null}
                </TableCell>
                <TableCell>
                  {c.cliente.nome}
                  {c.cliente.cnpjCpf ? <p className="text-xs text-muted-foreground">{c.cliente.cnpjCpf}</p> : null}
                </TableCell>
                <TableCell className="text-sm">
                  {[c.cliente.contato, c.cliente.telefone, c.cliente.email].filter(Boolean).join(" · ") || "—"}
                </TableCell>
                <TableCell className="text-sm">
                  {[c.cliente.enderecoEntrega, c.cliente.municipio].filter(Boolean).join(" · ") || "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">{KG.format(c.kg)}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {c.entrega ? ROTULOS_STATUS_ENTREGA[c.entrega.status] : "Retira"}
                  {c.entrega?.dataRealizada ? (
                    <p className="text-xs text-muted-foreground">
                      {formatarData(c.entrega.dataRealizada)}
                      {c.entrega.recebidoPor ? ` · ${c.entrega.recebidoPor}` : ""}
                    </p>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
