import { BotaoAjuda } from "@/components/ajuda/botao-ajuda";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { prisma } from "@/server/db/client";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeAlterarFilialAtiva, requirePermission } from "@/server/auth/permissions";
import { condicoesDaOperadora, listarOperadoras } from "@/server/services/operadoraCartao";
import { nomeDaContaBancaria } from "@/lib/contaBancaria";
import { ROTULOS_MODALIDADE_CARTAO } from "@/lib/schemas/enums";
import { OperadoraDialogForm } from "./operadora-dialog-form";
import { alternarAtivoOperadoraAction } from "./actions";

const TAXA = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 });
const dias = (n: number) => `${n} ${n === 1 ? "dia" : "dias"}`;

export default async function OperadorasCartaoPage() {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "cadastro:ler");
  const podeEscrever = podeAlterarFilialAtiva(sessao.perfil, sessao.podeAlterarFilial);

  const [operadoras, contas, categorias] = await Promise.all([
    listarOperadoras(sessao.filialId),
    prisma.contaBancaria.findMany({
      where: { filialId: sessao.filialId, ativo: true, tipo: { not: "CAIXA" } },
      include: { banco: { select: { nome: true } } },
      orderBy: { conta: "asc" },
    }),
    prisma.categoriaFinanceira.findMany({
      where: { filialId: sessao.filialId, ativo: true, tipo: "DESPESA" },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    }),
  ]);
  const opcoesContas = contas.map((c) => ({ id: c.id, rotulo: nomeDaContaBancaria(c) }));
  const opcoesCategorias = categorias.map((c) => ({ id: c.id, rotulo: c.nome }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-1">
            <h1 className="text-lg font-semibold">Operadoras de cartão</h1>
            <BotaoAjuda tela="operadoras-cartao" />
          </div>
          <p className="text-sm text-muted-foreground">
            Maquininhas da filial: onde depositam e a taxa e o prazo de cada modalidade.
          </p>
        </div>
        {podeEscrever ? <OperadoraDialogForm contas={opcoesContas} categorias={opcoesCategorias} /> : null}
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Conta de depósito</TableHead>
              <TableHead>Condições</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {operadoras.map((operadora) => {
              const condicoes = condicoesDaOperadora(operadora);
              return (
                <TableRow key={operadora.id}>
                  <TableCell className="font-medium">{operadora.nome}</TableCell>
                  <TableCell>{nomeDaContaBancaria(operadora.contaBancaria)}</TableCell>
                  <TableCell className="text-sm">
                    {condicoes.map((c, i) => (
                      <p key={i} className="whitespace-nowrap">
                        {ROTULOS_MODALIDADE_CARTAO[c.modalidade]}
                        {c.modalidade === "CREDITO_PARCELADO" ? ` ${c.parcelasDe}–${c.parcelasAte}x` : ""} ·{" "}
                        {TAXA.format(c.taxaPercentual)}% ·{" "}
                        {c.antecipado ? `antecipado em ${dias(c.prazoDias)}` : dias(c.prazoDias)}
                      </p>
                    ))}
                  </TableCell>
                  <TableCell>
                    <Badge variant={operadora.ativo ? "default" : "secondary"}>
                      {operadora.ativo ? "Ativa" : "Inativa"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {podeEscrever ? (
                      <div className="flex justify-end gap-2">
                        <OperadoraDialogForm
                          contas={opcoesContas}
                          categorias={opcoesCategorias}
                          operadora={{
                            id: operadora.id,
                            nome: operadora.nome,
                            cnpjCpf: operadora.fornecedor.cnpjCpf,
                            contaBancariaId: operadora.contaBancariaId,
                            categoriaTaxaId: operadora.categoriaTaxaId,
                            condicoes,
                          }}
                        />
                        <form action={alternarAtivoOperadoraAction}>
                          <input type="hidden" name="id" value={operadora.id} />
                          <input type="hidden" name="ativo" value={(!operadora.ativo).toString()} />
                          <Button type="submit" variant="outline" size="sm">
                            {operadora.ativo ? "Inativar" : "Reativar"}
                          </Button>
                        </form>
                      </div>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {operadoras.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma operadora cadastrada nesta filial.</p>
      ) : null}
    </div>
  );
}
