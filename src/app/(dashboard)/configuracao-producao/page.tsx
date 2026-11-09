import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission, podeConfigurarProducao } from "@/server/auth/permissions";
import { obterConfiguracaoProducao } from "@/server/services/configuracaoProducao";
import { prisma } from "@/server/db/client";
import { ConfiguracaoForm } from "./configuracao-form";

export default async function ConfiguracaoProducaoPage() {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "producao:configurar");
  const somenteLeitura = !podeConfigurarProducao(sessao.perfil, sessao.podeAlterarFilial);

  const [valores, categoriasDespesa] = await Promise.all([
    obterConfiguracaoProducao(sessao.filialId),
    prisma.categoriaFinanceira.findMany({
      where: { filialId: sessao.filialId, tipo: "DESPESA", ativo: true },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    }),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Configuração de produção</h1>
        <p className="text-sm text-muted-foreground">
          Parâmetros da filial ativa usados na recepção, no processamento e nos alertas de estoque.
        </p>
      </div>
      {somenteLeitura ? (
        <p className="text-sm text-muted-foreground">Você não tem permissão de alteração nesta filial.</p>
      ) : null}
      <ConfiguracaoForm valores={valores} somenteLeitura={somenteLeitura} categoriasDespesa={categoriasDespesa} />
    </div>
  );
}
