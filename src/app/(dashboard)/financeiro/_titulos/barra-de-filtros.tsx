"use client";

import type { ChangeEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SEM_VALOR } from "@/lib/schemas/enums";
import type { StatusParcela } from "@prisma/client";

const STATUS_OPCOES: StatusParcela[] = [
  "EM_ABERTO",
  "A_VENCER",
  "VENCIDO",
  "PARCIALMENTE_PAGO",
  "PAGO",
  "CANCELADO",
  "RENEGOCIADO",
];

export type OpcoesFiltro = {
  categorias: { id: string; nome: string }[];
  contrapartes: { id: string; nome: string }[];
  centrosCusto: { id: string; nome: string }[];
  centrosLucro: { id: string; nome: string }[];
  safras: { id: string; nome: string }[];
  projetos: { id: string; nome: string }[];
};

export function construirUrlComFiltro(
  searchParamsAtual: URLSearchParams,
  pathname: string,
  campo: string,
  valor: string,
): string {
  const params = new URLSearchParams(searchParamsAtual.toString());
  if (!valor || valor === SEM_VALOR) {
    params.delete(campo);
  } else {
    params.set(campo, valor);
  }
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function BarraDeFiltros({
  rotuloContraparte,
  opcoes,
}: {
  rotuloContraparte: string;
  opcoes: OpcoesFiltro;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function valorSelect(campo: string): string {
    return searchParams.get(campo) ?? SEM_VALOR;
  }

  function valorData(campo: string): string {
    return searchParams.get(campo) ?? "";
  }

  function aoMudarSelect(campo: string) {
    return (valor: string | null) => {
      if (valor !== null) {
        router.push(construirUrlComFiltro(searchParams, pathname, campo, valor));
      }
    };
  }

  function aoMudarData(campo: string) {
    return (evento: ChangeEvent<HTMLInputElement>) =>
      router.push(construirUrlComFiltro(searchParams, pathname, campo, evento.target.value));
  }

  function limparFiltros() {
    router.push(pathname);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Categoria</span>
        <Select value={valorSelect("categoria")} onValueChange={aoMudarSelect("categoria")}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM_VALOR}>Todas</SelectItem>
            {opcoes.categorias.map((categoria) => (
              <SelectItem key={categoria.id} value={categoria.id}>
                {categoria.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{rotuloContraparte}</span>
        <Select value={valorSelect("contraparte")} onValueChange={aoMudarSelect("contraparte")}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM_VALOR}>Todos</SelectItem>
            {opcoes.contrapartes.map((contraparte) => (
              <SelectItem key={contraparte.id} value={contraparte.id}>
                {contraparte.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Centro de custo</span>
        <Select value={valorSelect("centroCusto")} onValueChange={aoMudarSelect("centroCusto")}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM_VALOR}>Todos</SelectItem>
            {opcoes.centrosCusto.map((centroCusto) => (
              <SelectItem key={centroCusto.id} value={centroCusto.id}>
                {centroCusto.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Centro de lucro</span>
        <Select value={valorSelect("centroLucro")} onValueChange={aoMudarSelect("centroLucro")}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM_VALOR}>Todos</SelectItem>
            {opcoes.centrosLucro.map((centroLucro) => (
              <SelectItem key={centroLucro.id} value={centroLucro.id}>
                {centroLucro.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Safra</span>
        <Select value={valorSelect("safra")} onValueChange={aoMudarSelect("safra")}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM_VALOR}>Todas</SelectItem>
            {opcoes.safras.map((safra) => (
              <SelectItem key={safra.id} value={safra.id}>
                {safra.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Projeto</span>
        <Select value={valorSelect("projeto")} onValueChange={aoMudarSelect("projeto")}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM_VALOR}>Todos</SelectItem>
            {opcoes.projetos.map((projeto) => (
              <SelectItem key={projeto.id} value={projeto.id}>
                {projeto.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Status</span>
        <Select value={valorSelect("status")} onValueChange={aoMudarSelect("status")}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM_VALOR}>Todos os status</SelectItem>
            {STATUS_OPCOES.map((status) => (
              <SelectItem key={status} value={status}>
                {status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Vencimento de</span>
        <Input
          type="date"
          className="w-40"
          value={valorData("vencimentoDe")}
          onChange={aoMudarData("vencimentoDe")}
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Vencimento até</span>
        <Input
          type="date"
          className="w-40"
          value={valorData("vencimentoAte")}
          onChange={aoMudarData("vencimentoAte")}
        />
      </div>

      <Button type="button" variant="outline" size="sm" onClick={limparFiltros}>
        Limpar filtros
      </Button>
    </div>
  );
}
