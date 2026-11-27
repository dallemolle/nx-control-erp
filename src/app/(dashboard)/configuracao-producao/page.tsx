import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission, podeConfigurarProducao } from "@/server/auth/permissions";
import {
  obterConfiguracaoProducao,
  referenciasInativasDaConfiguracao,
} from "@/server/services/configuracaoProducao";
import { prisma } from "@/server/db/client";
import { nomeDaContaBancaria } from "@/lib/contaBancaria";
import { BotaoAjuda } from "@/components/ajuda/botao-ajuda";
import { ConfiguracaoForm } from "./configuracao-form";

/** Ativos, mais o inativo já escolhido (para não aparecer o código no campo). */
function ativosOuEscolhidos(filialId: string, escolhidos: (string | null)[]) {
  const ids = escolhidos.filter((id) => id !== null);
  return { filialId, OR: [{ ativo: true }, { id: { in: ids } }] };
}

const comMarca = (nome: string, ativo: boolean) => (ativo ? nome : `${nome} (inativa)`);

export default async function ConfiguracaoProducaoPage() {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "producao:configurar");
  const somenteLeitura = !podeConfigurarProducao(sessao.perfil, sessao.podeAlterarFilial);

  const valores = await obterConfiguracaoProducao(sessao.filialId);
  const categoriasEscolhidas = ativosOuEscolhidos(sessao.filialId, [
    valores.categoriaCompraFrutoId,
    valores.categoriaVendaId,
  ]);
  const [categoriasDespesa, categoriasReceita, contas, inativas] = await Promise.all([
    prisma.categoriaFinanceira.findMany({
      where: { ...categoriasEscolhidas, tipo: "DESPESA" },
      select: { id: true, nome: true, ativo: true },
      orderBy: { nome: "asc" },
    }),
    prisma.categoriaFinanceira.findMany({
      where: { ...categoriasEscolhidas, tipo: "RECEITA" },
      select: { id: true, nome: true, ativo: true },
      orderBy: { nome: "asc" },
    }),
    prisma.contaBancaria.findMany({
      where: ativosOuEscolhidos(sessao.filialId, [valores.contaRecebimentoPadraoId, valores.contaCaixaPadraoId]),
      include: { banco: { select: { nome: true } } },
      orderBy: [{ tipo: "asc" }, { conta: "asc" }],
    }),
    referenciasInativasDaConfiguracao(sessao.filialId, valores),
  ]);
  const opcoesContas = contas.map((c) => ({ id: c.id, tipo: c.tipo, rotulo: comMarca(nomeDaContaBancaria(c), c.ativo) }));
  const opcoesCategorias = (lista: typeof categoriasDespesa) =>
    lista.map((c) => ({ id: c.id, nome: comMarca(c.nome, c.ativo) }));

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <div className="flex items-center gap-1">
          <h1 className="text-lg font-semibold">Configuração de produção</h1>
          <BotaoAjuda tela="configuracao-producao" />
        </div>
        <p className="text-sm text-muted-foreground">
          Parâmetros da filial ativa usados na recepção, no processamento e nos alertas de estoque.
        </p>
      </div>
      {inativas.length > 0 ? (
        <div role="status" className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          {inativas.map((inativa) => (
            <p key={inativa.campo}>{inativa.aviso}</p>
          ))}
          <p className="text-muted-foreground">Escolha outra abaixo ou reative o cadastro.</p>
        </div>
      ) : null}
      {somenteLeitura ? (
        <p className="text-sm text-muted-foreground">Você não tem permissão de alteração nesta filial.</p>
      ) : null}
      <ConfiguracaoForm
        valores={valores}
        somenteLeitura={somenteLeitura}
        categoriasDespesa={opcoesCategorias(categoriasDespesa)}
        categoriasReceita={opcoesCategorias(categoriasReceita)}
        contas={opcoesContas}
      />
    </div>
  );
}
