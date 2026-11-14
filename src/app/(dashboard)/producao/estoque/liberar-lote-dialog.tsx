"use client";

import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatarData } from "@/lib/formatacao";
import {
  MSG_SEM_PRAZO_LIBERACAO,
  type SituacaoLiberacao,
} from "@/lib/producao/liberacaoVencido";
import {
  liberarLoteAction,
  revogarLiberacaoAction,
  type FormState,
} from "./actions";
import { useAcaoDoDialogo } from "../../_shared/use-acao-do-dialogo";

const ESTADO_INICIAL: FormState = {};

/** Libera o lote vencido até validade + N dias do produto (D-35). */
export function LiberarLoteDialog({
  lote,
  situacao,
  podeEditarProduto,
}: {
  lote: { id: string; codigo: string };
  situacao: SituacaoLiberacao;
  podeEditarProduto: boolean;
}) {
  const { aberto, setAberto, state, formAction, pendente } = useAcaoDoDialogo(
    liberarLoteAction,
    ESTADO_INICIAL,
  );

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        Liberar
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Liberar lote vencido {lote.codigo}</DialogTitle>
        </DialogHeader>
        {situacao.tipo === "PODE" ? (
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="loteId" value={lote.id} />
            <p className="text-sm">
              A movimentação ficará liberada até{" "}
              <strong>{formatarData(situacao.liberadoAte)}</strong> (validade +{" "}
              {situacao.dias} {situacao.dias === 1 ? "dia" : "dias"}).
            </p>
            <div className="space-y-2">
              <Label htmlFor={`motivo-liberacao-${lote.id}`}>Motivo</Label>
              <Input
                id={`motivo-liberacao-${lote.id}`}
                name="motivo"
                required
                minLength={3}
              />
            </div>
            {state.erro ? (
              <p className="text-sm text-destructive">{state.erro}</p>
            ) : null}
            <Button type="submit" className="w-full" disabled={pendente}>
              {pendente ? "Liberando..." : "Liberar"}
            </Button>
          </form>
        ) : situacao.tipo === "SEM_PRAZO" ? (
          <div className="space-y-3 text-sm">
            <p>{MSG_SEM_PRAZO_LIBERACAO}.</p>
            {podeEditarProduto ? (
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<Link href="/cadastros/produtos" />}
              >
                Editar produto
              </Button>
            ) : (
              <p className="text-muted-foreground">
                Peça a configuração a quem cadastra produtos.
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm">
            O prazo máximo de liberação deste lote terminou em{" "}
            {formatarData(situacao.limite)}.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Desfaz a liberação: o lote volta a ficar bloqueado em pedido e OP. */
export function RevogarLiberacaoDialog({
  lote,
  liberadoAte,
}: {
  lote: { id: string; codigo: string };
  liberadoAte: Date;
}) {
  const { aberto, setAberto, state, formAction, pendente } = useAcaoDoDialogo(
    revogarLiberacaoAction,
    ESTADO_INICIAL,
  );

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        Revogar
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revogar liberação do lote {lote.codigo}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="loteId" value={lote.id} />
          <p className="text-sm">
            A liberação até {formatarData(liberadoAte)} será desfeita e o lote
            volta a ficar bloqueado.
          </p>
          {state.erro ? (
            <p className="text-sm text-destructive">{state.erro}</p>
          ) : null}
          <Button
            type="submit"
            variant="destructive"
            className="w-full"
            disabled={pendente}
          >
            {pendente ? "Revogando..." : "Revogar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
