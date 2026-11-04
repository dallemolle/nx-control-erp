"use client";

import { useState } from "react";
import type { ClassificacaoFiscal, TipoComprovante } from "@prisma/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROTULOS_TIPO_COMPROVANTE, SEM_VALOR } from "@/lib/schemas/enums";
import {
  aceitaChaveAcesso,
  chaveAcessoValida,
  exigeNumeroNota,
  normalizarChaveAcesso,
  tiposDeComprovanteDa,
} from "@/lib/classificacaoFiscal";

export type DocumentoFiscalEditavel = {
  classificacaoFiscal: ClassificacaoFiscal;
  tipoComprovante: TipoComprovante | null;
  numeroDocumentoFiscal: string | null;
  serieDocumentoFiscal: string | null;
  chaveAcesso: string | null;
  dataEmissaoDocumentoFiscal: string | null;
  motivoSemDocumento: string | null;
};

/** Situação da chave enquanto o usuário digita — `null` = nada a avisar. */
export function avisoChaveAcesso(valor: string): string | null {
  const digitos = normalizarChaveAcesso(valor);
  if (digitos.length === 0) return null;
  if (digitos.length !== 44) return `${digitos.length}/44 dígitos`;
  return chaveAcessoValida(digitos) ? null : "Dígito verificador não confere — confira a chave no DANFE";
}

/** Envia "" para um campo escondido: no service, campo ausente mantém o valor gravado; vazio limpa. */
function CampoVazio({ name }: { name: string }) {
  return <input type="hidden" name={name} value="" />;
}

/**
 * Seção "Documento fiscal" do título. A classificação é controlada pelo pai,
 * que a pré-preenche com o padrão da contraparte na criação.
 */
export function SecaoDocumentoFiscal({
  classificacao,
  aoMudarClassificacao,
  inicial,
  classificacaoOriginal,
}: {
  classificacao: ClassificacaoFiscal;
  aoMudarClassificacao: (classificacao: ClassificacaoFiscal) => void;
  inicial?: DocumentoFiscalEditavel;
  /** Só na edição: a classificação gravada, para pedir o motivo quando mudar. */
  classificacaoOriginal?: ClassificacaoFiscal;
}) {
  const [tipo, setTipo] = useState<string>(inicial?.tipoComprovante ?? SEM_VALOR);
  const [chave, setChave] = useState(inicial?.chaveAcesso ?? "");

  const tiposDoGrupo = tiposDeComprovanteDa(classificacao);
  // Tipo que não pertence ao grupo atual (ex.: trocou de Fiscal para Gerencial) volta a "Nenhum".
  const tipoAtual = tiposDoGrupo.includes(tipo as TipoComprovante) ? (tipo as TipoComprovante) : null;
  const fiscal = classificacao === "FISCAL";
  const mostraNumero = fiscal && exigeNumeroNota(tipoAtual);
  const mostraChave = fiscal && aceitaChaveAcesso(tipoAtual);
  const reclassificou = classificacaoOriginal !== undefined && classificacaoOriginal !== classificacao;
  const aviso = mostraChave ? avisoChaveAcesso(chave) : null;

  return (
    <>
      <Separator />
      <p className="text-sm font-medium">Documento fiscal</p>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="classificacaoFiscal">Classificação</Label>
          <Select
            name="classificacaoFiscal"
            value={classificacao}
            onValueChange={(valor) => valor && aoMudarClassificacao(valor as ClassificacaoFiscal)}
          >
            <SelectTrigger id="classificacaoFiscal" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="FISCAL">Fiscal (com documento)</SelectItem>
              <SelectItem value="GERENCIAL">Gerencial (sem nota)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="tipoComprovante">Tipo de comprovante</Label>
          <Select name="tipoComprovante" value={tipoAtual ?? SEM_VALOR} onValueChange={(valor) => setTipo(valor ?? SEM_VALOR)}>
            <SelectTrigger id="tipoComprovante" className="w-full">
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

      {mostraNumero ? (
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="numeroDocumentoFiscal">Nº da nota</Label>
            <Input
              id="numeroDocumentoFiscal"
              name="numeroDocumentoFiscal"
              defaultValue={inicial?.numeroDocumentoFiscal ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="serieDocumentoFiscal">Série</Label>
            <Input id="serieDocumentoFiscal" name="serieDocumentoFiscal" defaultValue={inicial?.serieDocumentoFiscal ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dataEmissaoDocumentoFiscal">Emissão da nota</Label>
            <Input
              id="dataEmissaoDocumentoFiscal"
              name="dataEmissaoDocumentoFiscal"
              type="date"
              defaultValue={inicial?.dataEmissaoDocumentoFiscal ?? ""}
            />
          </div>
        </div>
      ) : (
        <>
          <CampoVazio name="numeroDocumentoFiscal" />
          <CampoVazio name="serieDocumentoFiscal" />
          <CampoVazio name="dataEmissaoDocumentoFiscal" />
        </>
      )}

      {mostraChave ? (
        <div className="space-y-2">
          <Label htmlFor="chaveAcesso">Chave de acesso</Label>
          <Input
            id="chaveAcesso"
            name="chaveAcesso"
            value={chave}
            onChange={(evento) => setChave(evento.target.value)}
            inputMode="numeric"
            placeholder="44 dígitos (pode colar com espaços)"
            aria-invalid={aviso !== null && normalizarChaveAcesso(chave).length === 44}
            aria-describedby="chaveAcesso-aviso"
          />
          <p id="chaveAcesso-aviso" className="text-xs text-muted-foreground" aria-live="polite">
            {aviso ?? (chave ? "Chave válida" : "Opcional — sem ela o título fica como pendência fiscal")}
          </p>
        </div>
      ) : (
        <CampoVazio name="chaveAcesso" />
      )}

      {fiscal ? (
        <CampoVazio name="motivoSemDocumento" />
      ) : (
        <div className="space-y-2">
          <Label htmlFor="motivoSemDocumento">Motivo sem nota</Label>
          <Input
            id="motivoSemDocumento"
            name="motivoSemDocumento"
            defaultValue={inicial?.motivoSemDocumento ?? ""}
            placeholder="Opcional (ex.: produtor não emite nota)"
          />
        </div>
      )}

      {reclassificou ? (
        <div className="space-y-2">
          <Label htmlFor="motivoReclassificacao">Motivo da reclassificação</Label>
          <Input
            id="motivoReclassificacao"
            name="motivoReclassificacao"
            required
            placeholder="Obrigatório — fica registrado na auditoria"
          />
        </div>
      ) : null}
    </>
  );
}
