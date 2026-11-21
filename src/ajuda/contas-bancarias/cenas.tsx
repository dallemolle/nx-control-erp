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
import { formatarMoeda } from "@/lib/formatacao";
import { CONTAS, ESCRITORIO, SICREDI, TIPO_CAIXA, TIPO_CORRENTE, type ContaDaLista } from "./exemplo";

// Espelho de src/app/(dashboard)/cadastros/contas-bancarias/page.tsx e de conta-bancaria-dialog-form.tsx. Mudou um
// rótulo, campo ou coluna lá? Ajuste aqui também.

type Linha = ContaDaLista & { ativo: boolean };

/** As contas no ponto do roteiro, na ordem de cadastro, como a tela lista. */
export function contasDoRoteiro(valores: Valores): Linha[] {
  const linhas: Linha[] = CONTAS.map((c) => ({
    ...c,
    ativo: c.chave !== "santander" || valores["lista.santander"] !== "Inativo",
  }));
  if (valores["lista.sicredi"] === "sim") linhas.push({ ...SICREDI, ativo: true });
  if (valores["lista.escritorio"] === "sim") linhas.push({ ...ESCRITORIO, ativo: true });
  return linhas;
}

function Banco({ linha }: { linha: Linha }) {
  if (linha.chave === "sicredi" || linha.chave === "escritorio") {
    return (
      <Alvo nome={`lista.${linha.chave}`} className="inline-block px-1">
        {linha.banco}
      </Alvo>
    );
  }
  return <>{linha.banco}</>;
}

function Status({ linha }: { linha: Linha }) {
  const badge = <Badge variant={linha.ativo ? "default" : "secondary"}>{linha.ativo ? "Ativo" : "Inativo"}</Badge>;
  return linha.chave === "santander" ? (
    <Alvo nome="lista.santander" className="inline-block px-1">
      {badge}
    </Alvo>
  ) : (
    badge
  );
}

export function CenaLista({ valores }: PropsCena) {
  const linhas = contasDoRoteiro(valores);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">Contas bancárias</p>
          <p className="text-sm text-muted-foreground">Contas bancárias e caixas (dinheiro em espécie) da filial.</p>
        </div>
        <BotaoSimulado alvo="lista.nova">Nova conta bancária</BotaoSimulado>
      </div>

      <Alvo nome="lista.tabela" className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Banco</TableHead>
              <TableHead>Agência</TableHead>
              <TableHead>Conta</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Moeda</TableHead>
              <TableHead className="text-right">Saldo inicial</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((linha) => (
              <TableRow key={linha.chave}>
                <TableCell className="font-medium">
                  <Banco linha={linha} />
                </TableCell>
                <TableCell>{linha.agencia}</TableCell>
                <TableCell>{linha.conta}</TableCell>
                <TableCell>{linha.tipo}</TableCell>
                <TableCell>BRL</TableCell>
                <TableCell className="text-right tabular-nums">{formatarMoeda(linha.saldoInicial)}</TableCell>
                <TableCell>
                  <Status linha={linha} />
                </TableCell>
                <TableCell className="flex justify-end gap-2">
                  <BotaoSimulado alvo={linha.chave === "bb" ? "lista.editar" : undefined} variant="outline" size="sm">
                    Editar
                  </BotaoSimulado>
                  <BotaoSimulado
                    alvo={linha.chave === "santander" ? "lista.inativar" : undefined}
                    variant="outline"
                    size="sm"
                  >
                    {linha.ativo ? "Inativar" : "Reativar"}
                  </BotaoSimulado>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Alvo>
    </div>
  );
}

type Base = { banco?: string; agencia?: string; conta?: string; saldo: string };

/** O formulário da conta: no tipo Caixa somem banco e agência, e a conta vira a identificação do caixa. */
function Formulario({ titulo, base, valores }: { titulo: string; base: Base; valores: Valores }) {
  const tipo = valores["form.tipo"] ?? TIPO_CORRENTE;
  const ehCaixa = tipo === TIPO_CAIXA;
  return (
    <JanelaSimulada titulo={titulo}>
      <SelectSimulado alvo="form.tipo" rotulo="Tipo" valor={tipo} />
      {ehCaixa ? null : (
        <>
          <SelectSimulado alvo="form.banco" rotulo="Banco" valor={valores["form.banco"] ?? base.banco ?? "Selecione o banco"} />
          <CampoSimulado alvo="form.agencia" rotulo="Agência" valor={valores["form.agencia"] ?? base.agencia} />
        </>
      )}
      <CampoSimulado
        alvo="form.conta"
        rotulo={ehCaixa ? "Identificação do caixa" : "Conta"}
        valor={valores["form.conta"] ?? base.conta}
        placeholder={ehCaixa ? "Ex.: Escritório" : undefined}
      />
      <CampoSimulado alvo="form.moeda" rotulo="Moeda" valor="BRL" />
      <CampoSimulado alvo="form.saldo" rotulo="Saldo inicial" valor={valores["form.saldo"] ?? base.saldo} />
      {valores["form.erro"] ? (
        <Alvo nome="form.erro" className="p-1">
          <p className="text-sm text-destructive">{valores["form.erro"]}</p>
        </Alvo>
      ) : null}
      <BotaoSimulado alvo="form.salvar" largo>
        Salvar
      </BotaoSimulado>
    </JanelaSimulada>
  );
}

export function CenaNova({ valores }: PropsCena) {
  return <Formulario titulo="Nova conta bancária" base={{ saldo: "0" }} valores={valores} />;
}

export function CenaEditar({ valores }: PropsCena) {
  const bb = CONTAS.find((c) => c.chave === "bb")!;
  return (
    <Formulario
      titulo="Editar conta bancária"
      base={{ banco: bb.banco, agencia: bb.agencia, conta: bb.conta, saldo: String(bb.saldoInicial) }}
      valores={valores}
    />
  );
}
