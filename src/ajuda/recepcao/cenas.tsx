"use client";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Alvo,
  BotaoSimulado,
  CampoSimulado,
  JanelaSimulada,
  SelectSimulado,
} from "@/components/ajuda/campos-simulados";
import type { PropsCena } from "@/ajuda/tipos";
import { formatarMoeda } from "@/lib/formatacao";
import { cn } from "@/lib/utils";
import { COLHEITA, COMPRA, LOCAL, RASA_KG, RECEPCOES } from "./exemplo";

// Espelho de src/app/(dashboard)/producao/recepcao/*. Mudou um rótulo, campo ou coluna lá? Ajuste aqui também.

export const ORIGEM_TERCEIRO = "Comprado de terceiro";
export const ORIGEM_PROPRIA = "Colhido nos talhões próprios";

/** Rádios imitando os da tela (marcado = valor atual). */
function RadiosSimulados({
  alvo,
  rotulo,
  opcoes,
  marcado,
}: {
  alvo: string;
  rotulo?: string;
  opcoes: readonly string[];
  marcado: string;
}) {
  return (
    <Alvo nome={alvo} className="flex flex-wrap gap-4 p-1 text-sm">
      {rotulo ? <span className="text-muted-foreground">{rotulo}</span> : null}
      {opcoes.map((opcao) => (
        <span key={opcao} className="flex items-center gap-2">
          <span
            className={cn(
              "flex size-4 items-center justify-center rounded-full border border-input",
              opcao === marcado && "border-primary",
            )}
          >
            {opcao === marcado ? <span className="size-2 rounded-full bg-primary" /> : null}
          </span>
          {opcao}
        </span>
      ))}
    </Alvo>
  );
}

function LinhaResumo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="font-medium tabular-nums">{valor}</dd>
    </div>
  );
}

export function CenaLista({ valores }: PropsCena) {
  const criado = valores["lista.criado"];
  const origem = valores["lista.origem"];
  const linhas = RECEPCOES.filter((r) => !origem || r.origem === origem);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">Recepção de fruto</p>
          <p className="text-sm text-muted-foreground">
            Cada carga recebida vira um lote com número, validade e entrada no estoque.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {criado ? (
            <Alvo nome="lista.criado" className="p-1">
              <p className="text-sm">
                Lote <span className="font-semibold">{criado}</span> criado ·{" "}
                <span className="text-primary">Imprimir etiqueta</span>
              </p>
            </Alvo>
          ) : null}
          <BotaoSimulado alvo="lista.nova">Nova recepção</BotaoSimulado>
        </div>
      </div>

      <Alvo nome="lista.filtros" className="flex flex-wrap items-end gap-3 p-1">
        <CampoSimulado compacto rotulo="De" valor="01/11/2026" className="w-40" />
        <CampoSimulado compacto rotulo="Até" valor="30/11/2026" className="w-40" />
        <SelectSimulado compacto rotulo="Fruta" valor="Todas" className="w-48" />
        <SelectSimulado compacto alvo="lista.origem" rotulo="Origem" valor={origem ?? "Todas"} className="w-48" />
        <BotaoSimulado variant="ghost" size="sm">
          Limpar filtros
        </BotaoSimulado>
      </Alvo>
      <Alvo nome="lista.exportar" className="flex flex-wrap gap-x-3 gap-y-1 p-1 text-sm text-primary">
        <span>Exportar CSV</span>
        <span>Exportar Excel</span>
        <span>Exportar PDF</span>
      </Alvo>

      <Alvo nome="lista.tabela" className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Lote</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead className="text-right">Bruto (kg)</TableHead>
              <TableHead className="text-right">Descarte</TableHead>
              <TableHead className="text-right">Líquido (kg)</TableHead>
              <TableHead className="text-right">R$/kg</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Qualidade</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((r) => {
              const daCompra = r.lote === COMPRA.lote;
              const codigo = (
                <span className="underline decoration-dotted underline-offset-4">{r.lote}</span>
              );
              return (
                <TableRow key={r.lote} className={r.excluida ? "text-muted-foreground" : undefined}>
                  <TableCell>{r.data}</TableCell>
                  <TableCell className="font-medium whitespace-nowrap">
                    {daCompra ? (
                      <Alvo nome="lista.lote" className="inline-block px-1">
                        {codigo}
                      </Alvo>
                    ) : (
                      codigo
                    )}
                    {r.excluida ? (
                      <Alvo nome="lista.excluida" className="ml-2 inline-block">
                        <Badge variant="destructive">Excluída</Badge>
                      </Alvo>
                    ) : null}
                  </TableCell>
                  <TableCell>{r.produto}</TableCell>
                  <TableCell>
                    {r.origem} · {r.quem}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.brutoKg}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.descarte}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.liquidoKg}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatarMoeda(r.precoKg)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatarMoeda(r.valor)}</TableCell>
                  <TableCell>{r.qualidade}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <BotaoSimulado alvo={daCompra ? "lista.etiqueta" : undefined} variant="outline" size="sm">
                        Etiqueta
                      </BotaoSimulado>
                      {r.excluida ? null : (
                        <>
                          <BotaoSimulado alvo={daCompra ? "lista.editar" : undefined} variant="outline" size="sm">
                            Editar
                          </BotaoSimulado>
                          {r.bloqueio ? (
                            <Alvo nome="lista.bloqueado" className="inline-flex">
                              <span title={r.bloqueio}>
                                <BotaoSimulado variant="outline" size="sm" className="pointer-events-none opacity-50">
                                  Excluir
                                </BotaoSimulado>
                              </span>
                            </Alvo>
                          ) : (
                            <BotaoSimulado alvo={daCompra ? "lista.excluir" : undefined} variant="outline" size="sm">
                              Excluir
                            </BotaoSimulado>
                          )}
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Alvo>
    </div>
  );
}

