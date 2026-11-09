import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission, podeEscreverCadastroProducao } from "@/server/auth/permissions";
import { listarProdutos } from "@/server/services/produto";
import { listarFrutas } from "@/server/services/fruta";
import { formatarMoeda } from "@/lib/formatacao";
import { ROTULOS_CATEGORIA_PRODUTO, ROTULOS_CONSERVACAO } from "@/lib/schemas/enums";
import { ProdutoDialogForm } from "./produto-dialog-form";
import { alternarAtivoProdutoAction } from "./actions";

function numeroOuNulo(valor: { toString(): string } | null): number | null {
  return valor === null ? null : Number(valor);
}

export default async function ProdutosPage() {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "cadastro:ler");
  const podeEscrever = podeEscreverCadastroProducao(sessao.perfil, sessao.podeAlterarFilial);

  const [produtos, frutasAtivas] = await Promise.all([
    listarProdutos(sessao.empresaId),
    listarFrutas(sessao.empresaId, { somenteAtivas: true }),
  ]);
  const frutas = frutasAtivas.map((f) => ({ id: f.id, nome: f.nome }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Produtos</h1>
          <p className="text-sm text-muted-foreground">
            Frutos e polpas vendidos ou estocados. O código vira o início do número de lote.
          </p>
        </div>
        {podeEscrever && <ProdutoDialogForm frutas={frutas} />}
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Fruta</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Conservação</TableHead>
              <TableHead className="text-right">Validade</TableHead>
              <TableHead className="text-right">Preço ref. (R$/kg)</TableHead>
              <TableHead>Unidade comercial</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {produtos.map((produto) => (
              <TableRow key={produto.id}>
                <TableCell className="font-medium">{produto.codigo}</TableCell>
                <TableCell>{produto.descricao}</TableCell>
                <TableCell>{produto.fruta.nome}</TableCell>
                <TableCell>{ROTULOS_CATEGORIA_PRODUTO[produto.categoria]}</TableCell>
                <TableCell>{ROTULOS_CONSERVACAO[produto.conservacao]}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {produto.validadeDias} {produto.validadeDias === 1 ? "dia" : "dias"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {produto.precoReferenciaKg === null ? "—" : formatarMoeda(produto.precoReferenciaKg)}
                </TableCell>
                <TableCell>
                  {produto.unidadeComercial && produto.fatorUnidadeKg !== null
                    ? `${produto.unidadeComercial} = ${Number(produto.fatorUnidadeKg).toLocaleString("pt-BR")} kg`
                    : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={produto.ativo ? "default" : "secondary"}>
                    {produto.ativo ? "Ativo" : "Inativo"}
                  </Badge>
                </TableCell>
                <TableCell className="flex justify-end gap-2">
                  {podeEscrever && (
                    <>
                      <ProdutoDialogForm
                        frutas={frutas}
                        produto={{
                          id: produto.id,
                          codigo: produto.codigo,
                          descricao: produto.descricao,
                          categoria: produto.categoria,
                          frutaId: produto.frutaId,
                          conservacao: produto.conservacao,
                          validadeDias: produto.validadeDias,
                          precoReferenciaKg: numeroOuNulo(produto.precoReferenciaKg),
                          armazenamento: produto.armazenamento,
                          unidadeComercial: produto.unidadeComercial,
                          fatorUnidadeKg: numeroOuNulo(produto.fatorUnidadeKg),
                        }}
                      />
                      <form action={alternarAtivoProdutoAction}>
                        <input type="hidden" name="id" value={produto.id} />
                        <input type="hidden" name="ativo" value={(!produto.ativo).toString()} />
                        <Button type="submit" variant="outline" size="sm">
                          {produto.ativo ? "Inativar" : "Reativar"}
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
    </div>
  );
}
