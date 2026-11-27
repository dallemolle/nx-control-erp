import { BotaoAjuda } from "@/components/ajuda/botao-ajuda";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission, podeAlterarFilialAtiva } from "@/server/auth/permissions";
import { listarBancos } from "@/server/services/banco";
import { listarContasBancarias } from "@/server/services/contaBancaria";
import { ROTULOS_TIPO_CONTA_BANCARIA } from "@/lib/schemas/enums";
import { formatarMoeda } from "@/lib/formatacao";
import { ContaBancariaDialogForm } from "./conta-bancaria-dialog-form";
import { alternarAtivoContaBancariaAction } from "./actions";
import { BotaoAlternarAtivo } from "../../_shared/botao-alternar-ativo";

export default async function ContasBancariasPage() {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "cadastro:ler");
  const podeEscrever = podeAlterarFilialAtiva(sessao.perfil, sessao.podeAlterarFilial);

  const [bancos, contas] = await Promise.all([
    listarBancos(),
    listarContasBancarias(sessao.filialId),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-1">
            <h1 className="text-lg font-semibold">Contas bancárias</h1>
            <BotaoAjuda tela="contas-bancarias" />
          </div>
          <p className="text-sm text-muted-foreground">Contas bancárias e caixas (dinheiro em espécie) da filial.</p>
        </div>
        {podeEscrever && <ContaBancariaDialogForm bancos={bancos} />}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Banco</TableHead>
            <TableHead>Agência</TableHead>
            <TableHead>Conta</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Moeda</TableHead>
            <TableHead className="text-right">Saldo inicial</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {contas.map((conta) => (
            <TableRow key={conta.id}>
              <TableCell className="font-medium">
                {conta.tipo === "CAIXA" ? conta.banco.nome : `${conta.banco.codigo} · ${conta.banco.nome}`}
              </TableCell>
              <TableCell>{conta.tipo === "CAIXA" ? "—" : conta.agencia}</TableCell>
              <TableCell>{conta.conta}</TableCell>
              <TableCell>{ROTULOS_TIPO_CONTA_BANCARIA[conta.tipo]}</TableCell>
              <TableCell>{conta.moeda}</TableCell>
              <TableCell className="text-right tabular-nums">{formatarMoeda(conta.saldoInicial)}</TableCell>
              <TableCell>
                <Badge variant={conta.ativo ? "default" : "secondary"}>
                  {conta.ativo ? "Ativo" : "Inativo"}
                </Badge>
              </TableCell>
              <TableCell className="flex justify-end gap-2">
                {podeEscrever && (
                  <>
                    <ContaBancariaDialogForm
                      conta={{ ...conta, saldoInicial: Number(conta.saldoInicial) }}
                      bancos={bancos}
                    />
                    <BotaoAlternarAtivo
                      id={conta.id}
                      ativo={conta.ativo}
                      action={alternarAtivoContaBancariaAction}
                    />
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
