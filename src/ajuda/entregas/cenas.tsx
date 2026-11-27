"use client";

import type { StatusEntrega } from "@prisma/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Alvo,
  BotaoSimulado,
  CampoSimulado,
  JanelaSimulada,
  SelectSimulado,
} from "@/components/ajuda/campos-simulados";
import type { PropsCena, Valores } from "@/ajuda/tipos";
import { ROTULOS_STATUS_ENTREGA } from "@/lib/schemas/enums";
import { atrasoEntregaDias } from "@/lib/producao/venda";
import { cn } from "@/lib/utils";
import { ENTREGAS, HOJE, MOTORISTA, type EntregaExemplo } from "./exemplo";

// Espelho de src/app/(dashboard)/vendas/entregas/page.tsx e de vendas/_shared/entrega-acoes.tsx. Mudou um rótulo,
// campo ou coluna lá? Ajuste aqui também.

/** "DD/MM/AAAA" → data de calendário em UTC. */
export const deData = (texto: string) => {
  const [dia, mes, ano] = texto.split("/");
  return new Date(`${ano}-${mes}-${dia}T00:00:00.000Z`);
};

const STATUS_DO_ROTULO: Readonly<Record<string, StatusEntrega>> = {
  Pendente: "PENDENTE",
  "Em rota": "EM_ROTA",
  Entregue: "ENTREGUE",
};

/** As entregas no ponto do roteiro: o 131 com o status, o responsável e quem recebeu já lançados. */
export function entregasDoRoteiro(valores: Valores): EntregaExemplo[] {
  const hoje = valores["lista.tabela"] ?? HOJE;
  const status = STATUS_DO_ROTULO[valores["lista.situacao"] ?? ""] ?? "EM_ROTA";
  return ENTREGAS.map((e) => {
    if (e.pedido !== 131) return e;
    const entregue = status === "ENTREGUE";
    return {
      ...e,
      status,
      responsavel: valores["editar.responsavel"] ?? (status === "PENDENTE" ? null : MOTORISTA),
      entregueEm: entregue ? (valores["entregue.data"] ?? hoje) : null,
      recebidoPor: entregue ? (valores["entregue.recebido"] ?? null) : null,
    };
  });
}

export const atrasoDe = (e: EntregaExemplo, hoje: string) =>
  atrasoEntregaDias(
    { status: e.status, dataPrevista: deData(e.prevista), dataRealizada: e.entregueEm ? deData(e.entregueEm) : null },
    deData(hoje),
  );

function filtrar(entregas: EntregaExemplo[], valores: Valores, hoje: string) {
  const status = valores["lista.status"];
  const aceitos: readonly StatusEntrega[] =
    !status || status === "Pendentes e em rota"
      ? ["PENDENTE", "EM_ROTA"]
      : status === "Todas"
        ? ["PENDENTE", "EM_ROTA", "ENTREGUE", "CANCELADA"]
        : [status === "Cancelada" ? "CANCELADA" : STATUS_DO_ROTULO[status]];
  const atrasadas = valores["lista.atrasadas"] === "sim";
  return entregas.filter((e) => aceitos.includes(e.status) && (!atrasadas || (atrasoDe(e, hoje) ?? 0) > 0));
}

function Atraso({ atraso }: { atraso: number | null }) {
  if (atraso === null) return <>—</>;
  return atraso > 0 ? <span className="font-medium text-destructive">{atraso} d</span> : <>0</>;
}

function Acoes({ e }: { e: EntregaExemplo }) {
  if (e.status === "CANCELADA") return null;
  const do131 = e.pedido === 131;
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {e.status === "PENDENTE" ? (
        <BotaoSimulado alvo={do131 ? "lista.emRota" : undefined} variant="outline" size="sm">
          Em rota
        </BotaoSimulado>
      ) : null}
      {e.status !== "ENTREGUE" ? (
        <BotaoSimulado alvo={do131 ? "lista.entregue" : undefined} variant="outline" size="sm">
          Entregue
        </BotaoSimulado>
      ) : (
        <BotaoSimulado variant="outline" size="sm">
          Desfazer entrega
        </BotaoSimulado>
      )}
      <BotaoSimulado alvo={do131 ? "lista.editar" : undefined} variant="outline" size="sm">
        Editar
      </BotaoSimulado>
    </div>
  );
}

