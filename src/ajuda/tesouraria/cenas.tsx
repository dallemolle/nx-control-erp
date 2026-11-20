"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Alvo,
  BotaoSimulado,
  CampoSimulado,
  JanelaSimulada,
  SelectSimulado,
} from "@/components/ajuda/campos-simulados";
import type { PropsCena } from "@/ajuda/tipos";
import { BANCO, CAIXA, LANCAMENTOS, SALDO } from "./exemplo";

// Espelho de src/app/(dashboard)/financeiro/tesouraria/*. Mudou um rótulo ou campo lá? Ajuste aqui também.

export function CenaPainel({ valores }: PropsCena) {
  const informouBanco = valores["painel.cardBanco"] === "informado";
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">Tesouraria</p>
          <p className="text-sm text-muted-foreground">Lançamentos bancários e saldo das contas da filial ativa.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <BotaoSimulado alvo="painel.novoLancamento" variant="outline" size="sm">
            Novo lançamento
          </BotaoSimulado>
          <BotaoSimulado alvo="painel.transferencia" variant="outline" size="sm">
            Transferência entre contas
          </BotaoSimulado>
          <BotaoSimulado alvo="painel.informarSaldo" variant="outline" size="sm">
            Informar saldo bancário
          </BotaoSimulado>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Alvo nome="painel.cardBanco">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">{BANCO}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>
                Saldo contábil: <span className="font-medium">{SALDO.contabilBanco}</span>
              </p>
              {informouBanco ? (
                <>
                  <p className="text-muted-foreground">
                    Saldo bancário informado: {SALDO.informadoBancoFormatado} em {SALDO.dataInformadoBanco}
                  </p>
                  <Alvo nome="painel.diferencaBanco" className="inline-block p-1">
                    <p className="text-destructive">Diferença: {SALDO.diferencaBanco}</p>
                  </Alvo>
                </>
              ) : (
                <p className="text-muted-foreground">Nenhum saldo bancário informado ainda.</p>
              )}
            </CardContent>
          </Card>
        </Alvo>
        <Alvo nome="painel.cardCaixa">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">{CAIXA}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>
                Saldo contábil: <span className="font-medium">{SALDO.contabilCaixa}</span>
              </p>
              <p className="text-muted-foreground">
                Saldo bancário informado: {SALDO.informadoCaixa} em {SALDO.dataInformadoCaixa}
              </p>
              <p className="text-muted-foreground">Diferença: R$ 0,00</p>
            </CardContent>
          </Card>
        </Alvo>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium">Lançamentos</p>
        <div className="flex flex-wrap items-center gap-4">
          <Alvo nome="painel.exportar" className="flex flex-wrap gap-x-3 gap-y-1 p-1 text-sm text-primary">
            <span>Exportar CSV</span>
            <span>Exportar Excel</span>
            <span>Exportar PDF</span>
          </Alvo>
          <SelectSimulado
            alvo="painel.classificacao"
            valor={valores["painel.classificacao"] || "Todos"}
            className="w-40"
          />
        </div>
      </div>

      <Alvo nome="painel.tabela">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Conta</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>
                <Alvo nome="painel.origem" className="inline-block px-1">
                  Origem
                </Alvo>
              </TableHead>
              <TableHead>Classificação</TableHead>
              <TableHead>Descrição</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {LANCAMENTOS.filter(
              (l) =>
                !valores["painel.classificacao"] ||
                ("classificacao" in l && l.classificacao === valores["painel.classificacao"]),
            ).map((l, i) => (
              <TableRow key={i}>
                <TableCell>{l.data}</TableCell>
                <TableCell>{l.conta}</TableCell>
                <TableCell>
                  <Badge variant={l.tipo === "Entrada" ? "default" : "secondary"}>{l.tipo}</Badge>
                </TableCell>
                <TableCell>{l.valor}</TableCell>
                <TableCell>
                  <Badge variant="outline">{l.origem}</Badge>
                </TableCell>
                <TableCell>
                  {"classificacao" in l ? (
                    <Badge variant={l.classificacao === "Fiscal" ? "outline" : "secondary"}>{l.classificacao}</Badge>
                  ) : null}
                  {"comprovante" in l ? (
                    <span className="ml-2 text-xs text-muted-foreground">{l.comprovante}</span>
                  ) : null}
                </TableCell>
                <TableCell>{l.descricao}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Alvo>
    </div>
  );
}

export function CenaLancamento({ valores }: PropsCena) {
  return (
    <JanelaSimulada titulo="Novo lançamento">
      <SelectSimulado alvo="lanc.conta" rotulo="Conta bancária" valor={valores["lanc.conta"] ?? "Selecione a conta"} />
      <div className="grid grid-cols-2 gap-4">
        <SelectSimulado alvo="lanc.tipo" rotulo="Tipo" valor={valores["lanc.tipo"] ?? "Entrada"} />
        <CampoSimulado alvo="lanc.valor" rotulo="Valor" valor={valores["lanc.valor"]} />
      </div>
      <CampoSimulado alvo="lanc.data" rotulo="Data" valor={valores["lanc.data"]} placeholder="dd/mm/aaaa" />
      <CampoSimulado alvo="lanc.descricao" rotulo="Descrição" valor={valores["lanc.descricao"]} />
      <div className="grid grid-cols-2 gap-4">
        <SelectSimulado
          alvo="lanc.classificacao"
          rotulo="Classificação"
          valor={valores["lanc.classificacao"] ?? "Fiscal (com documento)"}
        />
        <SelectSimulado alvo="lanc.comprovante" rotulo="Comprovante" valor={valores["lanc.comprovante"] ?? "Nenhum"} />
      </div>
      <CampoSimulado alvo="lanc.numero" rotulo="Nº do comprovante" valor={valores["lanc.numero"]} placeholder="Opcional" />
      <SelectSimulado
        alvo="lanc.categoria"
        rotulo="Categoria financeira"
        valor={valores["lanc.categoria"] ?? "Nenhuma"}
      />
      <SelectSimulado alvo="lanc.centroCusto" rotulo="Centro de custo" valor={valores["lanc.centroCusto"] ?? "Nenhum"} />
      <SelectSimulado rotulo="Centro de lucro" valor="Nenhum" />
      <SelectSimulado rotulo="Safra" valor="Nenhuma" />
      <SelectSimulado rotulo="Projeto" valor="Nenhum" />
      <BotaoSimulado alvo="lanc.salvar" largo>
        Salvar
      </BotaoSimulado>
    </JanelaSimulada>
  );
}

export function CenaTransferencia({ valores }: PropsCena) {
  return (
    <JanelaSimulada titulo="Transferência entre contas">
      <SelectSimulado
        alvo="transf.origem"
        rotulo="Conta de origem"
        valor={valores["transf.origem"] ?? "Selecione a conta de origem"}
      />
      <SelectSimulado
        alvo="transf.destino"
        rotulo="Conta de destino"
        valor={valores["transf.destino"] ?? "Selecione a conta de destino"}
      />
      <div className="grid grid-cols-2 gap-4">
        <CampoSimulado alvo="transf.data" rotulo="Data" valor={valores["transf.data"]} placeholder="dd/mm/aaaa" />
        <CampoSimulado alvo="transf.valor" rotulo="Valor" valor={valores["transf.valor"]} />
      </div>
      <CampoSimulado alvo="transf.descricao" rotulo="Descrição" valor={valores["transf.descricao"]} />
      <BotaoSimulado alvo="transf.salvar" largo>
        Salvar
      </BotaoSimulado>
    </JanelaSimulada>
  );
}

export function CenaSaldo({ valores }: PropsCena) {
  return (
    <JanelaSimulada titulo="Informar saldo bancário">
      <SelectSimulado alvo="saldo.conta" rotulo="Conta bancária" valor={valores["saldo.conta"] ?? "Selecione a conta"} />
      <div className="grid grid-cols-2 gap-4">
        <CampoSimulado alvo="saldo.data" rotulo="Data" valor={valores["saldo.data"]} placeholder="dd/mm/aaaa" />
        <CampoSimulado alvo="saldo.valor" rotulo="Saldo" valor={valores["saldo.valor"]} />
      </div>
      <BotaoSimulado alvo="saldo.salvar" largo>
        Salvar
      </BotaoSimulado>
    </JanelaSimulada>
  );
}
