import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { prisma } from "@/server/db/client";
import { listarRepasses, type FiltroRepasses } from "@/server/services/repasseCartao";
import { hojeDeCalendario, paraDataIso } from "@/lib/producao/periodo";
import { BarraDeFiltros } from "../../producao/_shared/barra-de-filtros";
import { RepassesLista } from "./repasses-lista";

type Parametros = { operadora?: string; inicio?: string; fim?: string; situacao?: string };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const SITUACOES = ["A_RECEBER", "ATRASADO", "RECEBIDO"] as const;
const dataDoFiltro = (valor?: string) => (valor && ISO.test(valor) ? new Date(`${valor}T00:00:00.000Z`) : undefined);

export default async function RepassesCartaoPage({ searchParams }: { searchParams: Promise<Parametros> }) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "titulo:baixar");

  const sp = await searchParams;
  // Sem situação escolhida: o que falta receber (a receber e atrasados).
  const situacao = SITUACOES.find((s) => s === sp.situacao);
  const filtro: FiltroRepasses = {
    operadoraId: sp.operadora || undefined,
    inicio: dataDoFiltro(sp.inicio),
    fim: dataDoFiltro(sp.fim),
    situacao: situacao ?? "PENDENTES",
  };
  const hoje = hojeDeCalendario();
  const [repasses, operadoras] = await Promise.all([
    listarRepasses(sessao.filialId, filtro, hoje),
    prisma.operadoraCartao.findMany({
      where: { filialId: sessao.filialId },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Repasses de cartão</h1>
        <p className="text-sm text-muted-foreground">
          Marque os repasses que caíram na conta, confira o líquido com o extrato e confirme. Depois concilie o
          depósito em grupo na Conciliação.
        </p>
      </div>

      <BarraDeFiltros
        valores={{ operadora: sp.operadora ?? "", inicio: sp.inicio ?? "", fim: sp.fim ?? "", situacao: situacao ?? "" }}
        campos={[
          {
            tipo: "select",
            campo: "operadora",
            rotulo: "Operadora",
            rotuloTodos: "Todas",
            opcoes: operadoras.map((o) => ({ valor: o.id, rotulo: o.nome })),
          },
          { tipo: "data", campo: "inicio", rotulo: "Previsto de" },
          { tipo: "data", campo: "fim", rotulo: "Até" },
          {
            tipo: "select",
            campo: "situacao",
            rotulo: "Situação",
            rotuloTodos: "A receber e atrasados",
            opcoes: [
              { valor: "A_RECEBER", rotulo: "A receber" },
              { valor: "ATRASADO", rotulo: "Atrasados" },
              { valor: "RECEBIDO", rotulo: "Recebidos" },
            ],
          },
        ]}
      />

      <RepassesLista
        hoje={paraDataIso(hoje)}
        podeConfirmar={sessao.podeAlterarFilial}
        linhas={repasses.map((r) => ({
          ...r,
          dataPrevista: paraDataIso(r.dataPrevista),
          recebidoEm: r.recebidoEm ? paraDataIso(r.recebidoEm) : null,
        }))}
      />
    </div>
  );
}
