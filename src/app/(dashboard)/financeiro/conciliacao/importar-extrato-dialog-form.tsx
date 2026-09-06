// src/app/(dashboard)/financeiro/conciliacao/importar-extrato-dialog-form.tsx
"use client";

import { useState, useTransition } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { importarExtratoAction } from "./actions";

export function ImportarExtratoDialogForm({
  contasBancarias,
}: {
  contasBancarias: { id: string; nome: string }[];
}) {
  const [aberto, setAberto] = useState(false);
  const [contaBancariaId, setContaBancariaId] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState<string>();
  const [pendente, iniciarTransicao] = useTransition();

  function confirmar() {
    if (!contaBancariaId || !arquivo) return;
    iniciarTransicao(async () => {
      const resultado = await importarExtratoAction(contaBancariaId, arquivo);
      if (resultado.erro) {
        setErro(resultado.erro);
        return;
      }
      setAberto(false);
      setArquivo(null);
      setErro(undefined);
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant="outline" />}>Importar extrato (OFX)</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar extrato (OFX)</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="contaBancariaId">Conta bancária</Label>
            <Select value={contaBancariaId} onValueChange={(valor) => setContaBancariaId(valor ?? "")}>
              <SelectTrigger id="contaBancariaId" className="w-full">
                <SelectValue placeholder="Selecione a conta" />
              </SelectTrigger>
              <SelectContent>
                {contasBancarias.map((conta) => (
                  <SelectItem key={conta.id} value={conta.id}>
                    {conta.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="arquivo">Arquivo OFX</Label>
            <Input
              id="arquivo"
              type="file"
              accept=".ofx"
              onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            />
          </div>
          {erro ? <p className="text-sm text-destructive">{erro}</p> : null}
          <Button
            type="button"
            className="w-full"
            disabled={!contaBancariaId || !arquivo || pendente}
            onClick={confirmar}
          >
            {pendente ? "Importando..." : "Importar e conciliar automaticamente"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
