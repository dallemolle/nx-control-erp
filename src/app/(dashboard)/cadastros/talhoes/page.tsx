import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission, podeEscreverCadastroProducao } from "@/server/auth/permissions";
import { listarTalhoes } from "@/server/services/talhao";
import { listarFrutas } from "@/server/services/fruta";
import { TalhaoDialogForm } from "./talhao-dialog-form";
import { alternarAtivoTalhaoAction } from "./actions";

export default async function TalhoesPage() {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "cadastro:ler");
  const podeEscrever = podeEscreverCadastroProducao(sessao.perfil, sessao.podeAlterarFilial);

  const [talhoes, frutasAtivas] = await Promise.all([
    listarTalhoes(sessao.filialId),
    listarFrutas(sessao.empresaId, { somenteAtivas: true }),
  ]);
  const frutas = frutasAtivas.map((f) => ({ id: f.id, nome: f.nome }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Talhões</h1>
          <p className="text-sm text-muted-foreground">Áreas de cultivo próprias da filial. Origem do fruto colhido.</p>
        </div>
        {podeEscrever && <TalhaoDialogForm frutas={frutas} />}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Cultura</TableHead>
            <TableHead className="text-right">Área (ha)</TableHead>
            <TableHead className="text-right">Plantio</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {talhoes.map((talhao) => (
            <TableRow key={talhao.id}>
              <TableCell className="font-medium">{talhao.nome}</TableCell>
              <TableCell>{talhao.fruta.nome}</TableCell>
              <TableCell className="text-right tabular-nums">
                {Number(talhao.areaHa).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </TableCell>
              <TableCell className="text-right tabular-nums">{talhao.anoPlantio ?? "—"}</TableCell>
              <TableCell>
                <Badge variant={talhao.ativo ? "default" : "secondary"}>{talhao.ativo ? "Ativo" : "Inativo"}</Badge>
              </TableCell>
              <TableCell className="flex justify-end gap-2">
                {podeEscrever && (
                  <>
                    <TalhaoDialogForm
                      frutas={frutas}
                      talhao={{
                        id: talhao.id,
                        nome: talhao.nome,
                        frutaId: talhao.frutaId,
                        areaHa: Number(talhao.areaHa),
                        anoPlantio: talhao.anoPlantio,
                        espacamento: talhao.espacamento,
                        observacao: talhao.observacao,
                      }}
                    />
                    <form action={alternarAtivoTalhaoAction}>
                      <input type="hidden" name="id" value={talhao.id} />
                      <input type="hidden" name="ativo" value={(!talhao.ativo).toString()} />
                      <Button type="submit" variant="outline" size="sm">
                        {talhao.ativo ? "Inativar" : "Reativar"}
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
