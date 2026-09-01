import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { listarBaixasPendentes } from "@/server/services/baixa";
import { aprovarBaixaAction } from "./actions";
import { RejeitarBaixaForm } from "./rejeitar-baixa-form";

export default async function AprovacoesPage() {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "titulo:aprovar");

  const pendentes = await listarBaixasPendentes(sessao.filialId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Aprovações pendentes</h1>
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
          {pendentes.map((baixa) => (
            <TableRow key={baixa.id}>
              <TableCell className="font-medium">{baixa.parcela.titulo.documento}</TableCell>
              <TableCell>
                {(baixa.parcela.titulo.fornecedor ?? baixa.parcela.titulo.cliente)?.nome}
              </TableCell>
              <TableCell>{Number(baixa.valorPago).toFixed(2)}</TableCell>
              <TableCell>{baixa.usuario.nome}</TableCell>
              <TableCell className="flex justify-end gap-2">
                <form action={aprovarBaixaAction}>
                  <input type="hidden" name="baixaId" value={baixa.id} />
                  <Button type="submit" size="sm">
                    Aprovar
                  </Button>
                </form>
                <RejeitarBaixaForm baixaId={baixa.id} />
              </TableCell>
            </TableRow>
          ))}
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
