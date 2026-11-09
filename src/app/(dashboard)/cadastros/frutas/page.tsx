import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission, podeEscreverCadastroProducao } from "@/server/auth/permissions";
import { listarFrutas } from "@/server/services/fruta";
import { formatarMoeda } from "@/lib/formatacao";
import { FrutaDialogForm } from "./fruta-dialog-form";
import { alternarAtivoFrutaAction } from "./actions";

export default async function FrutasPage() {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "cadastro:ler");
  const podeEscrever = podeEscreverCadastroProducao(sessao.perfil, sessao.podeAlterarFilial);

  const frutas = await listarFrutas(sessao.empresaId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Frutas</h1>
          <p className="text-sm text-muted-foreground">
            Frutas trabalhadas pela empresa. O custo-padrão é usado no fruto colhido nos talhões próprios.
          </p>
        </div>
        {podeEscrever && <FrutaDialogForm />}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead className="text-right">Custo-padrão (R$/kg)</TableHead>
            <TableHead>Branqueamento</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {frutas.map((fruta) => (
            <TableRow key={fruta.id}>
              <TableCell className="font-medium">{fruta.nome}</TableCell>
              <TableCell className="text-right tabular-nums">{formatarMoeda(fruta.custoPadraoKg)}</TableCell>
              <TableCell>{fruta.exigeBranqueamento ? "Exige" : "—"}</TableCell>
              <TableCell>
                <Badge variant={fruta.ativo ? "default" : "secondary"}>{fruta.ativo ? "Ativo" : "Inativo"}</Badge>
              </TableCell>
              <TableCell className="flex justify-end gap-2">
                {podeEscrever && (
                  <>
                    <FrutaDialogForm fruta={{ ...fruta, custoPadraoKg: Number(fruta.custoPadraoKg) }} />
                    <form action={alternarAtivoFrutaAction}>
                      <input type="hidden" name="id" value={fruta.id} />
                      <input type="hidden" name="ativo" value={(!fruta.ativo).toString()} />
                      <Button type="submit" variant="outline" size="sm">
                        {fruta.ativo ? "Inativar" : "Reativar"}
                      </Button>
                    </form>
                  </>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
