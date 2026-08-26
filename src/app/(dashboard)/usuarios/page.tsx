import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { listarUsuariosDaEmpresa } from "@/server/services/usuario";
import { NovoUsuarioDialog } from "./novo-usuario-dialog";
import { PerfilForm } from "./perfil-form";
import { alternarAtivoUsuarioAction } from "./actions";

export default async function UsuariosPage() {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "usuario:gerenciar");

  const vinculos = await listarUsuariosDaEmpresa(sessao.empresaId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Usuários</h1>
          <p className="text-sm text-muted-foreground">
            Pessoas com acesso a esta empresa e o perfil de cada uma.
          </p>
        </div>
        <NovoUsuarioDialog />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Perfil</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {vinculos.map((vinculo) => (
            <TableRow key={vinculo.id}>
              <TableCell className="font-medium">{vinculo.usuario.nome}</TableCell>
              <TableCell>{vinculo.usuario.email}</TableCell>
              <TableCell>
                <PerfilForm usuarioId={vinculo.usuarioId} perfil={vinculo.perfil} />
              </TableCell>
              <TableCell>
                <Badge variant={vinculo.ativo ? "default" : "secondary"}>
                  {vinculo.ativo ? "Ativo" : "Inativo"}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <form action={alternarAtivoUsuarioAction}>
                  <input type="hidden" name="usuarioId" value={vinculo.usuarioId} />
                  <input type="hidden" name="ativo" value={(!vinculo.ativo).toString()} />
                  <Button type="submit" variant="outline" size="sm">
                    {vinculo.ativo ? "Desativar" : "Reativar"}
                  </Button>
                </form>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
