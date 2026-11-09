import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission, podeEscreverCadastroProducao } from "@/server/auth/permissions";
import { listarInsumos } from "@/server/services/insumo";
import { formatarMoeda } from "@/lib/formatacao";
import { InsumoDialogForm } from "./insumo-dialog-form";
import { alternarAtivoInsumoAction } from "./actions";

export default async function InsumosPage() {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "cadastro:ler");
  const podeEscrever = podeEscreverCadastroProducao(sessao.perfil, sessao.podeAlterarFilial);

  const insumos = await listarInsumos(sessao.empresaId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Insumos</h1>
          <p className="text-sm text-muted-foreground">
            Embalagens, energia e mão de obra usadas no processamento. O custo aqui é a referência; cada ordem de
            produção grava o custo do dia.
          </p>
        </div>
        {podeEscrever && <InsumoDialogForm />}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Unidade</TableHead>
            <TableHead className="text-right">Custo unitário</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {insumos.map((insumo) => (
            <TableRow key={insumo.id}>
              <TableCell className="font-medium">{insumo.nome}</TableCell>
              <TableCell>{insumo.unidade}</TableCell>
              <TableCell className="text-right tabular-nums">{formatarMoeda(insumo.custoUnitario)}</TableCell>
              <TableCell>
                <Badge variant={insumo.ativo ? "default" : "secondary"}>{insumo.ativo ? "Ativo" : "Inativo"}</Badge>
              </TableCell>
              <TableCell className="flex justify-end gap-2">
                {podeEscrever && (
                  <>
                    <InsumoDialogForm
                      insumo={{
                        id: insumo.id,
                        nome: insumo.nome,
                        unidade: insumo.unidade,
                        custoUnitario: Number(insumo.custoUnitario),
                      }}
                    />
                    <form action={alternarAtivoInsumoAction}>
                      <input type="hidden" name="id" value={insumo.id} />
                      <input type="hidden" name="ativo" value={(!insumo.ativo).toString()} />
                      <Button type="submit" variant="outline" size="sm">
                        {insumo.ativo ? "Inativar" : "Reativar"}
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
