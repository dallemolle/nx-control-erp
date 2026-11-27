"use client";
// Espelhado na ajuda (src/ajuda/_titulos/cenas.tsx): mudou rótulo, campo ou botão? Ajuste a ajuda junto.

import { useEffect, useState } from "react";
import { useFormularioDaAcao } from "@/components/use-formulario-da-acao";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TipoTitulo } from "@prisma/client";
import { previaDaBaixa } from "@/lib/financeiro/previaDaBaixa";
import { registrarBaixaAction, type FormState } from "./actions";

const ESTADO_INICIAL: FormState = {};

/** Parcela aberta para baixa, com para quem se paga (ou de quem se recebe) e os dados bancários do cadastro. */
export type ParcelaParaBaixa = { id: string; saldoEmAberto: number; contraparte: string; dadosBancarios: string | null };
const CAMPOS_INICIAIS = { valorPago: "", valorJuros: "0", valorMulta: "0", valorDesconto: "0" };

export function BaixaDialog({
  tipo,
  parcela,
  contasBancarias,
  aberto,
  onOpenChange,
}: {
  tipo: TipoTitulo;
  parcela: ParcelaParaBaixa | null;
  contasBancarias: { id: string; nome: string; ativo?: boolean }[];
  aberto: boolean;
  onOpenChange: (aberto: boolean) => void;
}) {
  const action = registrarBaixaAction.bind(null, tipo, parcela?.id ?? "");
  const [state, formAction, pendente] = useFormularioDaAcao(action, ESTADO_INICIAL);
  const [campos, setCampos] = useState(CAMPOS_INICIAIS);
  const [parcelaDosCampos, setParcelaDosCampos] = useState(parcela?.id);
  if (parcelaDosCampos !== parcela?.id) {
    // Outra parcela: começa de novo, sem os valores da baixa anterior.
    setParcelaDosCampos(parcela?.id);
    setCampos(CAMPOS_INICIAIS);
  }
  const previa = parcela ? previaDaBaixa(parcela.saldoEmAberto, campos) : null;
  const campo = (nome: keyof typeof CAMPOS_INICIAIS) => ({
    value: campos[nome],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setCampos((c) => ({ ...c, [nome]: e.target.value })),
  });

  useEffect(() => {
    if (state.sucesso) onOpenChange(false);
  }, [state.sucesso, onOpenChange]);

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar baixa</DialogTitle>
        </DialogHeader>
        <form onSubmit={formAction} className="space-y-4">
          {parcela ? (
            <p className="text-sm">
              <span className="text-muted-foreground">{tipo === "PAGAR" ? "Pagar a" : "Receber de"}:</span>{" "}
              {parcela.contraparte}
              <span className="block break-all text-muted-foreground">
                {parcela.dadosBancarios ?? "Sem dados bancários no cadastro."}
              </span>
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="data">Data</Label>
              <Input id="data" name="data" type="date" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="valorPago">Valor pago</Label>
              <Input id="valorPago" name="valorPago" type="number" step="0.01" required {...campo("valorPago")} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="valorJuros">Juros</Label>
              <Input id="valorJuros" name="valorJuros" type="number" step="0.01" {...campo("valorJuros")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="valorMulta">Multa</Label>
              <Input id="valorMulta" name="valorMulta" type="number" step="0.01" {...campo("valorMulta")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="valorDesconto">Desconto</Label>
              <Input id="valorDesconto" name="valorDesconto" type="number" step="0.01" {...campo("valorDesconto")} />
            </div>
          </div>
          {previa ? (
            <p data-testid="previa-baixa" className={previa.erro ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
              {previa.texto}
            </p>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="contaBancariaId">Conta bancária</Label>
            <Select name="contaBancariaId">
              <SelectTrigger id="contaBancariaId" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {contasBancarias
                  .filter((opcao) => opcao.ativo !== false)
                  .map((opcao) => (
                    <SelectItem key={opcao.id} value={opcao.id}>
                      {opcao.nome}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          {state.erro ? <p className="text-sm text-destructive">{state.erro}</p> : null}
          <Button type="submit" className="w-full" disabled={pendente}>
            {pendente ? "Registrando..." : "Registrar baixa (fica pendente de aprovação)"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
