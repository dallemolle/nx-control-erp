"use client";

import { useRef, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { atualizarAcessoFilialAction } from "./actions";

export function AcessoFilialForm({
  usuarioId,
  filialId,
  filialNome,
  temAcesso,
  podeAlterar,
}: {
  usuarioId: string;
  filialId: string;
  filialNome: string;
  temAcesso: boolean;
  podeAlterar: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [leitura, setLeitura] = useState(temAcesso);

  return (
    <form ref={formRef} action={atualizarAcessoFilialAction} className="contents">
      <input type="hidden" name="usuarioId" value={usuarioId} />
      <input type="hidden" name="filialId" value={filialId} />
      <div className="py-1.5 text-sm">{filialNome}</div>
      <div className="py-1.5">
        <Checkbox
          name="temAcesso"
          value="true"
          defaultChecked={temAcesso}
          aria-label={`Leitura em ${filialNome}`}
          onCheckedChange={(checked) => {
            setLeitura(checked);
            formRef.current?.requestSubmit();
          }}
        />
      </div>
      <div className="py-1.5">
        <Checkbox
          name="podeAlterar"
          value="true"
          defaultChecked={podeAlterar}
          disabled={!leitura}
          aria-label={`Alteração em ${filialNome}`}
          onCheckedChange={() => formRef.current?.requestSubmit()}
        />
      </div>
    </form>
  );
}
