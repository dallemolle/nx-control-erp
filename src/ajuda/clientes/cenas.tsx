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
import type { PropsCena, Valores } from "@/ajuda/tipos";
import { formatarCnpjCpf } from "@/lib/cnpjCpf";
import { cn } from "@/lib/utils";
import { CLIENTES, DIVERSOS, POLAR, VER_O_PESO, type ClienteDaLista } from "./exemplo";

// Espelho de src/app/(dashboard)/cadastros/clientes/page.tsx e de cliente-dialog-form.tsx. Mudou um rótulo, campo ou
// coluna lá? Ajuste aqui também.

type Linha = ClienteDaLista & { ativo: boolean };

/** Os clientes no ponto do roteiro, em ordem de nome, como a tela lista. */
export function clientesDoRoteiro(valores: Valores): Linha[] {
  const linhas: Linha[] = CLIENTES.map((c) => ({ ...c, ativo: c.chave !== "tucuma" || valores["lista.tucuma"] !== "Inativo" }));
  if (valores["lista.polar"] === "sim") {
    linhas.push({
      chave: "polar",
      nome: POLAR.nome,
      cnpjCpf: formatarCnpjCpf(POLAR.cnpjDigitado),
      canal: POLAR.canal,
      contato: POLAR.telefone,
      ativo: true,
    });
  }
  if (valores["lista.diversos"] === "sim") {
    linhas.push({ chave: "diversos", nome: DIVERSOS.nome, cnpjCpf: null, canal: DIVERSOS.canal, contato: null, ativo: true });
  }
  return linhas.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

function Nome({ linha }: { linha: Linha }) {
  if (linha.chave === "polar" || linha.chave === "diversos") {
    return (
      <Alvo nome={`lista.${linha.chave}`} className="inline-block px-1">
        {linha.nome}
      </Alvo>
    );
  }
  return <>{linha.nome}</>;
}

function Status({ linha }: { linha: Linha }) {
  const badge = <Badge variant={linha.ativo ? "default" : "secondary"}>{linha.ativo ? "Ativo" : "Inativo"}</Badge>;
  return linha.chave === "tucuma" ? (
    <Alvo nome="lista.tucuma" className="inline-block px-1">
      {badge}
    </Alvo>
  ) : (
    badge
  );
}

export function CenaLista({ valores }: PropsCena) {
  const linhas = clientesDoRoteiro(valores);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">Clientes</p>
          <p className="text-sm text-muted-foreground">Cadastro de clientes da empresa.</p>
        </div>
        <BotaoSimulado alvo="lista.novo">Novo cliente</BotaoSimulado>
      </div>

      <Alvo nome="lista.tabela" className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>CNPJ/CPF</TableHead>
              <TableHead>Canal</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((linha) => (
              <TableRow key={linha.chave}>
                <TableCell className="font-medium">
                  <Nome linha={linha} />
                </TableCell>
                <TableCell>{linha.cnpjCpf ?? "—"}</TableCell>
                <TableCell>{linha.canal}</TableCell>
                <TableCell>{linha.contato ?? "—"}</TableCell>
                <TableCell>
                  <Status linha={linha} />
                </TableCell>
                <TableCell className="flex justify-end gap-2">
                  <BotaoSimulado alvo={linha.chave === "verOPeso" ? "lista.editar" : undefined} variant="outline" size="sm">
                    Editar
                  </BotaoSimulado>
                  <BotaoSimulado alvo={linha.chave === "tucuma" ? "lista.inativar" : undefined} variant="outline" size="sm">
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

const Dica = ({ children }: { children: string }) => <p className="-mt-2 text-xs text-muted-foreground">{children}</p>;

type Base = {
  nome?: string;
  cnpjCpf?: string;
  contato?: string;
  telefone?: string;
  classificacao: string;
  canal: string;
  municipio?: string;
};

/** O formulário do cliente (novo ou edição), com os campos do tipo de dado bancário escolhido. */
function Formulario({ titulo, base, valores }: { titulo: string; base: Base; valores: Valores }) {
  const tipo = valores["form.tipo"] ?? "Nenhum";
  const retira = valores["form.retira"] === "sim";
  return (
    <JanelaSimulada titulo={titulo}>
      <CampoSimulado alvo="form.nome" rotulo="Nome" valor={valores["form.nome"] ?? base.nome} />
      <CampoSimulado alvo="form.cnpj" rotulo="CNPJ/CPF (opcional)" valor={valores["form.cnpj"] ?? base.cnpjCpf} />
      <Dica>Deixe em branco para consumidor final ou clientes diversos.</Dica>
      <CampoSimulado alvo="form.contato" rotulo="Contato" valor={valores["form.contato"] ?? base.contato} />
      <CampoSimulado rotulo="Email" />
      <CampoSimulado alvo="form.telefone" rotulo="Telefone" valor={valores["form.telefone"] ?? base.telefone} />
      <SelectSimulado
        alvo="form.classificacao"
        rotulo="Classificação padrão dos títulos"
        valor={valores["form.classificacao"] ?? base.classificacao}
      />
      <Dica>
        Use Gerencial para parceiros que não emitem nota. Novos títulos deste parceiro já virão com essa classificação.
      </Dica>

      <Separator />
      <p className="text-sm font-medium">Vendas</p>
      <SelectSimulado alvo="form.canal" rotulo="Canal de venda" valor={valores["form.canal"] ?? base.canal} />
      <CampoSimulado alvo="form.municipio" rotulo="Município" valor={valores["form.municipio"] ?? base.municipio} />
      <CampoSimulado alvo="form.endereco" rotulo="Endereço de entrega" valor={valores["form.endereco"]} />
      <Alvo nome="form.retira" className="flex items-center gap-2 p-1 text-sm">
        <span
          className={cn(
            "flex size-4 shrink-0 items-center justify-center rounded-sm border border-input text-[10px]",
            retira && "border-primary bg-primary text-primary-foreground",
          )}
        >
          {retira ? "✓" : ""}
        </span>
        Retira na propriedade (o pedido não gera entrega)
      </Alvo>

      <Separator />
      <p className="text-sm font-medium">Dados bancários</p>
      <SelectSimulado alvo="form.tipo" rotulo="Tipo" valor={tipo} />
      {tipo === "PIX" ? (
        <>
          <SelectSimulado alvo="form.tipoChave" rotulo="Tipo de chave" valor={valores["form.tipoChave"] ?? "Selecione"} />
          <CampoSimulado alvo="form.chave" rotulo="Chave PIX" valor={valores["form.chave"]} />
        </>
      ) : null}
      {tipo === "Depósito bancário" ? (
        <>
          <SelectSimulado rotulo="Banco" valor="Selecione" />
          <div className="grid grid-cols-2 gap-4">
            <CampoSimulado rotulo="Agência" />
            <CampoSimulado rotulo="Conta" />
          </div>
          <SelectSimulado rotulo="Tipo de conta" valor="Selecione" />
          <CampoSimulado rotulo="Titular da conta" />
        </>
      ) : null}

      <BotaoSimulado alvo="form.salvar" largo>
        Salvar
      </BotaoSimulado>
    </JanelaSimulada>
  );
}

export function CenaNovo({ valores }: PropsCena) {
  return <Formulario titulo="Novo cliente" base={{ classificacao: "Nenhuma", canal: "Nenhum" }} valores={valores} />;
}

export function CenaEditar({ valores }: PropsCena) {
  return <Formulario titulo="Editar cliente" base={VER_O_PESO} valores={{ "form.retira": "sim", ...valores }} />;
}
