"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listarAnexosAction, adicionarAnexoAction, removerAnexoAction } from "./actions";

type Anexo = { id: string; nomeArquivo: string };

export function AnexosPanel({ tituloId, podeEscrever }: { tituloId: string; podeEscrever: boolean }) {
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [pendente, iniciarTransicao] = useTransition();

  useEffect(() => {
    listarAnexosAction(tituloId).then((lista) => {
      setAnexos(lista);
      setCarregado(true);
    });
  }, [tituloId]);

  function enviarArquivo(arquivo: File) {
    iniciarTransicao(async () => {
      await adicionarAnexoAction(tituloId, arquivo);
      setAnexos(await listarAnexosAction(tituloId));
    });
  }

  function remover(anexoId: string) {
    iniciarTransicao(async () => {
      await removerAnexoAction(anexoId);
      setAnexos(await listarAnexosAction(tituloId));
    });
  }

  if (!carregado) return null;

  return (
    <div className="pl-8 py-2 space-y-2 text-sm">
      <div className="font-medium text-muted-foreground">Anexos</div>
      {anexos.map((anexo) => (
        <div key={anexo.id} className="flex items-center gap-2">
          {/* Blobs são privados: o download passa pela rota autenticada, não pela URL do blob. */}
          <a href={`/api/anexos/${anexo.id}`} target="_blank" rel="noreferrer" className="underline">
            {anexo.nomeArquivo}
          </a>
          {podeEscrever && (
            <Button type="button" variant="outline" size="sm" disabled={pendente} onClick={() => remover(anexo.id)}>
              Remover
            </Button>
          )}
        </div>
      ))}
      {podeEscrever && (
        <Input
          type="file"
          disabled={pendente}
          onChange={(e) => e.target.files?.[0] && enviarArquivo(e.target.files[0])}
        />
      )}
    </div>
  );
}