export function CenaNova({ valores }: PropsCena) {
  const propria = valores["nova.origem"] === ORIGEM_PROPRIA;
  const produto = valores["nova.produto"];
  const emRasa = valores["nova.unidade"] === "rasa";
  const unidade = emRasa ? "rasa" : "kg";
  const calculado = valores["nova.resumo"] === "calculado";
  const exemplo = propria ? COLHEITA : COMPRA;
  return (
    <JanelaSimulada titulo="Nova recepção de fruto" className="max-w-2xl">
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoSimulado alvo="nova.data" rotulo="Data" valor={valores["nova.data"] ?? COMPRA.data} />
        <SelectSimulado alvo="nova.produto" rotulo="Produto" valor={produto ?? "Selecione o fruto"} />
      </div>

      <RadiosSimulados
        alvo="nova.origem"
        opcoes={[ORIGEM_TERCEIRO, ORIGEM_PROPRIA]}
        marcado={propria ? ORIGEM_PROPRIA : ORIGEM_TERCEIRO}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {propria ? (
          <SelectSimulado
            alvo="nova.talhao"
            rotulo="Talhão"
            valor={valores["nova.talhao"] ?? (produto ? "Selecione o talhão" : "Escolha o produto antes")}
          />
        ) : (
          <SelectSimulado
            alvo="nova.fornecedor"
            rotulo="Fornecedor"
            valor={valores["nova.fornecedor"] ?? "Selecione o fornecedor"}
          />
        )}
        <SelectSimulado alvo="nova.local" rotulo="Local" valor={LOCAL} />
      </div>

      {produto ? (
        <RadiosSimulados
          alvo="nova.unidade"
          rotulo="Lançar em"
          opcoes={[`rasa (${RASA_KG} kg)`, "kg"]}
          marcado={emRasa ? `rasa (${RASA_KG} kg)` : "kg"}
        />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <CampoSimulado alvo="nova.bruto" rotulo={`Peso bruto (${unidade})`} valor={valores["nova.bruto"]} />
        <CampoSimulado alvo="nova.descarte" rotulo={`Descarte (${unidade})`} valor={valores["nova.descarte"]} />
        {propria ? null : (
          <CampoSimulado alvo="nova.preco" rotulo={`Preço (R$/${unidade})`} valor={valores["nova.preco"]} />
        )}
      </div>

      <Alvo nome="nova.resumo">
        <dl className="space-y-1 rounded-lg border bg-muted/40 p-3 text-sm">
          <LinhaResumo rotulo="Peso líquido" valor={calculado ? exemplo.liquidoKg : "—"} />
          <LinhaResumo rotulo="Descarte" valor={calculado ? exemplo.percentualDescarte : "—"} />
          <LinhaResumo
            rotulo={propria ? "Custo/kg (custo-padrão da fruta)" : "Preço/kg"}
            valor={calculado ? formatarMoeda(propria ? COLHEITA.custoPadraoKg : COMPRA.precoKg) : "—"}
          />
          <LinhaResumo
            rotulo={propria ? "Valor (custo, sem conta a pagar)" : "Valor a pagar"}
            valor={calculado ? formatarMoeda(exemplo.valor) : "—"}
          />
          <LinhaResumo rotulo="Validade" valor={produto ? COMPRA.validade : "—"} />
          <p className="pt-1 text-xs text-muted-foreground">O número do lote é gerado ao salvar.</p>
        </dl>
      </Alvo>

      {propria ? null : (
        <Alvo nome="nova.contaAPagar" className="space-y-4">
          <Separator />
          <p className="text-sm font-medium">Conta a pagar</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <CampoSimulado
              alvo="nova.vencimento"
              rotulo="Vencimento"
              valor={valores["nova.vencimento"] ?? COMPRA.vencimento}
            />
            <SelectSimulado
              alvo="nova.classificacao"
              rotulo="Classificação"
              valor={valores["nova.classificacao"] ?? "Gerencial (sem nota)"}
            />
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            A conta a pagar só é criada quando o valor é maior que zero.
          </p>
        </Alvo>
      )}

      <Separator />
      <Alvo nome="nova.complementos" className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectSimulado
            alvo="nova.qualidade"
            rotulo="Qualidade"
            valor={valores["nova.qualidade"] ?? "Não informada"}
          />
          <CampoSimulado alvo="nova.documento" rotulo="Romaneio / NF" valor={valores["nova.documento"]} />
          <SelectSimulado alvo="nova.safra" rotulo="Safra" valor={valores["nova.safra"] ?? "Nenhuma"} />
        </div>
        <CampoSimulado rotulo="Observação" />
      </Alvo>
      <BotaoSimulado alvo="nova.salvar" largo>
        Salvar recepção
      </BotaoSimulado>
    </JanelaSimulada>
  );
}

export function CenaEditar({ valores }: PropsCena) {
  return (
    <JanelaSimulada titulo={`Editar recepção ${COMPRA.lote}`}>
      <p className="text-sm text-muted-foreground">
        Peso, preço, produto e origem não mudam aqui. Para corrigi-los, exclua a recepção e lance de novo.
      </p>
      <Alvo nome="editar.campos" className="space-y-4">
        <SelectSimulado
          alvo="editar.qualidade"
          rotulo="Qualidade"
          valor={valores["editar.qualidade"] ?? COMPRA.qualidade}
        />
        <CampoSimulado rotulo="Romaneio / NF" valor={COMPRA.documento} />
        <CampoSimulado rotulo="Observação" valor={valores["editar.observacao"]} />
      </Alvo>
      <BotaoSimulado alvo="editar.salvar" largo>
        Salvar
      </BotaoSimulado>
    </JanelaSimulada>
  );
}

export function CenaExcluir({ valores }: PropsCena) {
  return (
    <JanelaSimulada titulo={`Excluir recepção ${COMPRA.lote}`}>
      <Alvo nome="excluir.aviso" className="p-1">
        <p className="text-sm text-muted-foreground">
          O lote fica zerado (o número não é reaproveitado) e a conta a pagar, se houver, é cancelada.
        </p>
      </Alvo>
      <CampoSimulado alvo="excluir.motivo" rotulo="Motivo" valor={valores["excluir.motivo"]} />
      <BotaoSimulado alvo="excluir.confirmar" variant="destructive" largo>
        Excluir recepção
      </BotaoSimulado>
    </JanelaSimulada>
  );
}
