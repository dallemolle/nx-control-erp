// Espelhado na ajuda (src/ajuda/aprovacoes/cenas.tsx): mudou rótulo, coluna ou botão? Ajuste a ajuda junto.

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { exigeAprovacaoPorOutro, listarBaixasPendentes } from "@/server/services/baixa";
import { aprovarBaixaAction } from "./actions";
import { RejeitarBaixaForm } from "./rejeitar-baixa-form";
import { formatarMoeda } from "@/lib/formatacao";
import { BotaoAjuda } from "@/components/ajuda/botao-ajuda";

export default async function AprovacoesPage() {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "titulo:aprovar");

  const [pendentes, exigeOutraPessoa] = await Promise.all([
    listarBaixasPendentes(sessao.filialId),
    exigeAprovacaoPorOutro(sessao.empresaId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-1">
          <h1 className="text-lg font-semibold">Aprovações pendentes</h1>
          <BotaoAjuda tela="aprovacoes" />
        </div>
        <p className="text-sm text-muted-foreground">Baixas registradas aguardando aprovação de tesouraria.</p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Documento</TableHead>
            <TableHead>Contraparte</TableHead>
            <TableHead>Valor pago</TableHead>
            <TableHead>Registrado por</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pendentes.map((baixa) => {
            const bloqueada = exigeOutraPessoa && baixa.usuarioId === sessao.usuarioId;
            return (
              <TableRow key={baixa.id}>
                <TableCell className="font-medium">{baixa.parcela.titulo.documento}</TableCell>
                <TableCell>
                  {(baixa.parcela.titulo.fornecedor ?? baixa.parcela.titulo.cliente)?.nome}
                </TableCell>
                <TableCell>{formatarMoeda(baixa.valorPago)}</TableCell>
                <TableCell>
                  {baixa.usuario.nome}
                  {bloqueada && (
                    <p className="max-w-48 whitespace-normal text-xs text-muted-foreground">
                      Registrada por você: outra pessoa precisa aprovar
                    </p>
                  )}
                </TableCell>
                <TableCell className="flex justify-end gap-2">
                  <form action={aprovarBaixaAction}>
                    <input type="hidden" name="baixaId" value={baixa.id} />
                    <Button type="submit" size="sm" disabled={bloqueada}>
                      Aprovar
                    </Button>
                  </form>
                  <RejeitarBaixaForm baixaId={baixa.id} />
                </TableCell>
              </TableRow>
            );
          })}
          {pendentes.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                Nenhuma baixa pendente.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
