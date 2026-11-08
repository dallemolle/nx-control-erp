import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission, podeEscreverCadastroProducao } from "@/server/auth/permissions";
import { listarLocaisArmazenamento } from "@/server/services/localArmazenamento";
import { ROTULOS_TIPO_LOCAL } from "@/lib/schemas/enums";
import { LocalDialogForm } from "./local-dialog-form";
import { alternarAtivoLocalAction } from "./actions";

export default async function LocaisArmazenamentoPage() {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "cadastro:ler");
  const podeEscrever = podeEscreverCadastroProducao(sessao.perfil, sessao.podeAlterarFilial);

  const locais = await listarLocaisArmazenamento(sessao.filialId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Locais de armazenamento</h1>
          <p className="text-sm text-muted-foreground">Câmaras, freezers e áreas onde os lotes ficam guardados.</p>
        </div>
        {podeEscrever && <LocalDialogForm />}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Temperatura</TableHead>
            <TableHead className="text-right">Capacidade (kg)</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {locais.map((local) => {
            const capacidadeKg = local.capacidadeKg === null ? null : Number(local.capacidadeKg);
            return (
              <TableRow key={local.id}>
                <TableCell className="font-medium">{local.nome}</TableCell>
                <TableCell>{ROTULOS_TIPO_LOCAL[local.tipo]}</TableCell>
                <TableCell>{local.temperatura ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {capacidadeKg === null ? "—" : capacidadeKg.toLocaleString("pt-BR")}
                </TableCell>
                <TableCell>
                  <Badge variant={local.ativo ? "default" : "secondary"}>{local.ativo ? "Ativo" : "Inativo"}</Badge>
                </TableCell>
                <TableCell className="flex justify-end gap-2">
                  {podeEscrever && (
                    <>
                      <LocalDialogForm
                        local={{
                          id: local.id,
                          nome: local.nome,
                          tipo: local.tipo,
                          temperatura: local.temperatura,
                          capacidadeKg,
                        }}
                      />
                      <form action={alternarAtivoLocalAction}>
                        <input type="hidden" name="id" value={local.id} />
                        <input type="hidden" name="ativo" value={(!local.ativo).toString()} />
                        <Button type="submit" variant="outline" size="sm">
                          {local.ativo ? "Inativar" : "Reativar"}
                        </Button>
                      </form>
                    </>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
