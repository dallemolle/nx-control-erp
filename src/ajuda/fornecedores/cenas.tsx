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
import { EMBALAGENS, FORNECEDORES, RAIMUNDO, type FornecedorDaLista } from "./exemplo";

// Espelho de src/app/(dashboard)/cadastros/fornecedores/page.tsx e de fornecedor-dialog-form.tsx. Mudou um rótulo,
// campo ou coluna lá? Ajuste aqui também.

type Linha = FornecedorDaLista & { ativo: boolean };

/** Os fornecedores no ponto do roteiro, em ordem de nome, como a tela lista. */
export function fornecedoresDoRoteiro(valores: Valores): Linha[] {
  const linhas: Linha[] = FORNECEDORES.map((f) => ({
    ...f,
    ativo: f.chave !== "sitio" || valores["lista.sitio"] !== "Inativo",
  }));
  if (valores["lista.embalagens"] === "sim") {
    linhas.push({
      chave: "embalagens",
      nome: EMBALAGENS.nome,
      cnpjCpf: formatarCnpjCpf(EMBALAGENS.cnpjDigitado),
      contato: EMBALAGENS.telefone,
      ativo: true,
    });
  }
  if (valores["lista.raimundo"] === "sim") {
    linhas.push({
      chave: "raimundo",
      nome: RAIMUNDO.nome,
      cnpjCpf: formatarCnpjCpf(RAIMUNDO.cpfDigitado),
      contato: RAIMUNDO.telefone,
      ativo: true,
    });
  }
  return linhas.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

function Nome({ linha }: { linha: Linha }) {
  if (linha.chave === "embalagens" || linha.chave === "raimundo") {
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
  return linha.chave === "sitio" ? (
    <Alvo nome="lista.sitio" className="inline-block px-1">
      {badge}
    </Alvo>
  ) : (
    badge
  );
}

export function CenaLista({ valores }: PropsCena) {
  const linhas = fornecedoresDoRoteiro(valores);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">Fornecedores</p>
          <p className="text-sm text-muted-foreground">Cadastro de fornecedores da empresa.</p>
        </div>
        <BotaoSimulado alvo="lista.novo">Novo fornecedor</BotaoSimulado>
      </div>

      <Alvo nome="lista.tabela" className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>CNPJ/CPF</TableHead>
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
                <TableCell>{linha.cnpjCpf}</TableCell>
                <TableCell>{linha.contato ?? "—"}</TableCell>
                <TableCell>
                  <Status linha={linha} />
                </TableCell>
                <TableCell className="flex justify-end gap-2">
                  <BotaoSimulado alvo={linha.chave === "sitio" ? "lista.editar" : undefined} variant="outline" size="sm">
                    Editar
                  </BotaoSimulado>
                  <BotaoSimulado alvo={linha.chave === "sitio" ? "lista.inativar" : undefined} variant="outline" size="sm">
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

/** O formulário do novo fornecedor, com os campos do tipo de dado bancário escolhido. */
export function CenaNovo({ valores }: PropsCena) {
  const tipo = valores["form.tipo"] ?? "Nenhum";
  return (
    <JanelaSimulada titulo="Novo fornecedor">
      <CampoSimulado alvo="form.nome" rotulo="Nome" valor={valores["form.nome"]} />
      <CampoSimulado alvo="form.cnpj" rotulo="CNPJ/CPF" valor={valores["form.cnpj"]} />
      <CampoSimulado alvo="form.contato" rotulo="Contato" valor={valores["form.contato"]} />
      <CampoSimulado rotulo="Email" />
      <CampoSimulado alvo="form.telefone" rotulo="Telefone" valor={valores["form.telefone"]} />
      <CampoSimulado alvo="form.municipio" rotulo="Município" valor={valores["form.municipio"]} />
      <SelectSimulado
        alvo="form.classificacao"
        rotulo="Classificação padrão dos títulos"
        valor={valores["form.classificacao"] ?? "Nenhuma"}
      />
      <Dica>
        Use Gerencial para parceiros que não emitem nota. Novos títulos deste parceiro já virão com essa classificação.
      </Dica>

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
          <SelectSimulado alvo="form.banco" rotulo="Banco" valor={valores["form.banco"] ?? "Selecione"} />
          <div className="grid grid-cols-2 gap-4">
            <CampoSimulado alvo="form.agencia" rotulo="Agência" valor={valores["form.agencia"]} />
            <CampoSimulado alvo="form.conta" rotulo="Conta" valor={valores["form.conta"]} />
          </div>
          <SelectSimulado alvo="form.tipoConta" rotulo="Tipo de conta" valor={valores["form.tipoConta"] ?? "Selecione"} />
          <CampoSimulado alvo="form.titular" rotulo="Titular da conta" valor={valores["form.titular"]} />
        </>
      ) : null}

      <BotaoSimulado alvo="form.salvar" largo>
        Salvar
      </BotaoSimulado>
    </JanelaSimulada>
  );
}
