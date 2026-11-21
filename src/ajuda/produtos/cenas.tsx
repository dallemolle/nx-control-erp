"use client";

import type { ReactNode } from "react";
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
import { formatarMoeda } from "@/lib/formatacao";
import { AGR, PRODUTOS, type ProdutoDaLista } from "./exemplo";

// Espelho de src/app/(dashboard)/cadastros/produtos/page.tsx e de produto-dialog-form.tsx. Mudou um rótulo, campo ou
// coluna lá? Ajuste aqui também.

type Linha = ProdutoDaLista & { ativo: boolean };

const AGR_NA_LISTA: ProdutoDaLista = {
  codigo: AGR.codigo,
  descricao: AGR.descricao,
  fruta: AGR.fruta,
  categoria: AGR.categoria,
  conservacao: AGR.conservacao,
  validadeDias: AGR.validadeDias,
  precoReferenciaKg: AGR.precoReferenciaKg,
  unidade: null,
  diasLiberacao: null,
};

/** Os produtos no ponto do roteiro, em ordem de código, como a tela lista. */
export function produtosDoRoteiro(valores: Valores): Linha[] {
  const linhas: Linha[] = PRODUTOS.map((p) => ({ ...p, ativo: p.codigo !== "ACR" || valores["lista.acr"] !== "Inativo" }));
  if (valores["lista.agr"] === "sim") linhas.push({ ...AGR_NA_LISTA, ativo: true });
  return linhas.sort((a, b) => a.codigo.localeCompare(b.codigo));
}

const kg = (valor: number) => valor.toLocaleString("pt-BR");
const dias = (n: number) => `${n} ${n === 1 ? "dia" : "dias"}`;

function Codigo({ linha }: { linha: Linha }) {
  const alvo = { AGR: "lista.agr", FA: "lista.fa", FC: "lista.fc" }[linha.codigo];
  return alvo ? (
    <Alvo nome={alvo} className="inline-block px-1">
      {linha.codigo}
    </Alvo>
  ) : (
    <>{linha.codigo}</>
  );
}

function Status({ linha }: { linha: Linha }) {
  const badge = <Badge variant={linha.ativo ? "default" : "secondary"}>{linha.ativo ? "Ativo" : "Inativo"}</Badge>;
  return linha.codigo === "ACR" ? (
    <Alvo nome="lista.acr" className="inline-block px-1">
      {badge}
    </Alvo>
  ) : (
    badge
  );
}

