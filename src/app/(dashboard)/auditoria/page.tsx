import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { prisma } from "@/server/db/client";

function formatarData(data: Date) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" }).format(data);
}

export default async function AuditoriaPage() {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "auditoria:ler");

  const logs = await prisma.auditLog.findMany({
    where: { empresaId: sessao.empresaId },
    include: { usuario: true },
    orderBy: { criadoEm: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Auditoria</h1>
        <p className="text-sm text-muted-foreground">
          Últimas 200 alterações registradas nesta empresa.
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data/hora</TableHead>
            <TableHead>Usuário</TableHead>
            <TableHead>Entidade</TableHead>
            <TableHead>Ação</TableHead>
            <TableHead>Valor anterior</TableHead>
            <TableHead>Valor novo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell className="whitespace-nowrap text-xs">
                {formatarData(log.criadoEm)}
              </TableCell>
              <TableCell className="text-xs">{log.usuario?.nome ?? "—"}</TableCell>
              <TableCell className="text-xs">{log.entidade}</TableCell>
              <TableCell className="text-xs">{log.acao}</TableCell>
              <TableCell className="max-w-56 truncate text-xs text-muted-foreground">
                {log.valorAnterior ? JSON.stringify(log.valorAnterior) : "—"}
              </TableCell>
              <TableCell className="max-w-56 truncate text-xs text-muted-foreground">
                {log.valorNovo ? JSON.stringify(log.valorNovo) : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
