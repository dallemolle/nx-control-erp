"use client";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Alvo,
  BotaoSimulado,
  CampoSimulado,
  JanelaSimulada,
  SelectSimulado,
} from "@/components/ajuda/campos-simulados";
import type { PropsCena, Valores } from "@/ajuda/tipos";
import { cn } from "@/lib/utils";
import {
  AMOSTRA,
  ESTORNO,
  HISTORICO,
  HOJE,
  KG_SALDO,
  LOTES_OPCOES,
  SOBRA,
  USUARIO,
  rotuloLote,
  type LinhaAjuste,
} from "./exemplo";

// Espelho de src/app/(dashboard)/producao/ajustes/*. Mudou um rótulo, campo ou coluna lá? Ajuste aqui também.

const KG = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
  signDisplay: "exceptZero",
});

/** Valor especial de `novo.lote` que mostra a lista do seletor aberta. */
export const LISTA_ABERTA = "lista";

/** Lotes oferecidos no formulário: saída só com saldo; entrada (sobra de inventário) também zerados. */
export function lotesDoSentido(sentido: "SAIDA" | "ENTRADA") {
  return sentido === "SAIDA" ? LOTES_OPCOES.filter((l) => l.saldoKg > 0) : LOTES_OPCOES;
}

/** A lista como a tela mostraria: o que o roteiro lançou, mais o histórico, filtrada pelo motivo. */
export function ajustesDaCena(valores: Valores): LinhaAjuste[] {
  const linha = (a: typeof AMOSTRA | typeof SOBRA, kg: number): LinhaAjuste => ({
    data: HOJE,
    lote: a.lote,
    produto: a.produto,
    kg,
    motivo: a.motivo,
    observacao: a.observacao,
    usuario: USUARIO,
  });
  // O lançado por último aparece primeiro (mesma data, ordem de criação decrescente).
  const amostra = valores["lista.amostra"];
  const novos: LinhaAjuste[] = [
    ...(valores["lista.sobra"] === "lancado" ? [linha(SOBRA, SOBRA.kg)] : []),
    ...(amostra === "lancado" ? [linha(AMOSTRA, -AMOSTRA.kg)] : []),
    ...(amostra === "estornado"
      ? [{ ...linha(AMOSTRA, -AMOSTRA.kg), estorno: `${HOJE} por ${USUARIO}: ${ESTORNO.motivo}` }]
      : []),
  ];
  const motivo = valores["lista.motivo"];
  return [...novos, ...HISTORICO].filter((a) => !motivo || a.motivo === motivo);
}

