import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { listarUsuariosDaEmpresa } from "@/server/services/usuario";
import { listarAcessosFiliaisDoUsuario } from "@/server/services/usuarioEmpresaFilial";
import { NovoUsuarioDialog } from "./novo-usuario-dialog";
import { PerfilForm } from "./perfil-form";
import { AcessoFilialForm } from "./acesso-filial-form";
import { alternarAtivoUsuarioAction } from "./actions";

export default async function UsuariosPage() {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "usuario:gerenciar");

  const vinculos = await listarUsuariosDaEmpresa(sessao.empresaId);
  const acessosPorUsuario = await Promise.all(
    vinculos.map(async (vinculo) => ({
      usuarioId: vinculo.usuarioId,
      filiais: await listarAcessosFiliaisDoUsuario(sessao, vinculo.usuarioId),
    })),
  );

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

      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Acesso por filial</h2>
          <p className="text-sm text-muted-foreground">
            Defina quais filiais cada usuário pode ler e alterar.
          </p>
        </div>
        {acessosPorUsuario.map(({ usuarioId, filiais }) => {
          const vinculo = vinculos.find((item) => item.usuarioId === usuarioId)!;
          return (
            <Card key={usuarioId}>
              <CardHeader>
                <CardTitle>{vinculo.usuario.nome}</CardTitle>
                <CardDescription>{vinculo.usuario.email}</CardDescription>
              </CardHeader>
              <CardContent>
                {filiais.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma filial ativa cadastrada.</p>
                ) : (
                  <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-6 gap-y-1">
                    <div className="text-xs font-medium text-muted-foreground">Filial</div>
                    <div className="text-xs font-medium text-muted-foreground">Leitura</div>
                    <div className="text-xs font-medium text-muted-foreground">Alteração</div>
                    {filiais.map((filial) => (
                      <AcessoFilialForm
                        key={filial.id}
                        usuarioId={usuarioId}
                        filialId={filial.id}
                        filialNome={filial.nome}
                        temAcesso={filial.usuariosFiliais[0]?.ativo ?? false}
                        podeAlterar={filial.usuariosFiliais[0]?.podeAlterar ?? false}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
