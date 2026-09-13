"use client";

import type { ChangeEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SEM_VALOR } from "@/lib/schemas/enums";

export type OpcoesFiltroAuditoria = {
  entidades: string[];
  acoes: string[];
  usuarios: { id: string; nome: string }[];
  filiais: { id: string; nome: string }[];
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
  params.delete("pagina");
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function BarraDeFiltrosAuditoria({ opcoes }: { opcoes: OpcoesFiltroAuditoria }) {
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
        <span className="text-xs text-muted-foreground">Entidade</span>
        <Select value={valorSelect("entidade")} onValueChange={aoMudarSelect("entidade")}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM_VALOR}>Todas</SelectItem>
            {opcoes.entidades.map((entidade) => (
              <SelectItem key={entidade} value={entidade}>
                {entidade}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Acao</span>
        <Select value={valorSelect("acao")} onValueChange={aoMudarSelect("acao")}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM_VALOR}>Todas</SelectItem>
            {opcoes.acoes.map((acao) => (
              <SelectItem key={acao} value={acao}>
                {acao}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Usuario</span>
        <Select value={valorSelect("usuarioId")} onValueChange={aoMudarSelect("usuarioId")}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM_VALOR}>Todos</SelectItem>
            {opcoes.usuarios.map((usuario) => (
              <SelectItem key={usuario.id} value={usuario.id}>
                {usuario.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Filial</span>
        <Select value={valorSelect("filialId")} onValueChange={aoMudarSelect("filialId")}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM_VALOR}>Todas</SelectItem>
            {opcoes.filiais.map((filial) => (
              <SelectItem key={filial.id} value={filial.id}>
                {filial.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Data de</span>
        <Input type="date" className="w-40" value={valorData("dataDe")} onChange={aoMudarData("dataDe")} />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Data ate</span>
        <Input type="date" className="w-40" value={valorData("dataAte")} onChange={aoMudarData("dataAte")} />
      </div>

      <Button type="button" variant="outline" size="sm" onClick={limparFiltros}>
        Limpar filtros
      </Button>
    </div>
  );
}
