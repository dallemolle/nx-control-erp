import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { prisma } from "@/server/db/client";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar, requirePermission } from "@/server/auth/permissions";
import { lotesParaConsumo, obterOP } from "@/server/services/ordemProducao";
import { obterConfiguracaoProducao } from "@/server/services/configuracaoProducao";
import { formatarData, formatarMoeda } from "@/lib/formatacao";
import { paraDataIso } from "@/lib/producao/periodo";
import { cn } from "@/lib/utils";
import { BranqueamentoBadge, KG, PERCENTUAL, StatusOPBadge, VerificacaoBadge } from "../formatos";
import { LinkRastreio } from "../../_shared/link-rastreio";
import { DesfazerOP, EditarCabecalhoOP, EncerrarOP } from "./op-acoes";
import { FormConsumo, FormInsumo, FormProducao, RemoverLinha } from "./linhas-op";
import { ProcessoForm } from "./processo-form";

const ABAS = [
  { id: "consumo", rotulo: "Consumo" },
  { id: "producao", rotulo: "Produção" },
  { id: "insumos", rotulo: "Insumos" },
  { id: "processo", rotulo: "Processo" },
] as const;
type Aba = (typeof ABAS)[number]["id"];

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

export default async function OPPage({
  params,
  searchParams,
}: {
  params: Promise<{ numero: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "producao:ler");

  const [{ numero }, sp] = await Promise.all([params, searchParams]);
  const op = await obterOP(sessao.filialId, decodeURIComponent(numero));
  if (!op) notFound();

  const aba: Aba = ABAS.some((a) => a.id === sp.aba) ? (sp.aba as Aba) : "consumo";
  const podeAgir = podeExecutar(sessao.perfil, "producao:escrever") && sessao.podeAlterarFilial;
  const aberta = op.status === "ABERTA";
  const podeLancar = podeAgir && aberta;
  const encerrada = op.status === "ENCERRADA";

  const configuracao = await obterConfiguracaoProducao(sessao.filialId);
  const [lotes, produtos, locais, insumos, frutas] = podeLancar
    ? await Promise.all([
        lotesParaConsumo(sessao.filialId, op.frutaId, op.data),
        prisma.produto.findMany({
          where: { empresaId: sessao.empresaId, ativo: true, categoria: "POLPA", frutaId: op.frutaId },
          select: { id: true, codigo: true, descricao: true },
          orderBy: { codigo: "asc" },
        }),
        prisma.localArmazenamento.findMany({
          where: { filialId: sessao.filialId, ativo: true },
          select: { id: true, nome: true },
          orderBy: { nome: "asc" },
        }),
        prisma.insumo.findMany({
          where: { empresaId: sessao.empresaId, ativo: true },
          select: { id: true, nome: true, unidade: true, custoUnitario: true },
          orderBy: { nome: "asc" },
        }),
        prisma.fruta.findMany({
          where: { empresaId: sessao.empresaId, ativo: true },
          select: { id: true, nome: true },
          orderBy: { nome: "asc" },
        }),
      ])
    : [[], [], [], [], []];
  const lotesNaOP = new Set(op.consumos.map((c) => c.loteId));
  const temLinhas = op.consumos.length + op.producoes.length > 0;
  const contagem: Record<Aba, number | null> = {
    consumo: op.consumos.length,
    producao: op.producoes.length,
    insumos: op.insumos.length,
    processo: null,
  };
  const { resumo } = op;

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href="/producao/processamento" className="underline-offset-4 hover:underline">
              Processamento
            </Link>
          </p>
          <h1 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
            {op.numero}
            <StatusOPBadge status={op.status} />
          </h1>
          <p className="text-sm text-muted-foreground">
            {formatarData(op.data)} · {op.fruta.nome}
            {op.responsavel ? ` · ${op.responsavel}` : ""} · aberta por {op.usuario.nome}
          </p>
          {op.status === "CANCELADA" && op.motivoCancelamento ? (
            <p className="text-sm text-muted-foreground">Cancelada: {op.motivoCancelamento}</p>
          ) : null}
          {op.motivoReabertura && op.status !== "CANCELADA" ? (
            <p className="text-sm text-muted-foreground">Reaberta: {op.motivoReabertura}</p>
          ) : null}
        </div>
        {podeAgir && op.status !== "CANCELADA" ? (
          <div className="flex flex-wrap items-center gap-2">
            {aberta ? (
              <EditarCabecalhoOP
                op={{
                  id: op.id,
                  data: paraDataIso(op.data),
                  frutaId: op.frutaId,
                  frutaNome: op.fruta.nome,
                  responsavel: op.responsavel,
                }}
                frutas={frutas}
                temLinhas={temLinhas}
              />
            ) : null}
            {aberta ? <EncerrarOP opId={op.id} numero={op.numero} aVerificar={resumo.aVerificar} /> : null}
            {encerrada ? (
              <DesfazerOP tipo="reabrir" opId={op.id} numero={op.numero} situacao={op.situacaoDesfazer} />
            ) : null}
            <DesfazerOP tipo="cancelar" opId={op.id} numero={op.numero} situacao={op.situacaoDesfazer} />
          </div>
        ) : null}
      </div>
      {podeAgir && !op.situacaoDesfazer.pode && op.status !== "CANCELADA" ? (
        <p className="-mt-3 text-xs text-muted-foreground">{op.situacaoDesfazer.motivo}: não dá mais para reabrir nem cancelar.</p>
      ) : null}

      <Card>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Dado rotulo="Fruto consumido">{KG.format(resumo.frutoKg)} kg</Dado>
            <Dado rotulo="Polpa produzida">{KG.format(resumo.polpaKg)} kg</Dado>
            <Dado rotulo="Rendimento">{resumo.rendimento === null ? "—" : PERCENTUAL.format(resumo.rendimento)}</Dado>
            <Dado rotulo="Balanço de massa">
              <span className="flex flex-wrap items-center gap-1">
                {KG.format(resumo.balanco.diferencaKg)} kg
                {resumo.balanco.percentual === null ? null : (
                  <span className="text-muted-foreground">({PERCENTUAL.format(resumo.balanco.percentual)})</span>
                )}
                <VerificacaoBadge status={resumo.balanco.status} />
              </span>
            </Dado>
            <Dado rotulo="Branqueamento">
              <BranqueamentoBadge status={resumo.branqueamento} />
            </Dado>
            <Dado rotulo="Custo do fruto">{formatarMoeda(resumo.custo.custoFrutoTotal)}</Dado>
            <Dado rotulo="Custo dos insumos">{formatarMoeda(resumo.custo.custoInsumosTotal)}</Dado>
            <Dado rotulo={encerrada ? "Custo/kg da polpa" : "Custo/kg (provisório)"}>
              {formatarMoeda(resumo.custo.custoKgPolpa)}
            </Dado>
          </dl>
        </CardContent>
      </Card>

      <nav className="flex flex-wrap gap-2" aria-label="Partes da OP">
        {ABAS.map((a) => (
          <Button
            key={a.id}
            size="sm"
            variant={a.id === aba ? "default" : "outline"}
            nativeButton={false}
            render={<Link href={`?aba=${a.id}`} scroll={false} aria-current={a.id === aba ? "page" : undefined} />}
          >
            {a.rotulo}
            {contagem[a.id] !== null ? <span className={cn("tabular-nums", a.id !== aba && "text-muted-foreground")}>{contagem[a.id]}</span> : null}
          </Button>
        ))}
      </nav>

      {aba === "consumo" ? (
        <section className="space-y-4">
          {podeLancar ? (
            <FormConsumo
              opId={op.id}
              lotes={lotes
                .filter((l) => !lotesNaOP.has(l.id))
                .map((l) => ({
                  id: l.id,
                  codigo: l.codigo,
                  saldoKg: l.saldoKg,
                  validade: paraDataIso(l.validade),
                  vencido: l.vencido,
                }))}
              podeLiberarVencido={podeExecutar(sessao.perfil, "producao:liberarVencido")}
            />
          ) : null}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lote</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Validade</TableHead>
                  <TableHead className="text-right">kg</TableHead>
                  <TableHead className="text-right">Custo/kg</TableHead>
                  <TableHead className="text-right">Custo</TableHead>
                  {podeLancar ? <TableHead /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {op.consumos.length === 0 ? <Vazio colunas={7} texto="Nenhum fruto consumido." /> : null}
                {op.consumos.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium whitespace-nowrap">
                      <LinkRastreio codigo={c.lote.codigo} />
                      {c.motivoLiberacaoVencido ? (
                        <p className="text-xs font-normal text-muted-foreground">
                          Vencido, liberado: {c.motivoLiberacaoVencido}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>{c.lote.produto.descricao}</TableCell>
                    <TableCell>{formatarData(c.lote.validade)}</TableCell>
                    <TableCell className="text-right tabular-nums">{KG.format(Number(c.quantidadeKg))}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatarMoeda(c.custoKg)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatarMoeda(Number(c.quantidadeKg) * Number(c.custoKg))}
                    </TableCell>
                    {podeLancar ? (
                      <TableCell>
                        <RemoverLinha tipo="consumo" linhaId={c.id} descricao={`o consumo do lote ${c.lote.codigo}`} />
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}

      {aba === "producao" ? (
        <section className="space-y-4">
          {podeLancar ? (
            <FormProducao
              opId={op.id}
              produtos={produtos.map((p) => ({ id: p.id, rotulo: `${p.codigo} · ${p.descricao}` }))}
              locais={locais}
            />
          ) : null}
          {aberta ? (
            <p className="text-xs text-muted-foreground">
              Cada linha cria um lote de polpa, bloqueado para venda e ajuste até a OP ser encerrada.
            </p>
          ) : null}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lote</TableHead>
                  <TableHead>Polpa</TableHead>
                  <TableHead className="text-right">kg</TableHead>
                  <TableHead className="text-right">Embalagens</TableHead>
                  <TableHead>Local</TableHead>
                  <TableHead>Validade</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {op.producoes.length === 0 ? <Vazio colunas={7} texto="Nenhuma polpa lançada." /> : null}
                {op.producoes.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium whitespace-nowrap">
                      <LinkRastreio codigo={p.lote.codigo} />
                    </TableCell>
                    <TableCell>{p.produto.descricao}</TableCell>
                    <TableCell className="text-right tabular-nums">{KG.format(Number(p.quantidadeKg))}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.embalagens ?? "—"}</TableCell>
                    <TableCell>{p.local.nome}</TableCell>
                    <TableCell>{formatarData(p.lote.validade)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        {encerrada ? (
                          <Button
                            variant="outline"
                            size="sm"
                            nativeButton={false}
                            render={<Link href={`/producao/lotes/${p.lote.id}/etiqueta`} target="_blank" />}
                          >
                            Etiqueta
                          </Button>
                        ) : null}
                        {podeLancar ? (
                          <RemoverLinha tipo="producao" linhaId={p.id} descricao={`o lote ${p.lote.codigo}`} />
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}

      {aba === "insumos" ? (
        <section className="space-y-4">
          {podeLancar ? (
            <FormInsumo
              opId={op.id}
              insumos={insumos.map((i) => ({ ...i, custoUnitario: Number(i.custoUnitario) }))}
            />
          ) : null}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Insumo</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead className="text-right">Custo unitário</TableHead>
                  <TableHead className="text-right">Custo</TableHead>
                  {podeLancar ? <TableHead /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {op.insumos.length === 0 ? <Vazio colunas={5} texto="Nenhum insumo lançado." /> : null}
                {op.insumos.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>{i.insumo.nome}</TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">
                      {KG.format(Number(i.quantidade))} {i.insumo.unidade}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatarMoeda(i.custoUnitario)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatarMoeda(Number(i.quantidade) * Number(i.custoUnitario))}
                    </TableCell>
                    {podeLancar ? (
                      <TableCell>
                        <RemoverLinha tipo="insumo" linhaId={i.id} descricao={`o insumo ${i.insumo.nome}`} />
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}

      {aba === "processo" ? (
        <section>
          {podeLancar ? (
            <ProcessoForm
              opId={op.id}
              exigeBranqueamento={op.fruta.exigeBranqueamento}
              minimos={{
                temperaturaMinC: configuracao.branqueamentoTemperaturaMinC,
                tempoMinS: configuracao.branqueamentoTempoMinS,
              }}
              valores={{
                branqueamentoTemperaturaC:
                  op.branqueamentoTemperaturaC === null ? null : Number(op.branqueamentoTemperaturaC),
                branqueamentoTempoS: op.branqueamentoTempoS,
                aguaLitros: Number(op.aguaLitros),
                carocoResiduoKg: Number(op.carocoResiduoKg),
                perdaKg: Number(op.perdaKg),
                observacao: op.observacao,
              }}
            />
          ) : (
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {op.fruta.exigeBranqueamento ? (
                <>
                  <Dado rotulo="Branqueamento (°C)">
                    {op.branqueamentoTemperaturaC === null ? "—" : Number(op.branqueamentoTemperaturaC)}
                  </Dado>
                  <Dado rotulo="Branqueamento (s)">{op.branqueamentoTempoS ?? "—"}</Dado>
                </>
              ) : null}
              <Dado rotulo="Água (L)">{KG.format(Number(op.aguaLitros))}</Dado>
              <Dado rotulo="Caroço/resíduo (kg)">{KG.format(Number(op.carocoResiduoKg))}</Dado>
              <Dado rotulo="Perda (kg)">{KG.format(Number(op.perdaKg))}</Dado>
              <div className="col-span-full">
                <Dado rotulo="Observação">{op.observacao ?? "—"}</Dado>
              </div>
            </dl>
          )}
        </section>
      ) : null}
    </div>
  );
}
