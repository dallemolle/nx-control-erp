"use client";

import { useState } from "react";
import type { ClassificacaoFiscal, TipoComprovante } from "@prisma/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROTULOS_TIPO_COMPROVANTE, SEM_VALOR } from "@/lib/schemas/enums";
import { tiposDeComprovanteDa } from "@/lib/classificacaoFiscal";

/**
 * Classificação (padrão Fiscal) + tipo de comprovante de um lançamento avulso
 * (tesouraria e conciliação). Trocar a classificação limpa um tipo do outro grupo.
 */
export function CamposClassificacaoLancamento({
  comNumero = false,
  sufixoId = "",
}: {
  comNumero?: boolean;
  /** Para formulários repetidos na mesma página (ex.: um por linha do extrato). */
  sufixoId?: string;
}) {
  const id = (campo: string) => (sufixoId ? `${campo}-${sufixoId}` : campo);
  const [classificacao, setClassificacao] = useState<ClassificacaoFiscal>("FISCAL");
  const [tipo, setTipo] = useState<string>(SEM_VALOR);

  const tiposDoGrupo = tiposDeComprovanteDa(classificacao);
  const tipoAtual = tiposDoGrupo.includes(tipo as TipoComprovante) ? tipo : SEM_VALOR;

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={id("classificacaoFiscal")}>Classificação</Label>
          <Select
            name="classificacaoFiscal"
            value={classificacao}
            onValueChange={(valor) => valor && setClassificacao(valor as ClassificacaoFiscal)}
          >
            <SelectTrigger id={id("classificacaoFiscal")} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="FISCAL">Fiscal (com documento)</SelectItem>
              <SelectItem value="GERENCIAL">Gerencial (sem nota)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={id("tipoComprovante")}>Comprovante</Label>
          <Select name="tipoComprovante" value={tipoAtual} onValueChange={(valor) => setTipo(valor ?? SEM_VALOR)}>
            <SelectTrigger id={id("tipoComprovante")} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_VALOR}>Nenhum</SelectItem>
              {tiposDoGrupo.map((opcao) => (
                <SelectItem key={opcao} value={opcao}>
                  {ROTULOS_TIPO_COMPROVANTE[opcao]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {comNumero ? (
        <div className="space-y-2">
          <Label htmlFor={id("numeroComprovante")}>Nº do comprovante</Label>
          <Input id={id("numeroComprovante")} name="numeroComprovante" placeholder="Opcional" />
        </div>
      ) : null}
    </>
  );
}