export function CenaLista({ valores }: PropsCena) {
  const hoje = valores["lista.tabela"] ?? HOJE;
  const linhas = filtrar(entregasDoRoteiro(valores), valores, hoje);
  const atrasadas = valores["lista.atrasadas"] === "sim";
  return (
    <div className="space-y-6">
      <div>
        <p className="text-lg font-semibold">Entregas</p>
        <p className="text-sm text-muted-foreground">
          Pedidos que não são retirados na propriedade. O atraso conta a partir da data prevista.
        </p>
      </div>

      <Alvo nome="lista.filtros" className="flex flex-wrap items-end gap-3 p-1">
        <SelectSimulado
          compacto
          alvo="lista.status"
          rotulo="Status"
          valor={valores["lista.status"] ?? "Pendentes e em rota"}
          className="w-48"
        />
        <Alvo nome="lista.periodo" className="flex flex-wrap items-end gap-3">
          <CampoSimulado compacto rotulo="Prevista de" placeholder="dd/mm/aaaa" className="w-36" />
          <CampoSimulado compacto rotulo="Até" placeholder="dd/mm/aaaa" className="w-36" />
        </Alvo>
        <Alvo nome="lista.atrasadas" className="flex h-8 items-center gap-2 px-1 text-sm">
          <span
            className={cn(
              "flex size-4 items-center justify-center rounded-sm border border-input text-[10px]",
              atrasadas && "border-primary bg-primary text-primary-foreground",
            )}
          >
            {atrasadas ? "✓" : ""}
          </span>
          Só atrasadas
        </Alvo>
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
              <TableHead>Prevista</TableHead>
              <TableHead>Pedido</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Endereço</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Atraso</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma entrega com esses filtros.
                </TableCell>
              </TableRow>
            ) : null}
            {linhas.map((e) => {
              const atraso = <Atraso atraso={atrasoDe(e, hoje)} />;
              const status = ROTULOS_STATUS_ENTREGA[e.status];
              return (
                <TableRow key={e.pedido}>
                  <TableCell className="whitespace-nowrap">{e.prevista}</TableCell>
                  <TableCell>
                    {e.pedido === 131 ? (
                      <Alvo nome="lista.pedido" className="inline-block px-1 text-primary">
                        {e.pedido}
                      </Alvo>
                    ) : (
                      <span className="text-primary">{e.pedido}</span>
                    )}
                  </TableCell>
                  <TableCell>{e.cliente}</TableCell>
                  <TableCell>{e.endereco}</TableCell>
                  <TableCell>{e.responsavel ?? "—"}</TableCell>
                  <TableCell>
                    {e.pedido === 131 ? (
                      <Alvo nome="lista.situacao" className="inline-block px-1">
                        {status}
                      </Alvo>
                    ) : (
                      status
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {e.pedido === 131 ? (
                      <Alvo nome="lista.atraso" className="inline-block px-1">
                        {atraso}
                      </Alvo>
                    ) : e.pedido === 128 ? (
                      <Alvo nome="lista.atrasoEntregue" className="inline-block px-1">
                        {atraso}
                      </Alvo>
                    ) : (
                      <Alvo nome="lista.cancelada" className="inline-block px-1">
                        {atraso}
                      </Alvo>
                    )}
                  </TableCell>
                  <TableCell>
                    <Acoes e={e} />
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

export function CenaEditar({ valores }: PropsCena) {
  const e131 = ENTREGAS.find((e) => e.pedido === 131)!;
  return (
    <JanelaSimulada titulo="Entrega do pedido 131">
      <CampoSimulado alvo="editar.data" rotulo="Data prevista" valor={valores["editar.data"] ?? e131.prevista} />
      <CampoSimulado alvo="editar.endereco" rotulo="Endereço" valor={e131.endereco} />
      <CampoSimulado alvo="editar.responsavel" rotulo="Responsável" valor={valores["editar.responsavel"]} />
      <CampoSimulado alvo="editar.observacao" rotulo="Observação" valor={valores["editar.observacao"]} />
      <BotaoSimulado alvo="editar.salvar" largo>
        Salvar
      </BotaoSimulado>
    </JanelaSimulada>
  );
}

export function CenaEntregue({ valores }: PropsCena) {
  return (
    <JanelaSimulada titulo="Entrega do pedido 131">
      <CampoSimulado
        alvo="entregue.data"
        rotulo="Entregue em"
        valor={valores["entregue.data"] ?? valores["lista.tabela"] ?? HOJE}
      />
      <CampoSimulado alvo="entregue.recebido" rotulo="Recebido por" valor={valores["entregue.recebido"]} />
      <BotaoSimulado alvo="entregue.confirmar" largo>
        Confirmar entrega
      </BotaoSimulado>
    </JanelaSimulada>
  );
}
