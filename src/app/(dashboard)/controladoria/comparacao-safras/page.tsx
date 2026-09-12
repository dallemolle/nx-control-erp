import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission, podeEscreverOrcamento } from "@/server/auth/permissions";
import { listarComparativoSafras } from "@/server/services/orcamentoSafra";
import { LinhaSafraForm } from "./linha-safra-form";

export default async function ComparacaoSafrasPage() {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "orcamento:ler");

  const linhas = await listarComparativoSafras(sessao);
  const somenteLeitura = !podeEscreverOrcamento(sessao.perfil, sessao.podeAlterarFilial);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">Comparação entre safras</h1>
        <p className="text-sm text-muted-foreground">
          Orçado, realizado e projetado por safra — cada safra usa seu
          próprio período (início/fim), não o ano civil. Realizado usa
          apenas movimentações já conciliadas; projetado usa títulos em
          aberto.
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Safra</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Orçado</TableHead>
            <TableHead>Realizado</TableHead>
            <TableHead>Projetado</TableHead>
            <TableHead>Variação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.map((linha) => (
            <TableRow key={linha.safraId}>
              <TableCell className="font-medium">{linha.safraNome}</TableCell>
              <TableCell>{linha.status}</TableCell>
              <TableCell>
                <LinhaSafraForm safraId={linha.safraId} valorOrcado={linha.orcado} somenteLeitura={somenteLeitura} />
              </TableCell>
              <TableCell>{linha.realizado.toFixed(2)}</TableCell>
              <TableCell>{linha.projetado.toFixed(2)}</TableCell>
              <TableCell>
                {linha.variacaoAbsolutaRealizado.toFixed(2)}
                {linha.variacaoPercentualRealizado !== null
                  ? ` (${(linha.variacaoPercentualRealizado * 100).toFixed(1)}%)`
                  : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
