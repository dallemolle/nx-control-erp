import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission, podeAlterarFilialAtiva } from "@/server/auth/permissions";
import { listarCategoriasFinanceiras } from "@/server/services/categoriaFinanceira";
import { CategoriaFinanceiraDialogForm } from "./categoria-financeira-dialog-form";
import { alternarAtivoCategoriaFinanceiraAction } from "./actions";

export default async function CategoriasFinanceirasPage() {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "cadastro:ler");
  const podeEscrever = podeAlterarFilialAtiva(sessao.perfil, sessao.podeAlterarFilial);

  const categorias = await listarCategoriasFinanceiras(sessao.filialId);
  const nomePorId = new Map(categorias.map((categoria) => [categoria.id, categoria]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Categorias financeiras</h1>
          <p className="text-sm text-muted-foreground">
            Estrutura hierárquica de receitas e despesas.
          </p>
        </div>
        {podeEscrever && <CategoriaFinanceiraDialogForm opcoesPai={categorias} />}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Pai</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {categorias.map((categoria) => (
            <TableRow key={categoria.id}>
              <TableCell className="font-medium">{categoria.nome}</TableCell>
              <TableCell>
                <Badge variant={categoria.tipo === "RECEITA" ? "default" : "secondary"}>
                  {categoria.tipo}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {categoria.parentId ? nomePorId.get(categoria.parentId)?.nome : "—"}
              </TableCell>
              <TableCell>
                <Badge variant={categoria.ativo ? "default" : "secondary"}>
                  {categoria.ativo ? "Ativo" : "Inativo"}
                </Badge>
              </TableCell>
              <TableCell className="flex justify-end gap-2">
                {podeEscrever && (
                  <>
                    <CategoriaFinanceiraDialogForm categoria={categoria} opcoesPai={categorias} />
                    <form action={alternarAtivoCategoriaFinanceiraAction}>
                      <input type="hidden" name="id" value={categoria.id} />
                      <input type="hidden" name="ativo" value={(!categoria.ativo).toString()} />
                      <Button type="submit" variant="outline" size="sm">
                        {categoria.ativo ? "Inativar" : "Reativar"}
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
