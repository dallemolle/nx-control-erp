// src/app/(dashboard)/financeiro/conciliacao/campos-lancamento-avulso.tsx
"use client";
// Espelhado na ajuda (src/ajuda/conciliacao/cenas.tsx): mudou rótulo, campo ou botão? Ajuste a ajuda junto.

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SEM_VALOR } from "@/lib/schemas/enums";
import { CamposClassificacaoLancamento } from "../../_shared/campos-classificacao-lancamento";

type Opcao = { id: string; nome: string };

function SelectOpcional({
  id,
  name,
  rotulo,
  rotuloVazio,
  opcoes,
}: {
  id: string;
  name: string;
  rotulo: string;
  rotuloVazio: string;
  opcoes: Opcao[];
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{rotulo}</Label>
      <Select name={name} defaultValue={SEM_VALOR}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={SEM_VALOR}>{rotuloVazio}</SelectItem>
          {opcoes.map((opcao) => (
            <SelectItem key={opcao.id} value={opcao.id}>
              {opcao.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Descrição, classificação, categoria e dimensões de um lançamento criado na conciliação. */
export function CamposLancamentoAvulso({
  sufixoId,
  categorias,
  centrosCusto,
  centrosLucro,
  safras,
  projetos,
}: {
  sufixoId: string;
  categorias: Opcao[];
  centrosCusto: Opcao[];
  centrosLucro: Opcao[];
  safras: Opcao[];
  projetos: Opcao[];
}) {
  const id = (campo: string) => `${campo}-${sufixoId}`;
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={id("descricao")}>Descrição</Label>
        <Input id={id("descricao")} name="descricao" required />
      </div>
      <CamposClassificacaoLancamento sufixoId={sufixoId} />
      <SelectOpcional
        id={id("categoriaFinanceiraId")}
        name="categoriaFinanceiraId"
        rotulo="Categoria financeira"
        rotuloVazio="Nenhuma"
        opcoes={categorias}
      />
      <SelectOpcional
        id={id("centroCustoId")}
        name="centroCustoId"
        rotulo="Centro de custo"
        rotuloVazio="Nenhum"
        opcoes={centrosCusto}
      />
      <SelectOpcional
        id={id("centroLucroId")}
        name="centroLucroId"
        rotulo="Centro de lucro"
        rotuloVazio="Nenhum"
        opcoes={centrosLucro}
      />
      <SelectOpcional id={id("safraId")} name="safraId" rotulo="Safra" rotuloVazio="Nenhuma" opcoes={safras} />
      <SelectOpcional id={id("projetoId")} name="projetoId" rotulo="Projeto" rotuloVazio="Nenhum" opcoes={projetos} />
    </>
  );
}
