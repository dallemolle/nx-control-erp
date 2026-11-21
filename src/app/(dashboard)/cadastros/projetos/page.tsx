import { BotaoAjuda } from "@/components/ajuda/botao-ajuda";
import { Badge } from "@/components/ui/badge";
import { ROTULOS_STATUS_SAFRA_PROJETO } from "@/lib/schemas/enums";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission, podeAlterarFilialAtiva } from "@/server/auth/permissions";
import { listarProjetos } from "@/server/services/projeto";
import { ProjetoDialogForm } from "./projeto-dialog-form";
import { alternarAtivoProjetoAction } from "./actions";

export default async function ProjetosPage() {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "cadastro:ler");
  const podeEscrever = podeAlterarFilialAtiva(sessao.perfil, sessao.podeAlterarFilial);

  const projetos = await listarProjetos(sessao.filialId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-1">
            <h1 className="text-lg font-semibold">Projetos</h1>
            <BotaoAjuda tela="projetos" />
          </div>
          <p className="text-sm text-muted-foreground">Cadastro de projetos da filial.</p>
        </div>
        {podeEscrever && <ProjetoDialogForm />}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Nome</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Ativo</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projetos.map((projeto) => (
            <TableRow key={projeto.id}>
              <TableCell>{projeto.codigo}</TableCell>
              <TableCell className="font-medium">{projeto.nome}</TableCell>
              <TableCell>{ROTULOS_STATUS_SAFRA_PROJETO[projeto.status]}</TableCell>
              <TableCell>
                <Badge variant={projeto.ativo ? "default" : "secondary"}>
                  {projeto.ativo ? "Ativo" : "Inativo"}
                </Badge>
              </TableCell>
              <TableCell className="flex justify-end gap-2">
                {podeEscrever && (
                  <>
                    <ProjetoDialogForm projeto={projeto} />
                    <form action={alternarAtivoProjetoAction}>
                      <input type="hidden" name="id" value={projeto.id} />
                      <input type="hidden" name="ativo" value={(!projeto.ativo).toString()} />
                      <Button type="submit" variant="outline" size="sm">
                        {projeto.ativo ? "Inativar" : "Reativar"}
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
