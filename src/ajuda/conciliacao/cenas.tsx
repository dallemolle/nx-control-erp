"use client";

import { CheckIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Alvo,
  BotaoSimulado,
  CampoSimulado,
  JanelaSimulada,
  SelectSimulado,
} from "@/components/ajuda/campos-simulados";
import type { PropsCena } from "@/ajuda/tipos";
import { cn } from "@/lib/utils";
import { CONTA, LANCAMENTOS_DO_DEPOSITO, LINHAS, OUTRA_LINHA_PROXIMA } from "./exemplo";

// Espelho de src/app/(dashboard)/financeiro/conciliacao/*. Mudou um rótulo ou campo lá? Ajuste aqui também.

function Status({ alvo, rotulo }: { alvo?: string; rotulo: string }) {
  const badge = <Badge variant={rotulo === "Conciliado" ? "default" : "secondary"}>{rotulo}</Badge>;
  return alvo ? (
    <Alvo nome={alvo} className="inline-flex p-1">
      {badge}
    </Alvo>
  ) : (
    badge
  );
}

export function CenaLista({ valores }: PropsCena) {
  const filtro = valores["lista.filtroStatus"];
  const linhas = [
    { id: "l1", status: "Conciliado" },
    { id: "l2", status: "Não conciliado" },
    { id: "l3", status: "Não conciliado" },
    { id: "l4", status: "Sugestão" },
  ] as const;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">Conciliação bancária</p>
          <p className="text-sm text-muted-foreground">
            Importe o extrato (OFX) e concilie com os lançamentos já registrados.
          </p>
        </div>
        <div className="flex items-start gap-2">
          <BotaoSimulado alvo="lista.reconciliar" variant="outline">
            Reconciliar pendentes
          </BotaoSimulado>
          <BotaoSimulado alvo="lista.importar" variant="outline">
            Importar extrato (OFX)
          </BotaoSimulado>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <SelectSimulado alvo="lista.filtroStatus" valor={filtro || "Todos os status"} className="w-56" />
        <Alvo nome="lista.exportar" className="flex flex-wrap gap-x-3 gap-y-1 p-1 text-sm text-primary">
          <span>Exportar CSV</span>
          <span>Exportar Excel</span>
          <span>Exportar PDF</span>
        </Alvo>
      </div>

      <Alvo nome="lista.tabela">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Conta</TableHead>
              <TableHead>Histórico</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas
              .filter((l) => !filtro || l.status === filtro)
              .map((l) => {
                const linha = LINHAS[l.id];
                return (
                  <TableRow key={l.id}>
                    <TableCell>{linha.data}</TableCell>
                    <TableCell>{CONTA}</TableCell>
                    <TableCell>{linha.historico}</TableCell>
                    <TableCell>{linha.valor}</TableCell>
                    <TableCell>
                      <Status alvo={l.id === "l3" ? undefined : `${l.id}.status`} rotulo={l.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <AcoesDaLinha id={l.id} valores={valores} />
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

function AcoesDaLinha({ id, valores }: { id: "l1" | "l2" | "l3" | "l4"; valores: PropsCena["valores"] }) {
  if (id === "l1") {
    return (
      <div className="flex flex-col items-end gap-1">
        <span className="text-sm text-muted-foreground">{LINHAS.l1.lancamento}</span>
        <BotaoSimulado alvo="l1.desconciliar" variant="outline" size="sm">
          Desconciliar
        </BotaoSimulado>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-end gap-2">
      {id === "l4" && (
        <div className="flex items-center gap-2">
          <SelectSimulado
            alvo="l4.selecionar"
            valor={valores["l4.selecionar"] ?? "Selecione o lançamento"}
            className="w-56"
          />
          <BotaoSimulado
            alvo="l4.confirmar"
            size="sm"
            className={valores["l4.selecionar"] ? undefined : "opacity-50"}
          >
            Confirmar
          </BotaoSimulado>
        </div>
      )}
      <BotaoSimulado alvo={id === "l2" ? "l2.grupo" : undefined} variant="outline" size="sm">
        Conciliar em grupo
      </BotaoSimulado>
      <BotaoSimulado alvo={id === "l3" ? "l3.criar" : undefined} variant="outline" size="sm">
        Criar lançamento
      </BotaoSimulado>
    </div>
  );
}

export function CenaImportar({ valores }: PropsCena) {
  if (valores["imp.resumo"] === "mostrar") {
    return (
      <JanelaSimulada titulo="Importar extrato (OFX)">
        <Alvo nome="imp.resumo" className="space-y-1 p-1 text-sm">
          <p>Total de linhas no arquivo: 24</p>
          <p>Linhas novas importadas: 24</p>
          <p>Linhas já importadas antes (ignoradas): 0</p>
          <p>Conciliadas automaticamente: 20</p>
        </Alvo>
        <BotaoSimulado largo>Fechar</BotaoSimulado>
      </JanelaSimulada>
    );
  }
  return (
    <JanelaSimulada titulo="Importar extrato (OFX)">
      <SelectSimulado alvo="imp.conta" rotulo="Conta bancária" valor={valores["imp.conta"] ?? "Selecione a conta"} />
      <CampoSimulado
        alvo="imp.arquivo"
        rotulo="Arquivo OFX"
        valor={valores["imp.arquivo"]}
        placeholder="Escolher arquivo — nenhum arquivo escolhido"
      />
      <BotaoSimulado alvo="imp.importar" largo className={valores["imp.arquivo"] ? undefined : "opacity-50"}>
        Importar e conciliar automaticamente
      </BotaoSimulado>
    </JanelaSimulada>
  );
}

export function CenaCriar({ valores }: PropsCena) {
  return (
    <JanelaSimulada titulo="Criar lançamento a partir desta linha">
      <CampoSimulado alvo="criar.descricao" rotulo="Descrição" valor={valores["criar.descricao"]} />
      <Alvo nome="criar.classificacao" className="grid grid-cols-2 gap-4 p-1">
        <SelectSimulado rotulo="Classificação" valor={valores["criar.classificacao"] ?? "Fiscal (com documento)"} />
        <SelectSimulado alvo="criar.comprovante" rotulo="Comprovante" valor={valores["criar.comprovante"] ?? "Nenhum"} />
      </Alvo>
      <SelectSimulado
        alvo="criar.categoria"
        rotulo="Categoria financeira"
        valor={valores["criar.categoria"] ?? "Nenhuma"}
      />
      <SelectSimulado rotulo="Centro de custo" valor="Nenhum" />
      <SelectSimulado rotulo="Centro de lucro" valor="Nenhum" />
      <SelectSimulado rotulo="Safra" valor="Nenhuma" />
      <SelectSimulado rotulo="Projeto" valor="Nenhum" />
      <BotaoSimulado alvo="criar.salvar" largo>
        Salvar
      </BotaoSimulado>
    </JanelaSimulada>
  );
}

function Item({
  data,
  descricao,
  valor,
  marcado,
  fixo,
}: {
  data: string;
  descricao: string;
  valor: string;
  marcado: boolean;
  fixo?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-1 text-sm">
      <span
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-sm border border-input",
          marcado && "border-primary bg-primary text-primary-foreground",
          fixo && "opacity-50",
        )}
      >
        {marcado && <CheckIcon className="size-3" />}
      </span>
      <span className="w-20 shrink-0 tabular-nums text-muted-foreground">{data}</span>
      <span className="min-w-0 flex-1 truncate">{descricao}</span>
      <span className="shrink-0 tabular-nums">{valor}</span>
    </div>
  );
}

export function CenaGrupo({ valores }: PropsCena) {
  const marcados = valores["grupo.lancamentos"] === "marcados";
  return (
    <JanelaSimulada titulo="Conciliar em grupo" className="max-w-2xl">
      <Alvo nome="grupo.linhas" className="space-y-1 p-1">
        <p className="text-sm font-medium">Linhas do extrato</p>
        <Item data={LINHAS.l2.data} descricao={LINHAS.l2.historico} valor={`+ ${LINHAS.l2.valor}`} marcado fixo />
        <Item {...OUTRA_LINHA_PROXIMA} marcado={false} />
      </Alvo>
      <Alvo nome="grupo.lancamentos" className="space-y-1 p-1">
        <p className="text-sm font-medium">Lançamentos</p>
        {LANCAMENTOS_DO_DEPOSITO.map((l, i) => (
          <Item key={i} {...l} marcado={marcados} />
        ))}
        <Item data="18/11/2026" descricao="Saque para o caixa — pagamento de diárias" valor="− R$ 2.000,00" marcado={false} />
      </Alvo>
      <Alvo nome="grupo.totais" className="space-y-1 rounded-md border p-3 text-sm tabular-nums">
        <p>
          Linhas: + {LINHAS.l2.valor} · Lançamentos: {marcados ? `+ ${LINHAS.l2.valor}` : "R$ 0,00"}
        </p>
        <p className={marcados ? "text-muted-foreground" : "font-medium"}>
          Diferença: {marcados ? "R$ 0,00" : `+ ${LINHAS.l2.valor}`}
        </p>
        {!marcados && (
          <div className="flex items-center gap-2 pt-1">
            <span className="size-4 rounded-sm border border-input" />
            Lançar a diferença (entrada de {LINHAS.l2.valor})
          </div>
        )}
      </Alvo>
      <div className="flex justify-end gap-2">
        <BotaoSimulado variant="outline">Cancelar</BotaoSimulado>
        <BotaoSimulado alvo="grupo.conciliar" className={marcados ? undefined : "opacity-50"}>
          Conciliar
        </BotaoSimulado>
      </div>
    </JanelaSimulada>
  );
}