export function CenaLista({ valores }: PropsCena) {
  const linhas = produtosDoRoteiro(valores);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">Produtos</p>
          <p className="text-sm text-muted-foreground">
            Frutos e polpas vendidos ou estocados. O código vira o início do número de lote.
          </p>
        </div>
        <BotaoSimulado alvo="lista.novo">Novo produto</BotaoSimulado>
      </div>

      <Alvo nome="lista.tabela" className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Fruta</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Conservação</TableHead>
              <TableHead className="text-right">Validade</TableHead>
              <TableHead className="text-right">Preço ref. (R$/kg)</TableHead>
              <TableHead>Unidade comercial</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((linha) => (
              <TableRow key={linha.codigo}>
                <TableCell className="font-medium">
                  <Codigo linha={linha} />
                </TableCell>
                <TableCell>{linha.descricao}</TableCell>
                <TableCell>{linha.fruta}</TableCell>
                <TableCell>{linha.categoria}</TableCell>
                <TableCell>{linha.conservacao}</TableCell>
                <TableCell className="text-right tabular-nums">{dias(linha.validadeDias)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {linha.precoReferenciaKg === null ? "—" : formatarMoeda(linha.precoReferenciaKg)}
                </TableCell>
                <TableCell>{linha.unidade ? `${linha.unidade.nome} = ${kg(linha.unidade.kg)} kg` : "—"}</TableCell>
                <TableCell>
                  <Status linha={linha} />
                </TableCell>
                <TableCell className="flex justify-end gap-2">
                  <BotaoSimulado variant="outline" size="sm">
                    Editar
                  </BotaoSimulado>
                  <BotaoSimulado alvo={linha.codigo === "ACR" ? "lista.inativar" : undefined} variant="outline" size="sm">
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

const Dica = ({ children }: { children: ReactNode }) => <p className="text-xs text-muted-foreground">{children}</p>;

type Campos = {
  codigo?: string;
  descricao?: string;
  categoria: string;
  fruta: string;
  conservacao: string;
  validade?: string;
  preco?: string;
  armazenamento?: string;
  liberacao?: string;
  unidade?: string;
  kgPorUnidade?: string;
  etiqueta?: string;
};

/** O formulário do produto, na ordem da tela. `cabecalho` envolve código e descrição (alvo da cena de edição). */
function Formulario({ titulo, campos, cabecalho }: { titulo: string; campos: Campos; cabecalho?: string }) {
  const codigoEDescricao = (
    <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
      <CampoSimulado alvo={cabecalho ? undefined : "form.codigo"} rotulo="Código" valor={campos.codigo} />
      <CampoSimulado alvo={cabecalho ? undefined : "form.descricao"} rotulo="Descrição" valor={campos.descricao} />
    </div>
  );
  const etiqueta = (
    <div className="grid gap-2">
      <span className="text-sm font-medium">Texto da etiqueta (opcional)</span>
      <div className="min-h-16 rounded-lg border border-input px-2.5 py-1.5 text-sm">{campos.etiqueta ?? " "}</div>
    </div>
  );
  return (
    <JanelaSimulada titulo={titulo} className="max-w-lg">
      {cabecalho ? (
        <Alvo nome={cabecalho} className="p-1">
          {codigoEDescricao}
        </Alvo>
      ) : (
        codigoEDescricao
      )}
      <Dica>Ex.: FA, AGC. O código vira o início do número de lote (FA-260927-01).</Dica>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectSimulado alvo="form.categoria" rotulo="Categoria" valor={campos.categoria} />
        <SelectSimulado alvo={cabecalho ? undefined : "form.fruta"} rotulo="Fruta" valor={campos.fruta} />
        <SelectSimulado alvo={cabecalho ? undefined : "form.conservacao"} rotulo="Conservação" valor={campos.conservacao} />
        <CampoSimulado alvo="form.validade" rotulo="Validade (dias)" valor={campos.validade} />
        <div className="grid gap-2">
          <CampoSimulado alvo="form.preco" rotulo="Preço de referência (R$/kg)" valor={campos.preco} />
          <Dica>Sugerido na venda e usado para dividir o custo da OP entre as polpas.</Dica>
        </div>
        <CampoSimulado
          alvo={cabecalho ? undefined : "form.armazenamento"}
          rotulo="Armazenamento (etiqueta)"
          valor={campos.armazenamento}
          placeholder="-18 °C"
        />
      </div>
      <div className="grid gap-2">
        <CampoSimulado
          alvo="form.liberacao"
          rotulo="Dias de liberação após vencimento (opcional)"
          valor={campos.liberacao}
          className="sm:w-40"
        />
        <Dica>Tolerância máxima após a validade. Vazio = o produto não pode ser liberado.</Dica>
      </div>

      <Separator />
      <p className="text-sm font-medium">Unidade comercial (opcional)</p>
      <Alvo nome="form.unidade" className="grid gap-4 p-1 sm:grid-cols-2">
        <CampoSimulado rotulo="Unidade" valor={campos.unidade} placeholder="rasa" />
        <CampoSimulado rotulo="kg por unidade" valor={campos.kgPorUnidade} placeholder="14" />
      </Alvo>
      <Dica>Ex.: rasa = 14 kg. Permite lançar quantidade e preço por rasa.</Dica>

      <Separator />
      <div className="grid gap-2">
        {cabecalho ? (
          etiqueta
        ) : (
          <Alvo nome="form.etiqueta" className="p-1">
            {etiqueta}
          </Alvo>
        )}
        <Dica>
          Ingredientes, instruções de conservação e outros dizeres obrigatórios. Sai em letra pequena, até 3 linhas.
        </Dica>
      </div>

      <BotaoSimulado alvo="form.salvar" largo>
        Salvar
      </BotaoSimulado>
    </JanelaSimulada>
  );
}

export function CenaNovo({ valores }: PropsCena) {
  return (
    <Formulario
      titulo="Novo produto"
      campos={{
        codigo: valores["form.codigo"],
        descricao: valores["form.descricao"],
        categoria: valores["form.categoria"] ?? "Fruto",
        fruta: valores["form.fruta"] ?? "Selecione a fruta",
        conservacao: valores["form.conservacao"] ?? "In natura",
        validade: valores["form.validade"],
        preco: valores["form.preco"],
        armazenamento: valores["form.armazenamento"],
        etiqueta: valores["form.etiqueta"],
      }}
    />
  );
}

/** O “Editar” de um produto já cadastrado (FA ou FC), só para olhar os campos. */
export function CenaEditar({ valores }: PropsCena) {
  const p = PRODUTOS.find((x) => x.codigo === (valores["editar.produto"] ?? "FA"))!;
  return (
    <Formulario
      titulo="Editar produto"
      cabecalho="editar.produto"
      campos={{
        codigo: p.codigo,
        descricao: p.descricao,
        categoria: p.categoria,
        fruta: p.fruta,
        conservacao: p.conservacao,
        validade: String(p.validadeDias),
        preco: p.precoReferenciaKg === null ? undefined : String(p.precoReferenciaKg),
        liberacao: p.diasLiberacao === null ? undefined : String(p.diasLiberacao),
        unidade: p.unidade?.nome,
        kgPorUnidade: p.unidade ? String(p.unidade.kg) : undefined,
      }}
    />
  );
}
