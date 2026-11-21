// Espelhado na ajuda (src/ajuda/aprovacoes/cenas.tsx): mudou rótulo, coluna ou botão? Ajuste a ajuda junto.

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { exigeAprovacaoPorOutro, listarBaixasPendentes } from "@/server/services/baixa";
import { aprovarBaixaAction } from "./actions";
import { RejeitarBaixaForm } from "./rejeitar-baixa-form";
import { AvisosDaBaixa, DetalheDoValor } from "./partes-da-linha";
import { avisosDaBaixa, resumirBaixasDaParcela } from "@/lib/financeiro/avisosDaBaixa";
import { nomeDaContaBancaria } from "@/lib/contaBancaria";
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formatacao";
import { hojeDeCalendario } from "@/lib/producao/periodo";
import { BotaoAjuda } from "@/components/ajuda/botao-ajuda";

export default async function AprovacoesPage() {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "titulo:aprovar");

  const [pendentes, exigeOutraPessoa] = await Promise.all([
    listarBaixasPendentes(sessao.filialId),
    exigeAprovacaoPorOutro(sessao.empresaId),
  ]);
  const hoje = hojeDeCalendario();

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-1">
          <h1 className="text-lg font-semibold">Aprovações pendentes</h1>
          <BotaoAjuda tela="aprovacoes" />
        </div>
        <p className="text-sm text-muted-foreground">Baixas registradas aguardando aprovação de tesouraria.</p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Título</TableHead>
            <TableHead>Baixa</TableHead>
            <TableHead>Valor</TableHead>
            <TableHead>Registrado por</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pendentes.map((baixa) => {
            const titulo = baixa.parcela.titulo;
            const contraparte = titulo.fornecedor ?? titulo.cliente;
            const lista = titulo.tipo === "PAGAR" ? "contas-a-pagar" : "contas-a-receber";
            const bloqueada = exigeOutraPessoa && baixa.usuarioId === sessao.usuarioId;
            const valores = {
              valorPago: Number(baixa.valorPago),
              valorJuros: Number(baixa.valorJuros),
              valorMulta: Number(baixa.valorMulta),
              valorDesconto: Number(baixa.valorDesconto),
            };
            const valorParcela = Number(baixa.parcela.valorAtualizado);
            const avisos = avisosDaBaixa({
              tipoTitulo: titulo.tipo,
              data: baixa.data,
              criadoEm: baixa.criadoEm,
              ...valores,
              valorParcela,
              ...resumirBaixasDaParcela(
                baixa.id,
                baixa.parcela.baixas.map((b) => ({
                  id: b.id,
                  valorPago: Number(b.valorPago),
                  statusAprovacao: b.statusAprovacao,
                })),
              ),
              hoje,
            });
            return (
              <TableRow key={baixa.id} className="align-top">
                <TableCell>
                  <p className="font-medium">{titulo.documento}</p>
                  {contraparte ? (
                    <Link
                      href={`/financeiro/${lista}?contraparte=${contraparte.id}`}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      {contraparte.nome}
                    </Link>
                  ) : (
                    <p>—</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {titulo.tipo === "PAGAR" ? "Pagamento" : "Recebimento"} · parcela {baixa.parcela.numero}/
                    {titulo._count.parcelas}
                  </p>
                  <AvisosDaBaixa avisos={avisos} />
                </TableCell>
                <TableCell>
                  <p>{formatarData(baixa.data)}</p>
                  <p className="text-xs text-muted-foreground">{nomeDaContaBancaria(baixa.contaBancaria)}</p>
                </TableCell>
                <TableCell>
                  <p className="font-medium">{formatarMoeda(valores.valorPago)}</p>
                  <DetalheDoValor
                    valorParcela={valorParcela}
                    valorJuros={valores.valorJuros}
                    valorMulta={valores.valorMulta}
                    valorDesconto={valores.valorDesconto}
                  />
                </TableCell>
                <TableCell>
                  {baixa.usuario.nome}
                  <p className="text-xs text-muted-foreground">{formatarDataHora(baixa.criadoEm)}</p>
                  {bloqueada && (
                    <p className="max-w-48 whitespace-normal text-xs text-muted-foreground">
                      Registrada por você: outra pessoa precisa aprovar
                    </p>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <form action={aprovarBaixaAction}>
                      <input type="hidden" name="baixaId" value={baixa.id} />
                      <Button type="submit" size="sm" disabled={bloqueada}>
                        Aprovar
                      </Button>
                    </form>
                    <RejeitarBaixaForm baixaId={baixa.id} />
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
          {pendentes.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                Nenhuma baixa pendente.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