export function CenaLista({ valores }: PropsCena) {
  const ajustes = ajustesDaCena(valores);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">Ajustes de estoque</p>
          <p className="text-sm text-muted-foreground">
            Baixas por vencimento, avaria, amostra ou consumo, e acertos de inventário.
          </p>
        </div>
        <BotaoSimulado alvo="lista.novo">Novo ajuste</BotaoSimulado>
      </div>

      <Alvo nome="lista.filtros" className="flex flex-wrap items-end gap-3 p-1">
        <CampoSimulado compacto rotulo="De" valor="01/11/2026" className="w-40" />
        <CampoSimulado compacto rotulo="Até" valor="30/11/2026" className="w-40" />
        <SelectSimulado
          compacto
          alvo="lista.motivo"
          rotulo="Motivo"
          valor={valores["lista.motivo"] ?? "Todos"}
          className="w-56"
        />
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
              <TableHead className="text-right">Quantidade (kg)</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead>Observação</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ajustes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum ajuste no período.
                </TableCell>
              </TableRow>
            ) : null}
            {ajustes.map((a) => {
              const alvo =
                a.data === HOJE && a.lote === AMOSTRA.lote
                  ? "lista.amostra"
                  : a.data === HOJE && a.lote === SOBRA.lote
                    ? "lista.sobra"
                    : null;
              const quantidade = KG.format(a.kg);
              return (
                <TableRow key={`${a.data}-${a.lote}`} className={cn(a.estorno && "text-muted-foreground")}>
                  <TableCell>{a.data}</TableCell>
                  <TableCell className="font-medium whitespace-nowrap">{a.lote}</TableCell>
                  <TableCell>{a.produto}</TableCell>
                  <TableCell
                    className={cn("text-right tabular-nums", a.estorno ? "line-through" : a.kg < 0 && "text-destructive")}
                  >
                    {alvo ? (
                      <Alvo nome={alvo} className="inline-block px-1">
                        {quantidade}
                      </Alvo>
                    ) : (
                      quantidade
                    )}
                  </TableCell>
                  <TableCell>
                    {a.motivo}
                    {a.estorno ? (
                      <div className="mt-1 space-y-0.5">
                        <Badge variant="outline">Estornado</Badge>
                        <p className="text-xs">{a.estorno}</p>
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>{a.observacao ?? "—"}</TableCell>
                  <TableCell>{a.usuario}</TableCell>
                  <TableCell className="text-right">
                    {a.estorno ? null : (
                      <BotaoSimulado
                        alvo={alvo === "lista.amostra" ? "lista.estornar" : undefined}
                        variant="outline"
                        size="sm"
                      >
                        Estornar
                      </BotaoSimulado>
                    )}
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

function Radio({ marcado, children }: { marcado: boolean; children: string }) {
  return (
    <span className="flex items-center gap-2">
      <span
        className={cn(
          "flex size-4 items-center justify-center rounded-full border border-input",
          marcado && "border-primary",
        )}
      >
        {marcado ? <span className="size-2 rounded-full bg-primary" /> : null}
      </span>
      {children}
    </span>
  );
}

export function CenaNovo({ valores }: PropsCena) {
  const sentido = valores["novo.sentido"] === "entrada" ? "ENTRADA" : "SAIDA";
  const lote = valores["novo.lote"];
  const listaAberta = lote === LISTA_ABERTA;
  return (
    <JanelaSimulada titulo="Novo ajuste de estoque" className="max-w-md">
      <Alvo nome="novo.sentido" className="flex flex-wrap gap-4 p-1 text-sm">
        <Radio marcado={sentido === "SAIDA"}>Saída (baixa do estoque)</Radio>
        <Radio marcado={sentido === "ENTRADA"}>Entrada (sobra de inventário)</Radio>
      </Alvo>
      <Alvo nome="novo.lote" className="space-y-2">
        <SelectSimulado rotulo="Lote" valor={!lote || listaAberta ? "Selecione o lote" : lote} />
        {listaAberta ? (
          <div className="rounded-lg border bg-popover p-1 text-sm shadow-md">
            {lotesDoSentido(sentido).map((l) => (
              <p key={l.codigo} className="rounded-md px-2 py-1">
                {rotuloLote(l)}
              </p>
            ))}
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">Em ordem de validade: o primeiro vence antes.</p>
      </Alvo>
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoSimulado alvo="novo.kg" rotulo="Quantidade (kg)" valor={valores["novo.kg"]} />
        <CampoSimulado alvo="novo.data" rotulo="Data" valor={valores["novo.data"] ?? HOJE} />
      </div>
      <SelectSimulado
        alvo="novo.motivo"
        rotulo="Motivo"
        valor={valores["novo.motivo"] ?? (sentido === "ENTRADA" ? "Inventário" : "Avaria/quebra")}
      />
      <CampoSimulado alvo="novo.observacao" rotulo="Observação" valor={valores["novo.observacao"]} />
      <BotaoSimulado alvo="novo.salvar" largo>
        Salvar ajuste
      </BotaoSimulado>
    </JanelaSimulada>
  );
}

export function CenaEstornar({ valores }: PropsCena) {
  return (
    <JanelaSimulada titulo={`Estornar ajuste do lote ${AMOSTRA.lote}`} className="max-w-md">
      <Alvo nome="estornar.aviso" className="p-1">
        <p className="text-sm text-muted-foreground">
          Saída de {KG_SALDO.format(AMOSTRA.kg)} kg em {HOJE} ({AMOSTRA.motivo}). O estorno desfaz o ajuste na data dele:
          o saldo volta como se ele não tivesse sido lançado, e ele sai dos totais por motivo. A linha continua na
          lista, marcada como estornada.
        </p>
      </Alvo>
      <CampoSimulado alvo="estornar.motivo" rotulo="Motivo" valor={valores["estornar.motivo"]} />
      <BotaoSimulado alvo="estornar.confirmar" variant="destructive" largo>
        Estornar ajuste
      </BotaoSimulado>
    </JanelaSimulada>
  );
}
