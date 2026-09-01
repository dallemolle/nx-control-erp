"use client";

import { useState, useTransition } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TipoTitulo } from "@prisma/client";
import { validarCsvAction, confirmarImportacaoAction } from "./actions";
import type { LinhaImportacao } from "@/server/services/importacaoTitulo";

export function ImportarCsvDialog({ tipo }: { tipo: TipoTitulo }) {
  const [aberto, setAberto] = useState(false);
  const [linhas, setLinhas] = useState<LinhaImportacao[]>([]);
  const [erro, setErro] = useState<string>();
  const [pendente, iniciarTransicao] = useTransition();

  async function lerArquivo(arquivo: File) {
    try {
      const conteudo = await arquivo.text();
      const resultado = await validarCsvAction(conteudo);
      setLinhas(resultado);
      setErro(undefined);
    } catch (falha) {
      // A action valida sessão/permissão e limita o tamanho do CSV — sem este catch
      // a rejeição some e o dialog fica em branco.
      setLinhas([]);
      setErro(falha instanceof Error ? falha.message : "Não foi possível ler o arquivo");
    }
  }

  function confirmar() {
    iniciarTransicao(async () => {
      const resultado = await confirmarImportacaoAction(tipo, linhas);
      if (resultado.erro) {
        setErro(resultado.erro);
        return;
      }
      setAberto(false);
      setLinhas([]);
    });
  }

  const temErro = linhas.some((linha) => linha.erros.length > 0);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant="outline" />}>Importar CSV</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar títulos via CSV</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            type="file"
            accept=".csv"
            onChange={(e) => e.target.files?.[0] && lerArquivo(e.target.files[0])}
          />
          {linhas.length > 0 && (
            <div className="max-h-64 overflow-y-auto text-sm space-y-1">
              {linhas.map((linha) => (
                <div key={linha.linha} className={linha.erros.length > 0 ? "text-destructive" : ""}>
                  Linha {linha.linha}: {linha.erros.length > 0 ? linha.erros.join("; ") : "OK"}
                </div>
              ))}
            </div>
          )}
          {erro ? <p className="text-sm text-destructive">{erro}</p> : null}
          <Button type="button" className="w-full" disabled={linhas.length === 0 || temErro || pendente} onClick={confirmar}>
            {pendente ? "Importando..." : "Confirmar importação"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
