import Link from "next/link";
import { prisma } from "@/server/db/client";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar, requirePermission } from "@/server/auth/permissions";
import { obterConfiguracaoProducao } from "@/server/services/configuracaoProducao";
import { lotesParaVenda, MSG_SEM_CATEGORIA_VENDA } from "@/server/services/pedidoVenda";
import { hojeDeCalendario, paraDataIso } from "@/lib/producao/periodo";
import { nomeDaContaBancaria } from "@/lib/contaBancaria";
import { PedidoForm, type OpcoesPedido } from "./pedido-form";

export default async function NovoPedidoPage() {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "venda:escrever");

  if (!sessao.podeAlterarFilial) {
    return (
      <div className="space-y-2">
        <h1 className="text-lg font-semibold">Novo pedido</h1>
        <p className="text-sm text-muted-foreground">Você não tem permissão de alteração nesta filial.</p>
      </div>
    );
  }

  const hoje = hojeDeCalendario();
  const [clientes, contas, lotes, configuracao] = await Promise.all([
    prisma.cliente.findMany({
      where: { empresaId: sessao.empresaId, ativo: true },
      select: {
        id: true,
        nome: true,
        canalVenda: true,
        classificacaoFiscalPadrao: true,
        enderecoEntrega: true,
        retiraNaPropriedade: true,
      },
      orderBy: { nome: "asc" },
    }),
    prisma.contaBancaria.findMany({
      where: { filialId: sessao.filialId, ativo: true },
      include: { banco: { select: { nome: true } } },
      orderBy: [{ tipo: "asc" }, { conta: "asc" }],
    }),
    lotesParaVenda(sessao.filialId, hoje),
    obterConfiguracaoProducao(sessao.filialId),
  ]);

  const opcoes: OpcoesPedido = {
    hoje: paraDataIso(hoje),
    clientes,
    contas: contas.map((c) => ({ id: c.id, tipo: c.tipo, rotulo: nomeDaContaBancaria(c) })),
    lotes: lotes.map((l) => ({ ...l, validade: paraDataIso(l.validade) })),
    contaCaixaPadraoId: configuracao.contaCaixaPadraoId,
    contaRecebimentoPadraoId: configuracao.contaRecebimentoPadraoId,
    podeLiberarVencido: podeExecutar(sessao.perfil, "venda:liberarVencido"),
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Novo pedido</h1>
        <p className="text-sm text-muted-foreground">
          Os lotes aparecem na ordem de saída (vence primeiro, sai primeiro).
        </p>
      </div>
      {!configuracao.categoriaVendaId ? (
        <p className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">
          {MSG_SEM_CATEGORIA_VENDA}
          {podeExecutar(sessao.perfil, "producao:configurar") ? (
            <>
              {" "}
              ·{" "}
              <Link href="/configuracao-producao" className="underline underline-offset-4">
                Abrir configuração
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
      <PedidoForm opcoes={opcoes} />
    </div>
  );
}
