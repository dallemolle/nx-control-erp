import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar } from "@/server/auth/permissions";
import { listarLinhasExtrato } from "@/server/services/conciliacao";
import { STATUS_LINHA_EXTRATO } from "@/lib/schemas/enums";
import type { StatusLinhaExtrato } from "@prisma/client";
import { type ColunaExport } from "@/lib/export/csv";
import { responderExport } from "@/lib/export/responder";
import { STATUS_LABEL } from "../status-label";

type LinhaExtrato = Awaited<ReturnType<typeof listarLinhasExtrato>>[number];

function statusValido(valor: string | null): StatusLinhaExtrato | undefined {
  return STATUS_LINHA_EXTRATO.includes(valor as (typeof STATUS_LINHA_EXTRATO)[number])
    ? (valor as StatusLinhaExtrato)
    : undefined;
}

/** Linhas do extrato importado com o status de conciliação — as mesmas da tela. */
const COLUNAS: ColunaExport<LinhaExtrato>[] = [
  { rotulo: "Data", valor: (l) => l.data },
  { rotulo: "Banco", valor: (l) => l.contaBancaria.banco.nome },
  { rotulo: "Agência", valor: (l) => l.contaBancaria.agencia },
  { rotulo: "Conta", valor: (l) => l.contaBancaria.conta },
  { rotulo: "Histórico", valor: (l) => l.historico },
  { rotulo: "Valor", valor: (l) => Number(l.valor) },
  { rotulo: "Status", valor: (l) => STATUS_LABEL[l.status] ?? l.status },
  { rotulo: "Lançamento vinculado", valor: (l) => l.lancamentoBancario?.descricao ?? "" },
];

export async function GET(request: Request) {
  const sessao = await requireSessaoAtiva();
  if (!podeExecutar(sessao.perfil, "conciliacao:ler")) {
    return new Response("Acesso negado", { status: 403 });
  }

  const url = new URL(request.url);
  const status = statusValido(url.searchParams.get("status"));
  const linhas = await listarLinhasExtrato(sessao.filialId, undefined, status);

  return responderExport(linhas, COLUNAS, {
    nomeArquivo: status ? `conciliacao-${status.toLowerCase().replace(/_/g, "-")}` : "conciliacao",
    nomeAba: "Conciliação",
    formato: url.searchParams.get("formato"),
  });
}
