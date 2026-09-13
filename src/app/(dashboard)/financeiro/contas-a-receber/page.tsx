import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission, podeEscreverTitulo, podeBaixarTitulo } from "@/server/auth/permissions";
import { listarTitulos } from "@/server/services/titulo";
import { listarClientes } from "@/server/services/cliente";
import { listarCategoriasFinanceiras } from "@/server/services/categoriaFinanceira";
import { listarCentrosCusto } from "@/server/services/centroCusto";
import { listarCentrosLucro } from "@/server/services/centroLucro";
import { listarSafras } from "@/server/services/safra";
import { listarProjetos } from "@/server/services/projeto";
import { listarContasBancarias } from "@/server/services/contaBancaria";
import { TituloDialogForm } from "../_titulos/titulo-dialog-form";
import { ContasClientePanel } from "../_titulos/contas-client-panel";
import { BarraDeFiltros } from "../_titulos/barra-de-filtros";
import { filtroTitulosDaUrl, algumFiltroAtivo, queryStringDosFiltros } from "../_titulos/filtro-titulos-url";
import { ExportarLinks } from "../../_shared/exportar-links";

function paramCru(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

type SearchParams = {
  categoria?: string | string[];
  contraparte?: string | string[];
  centroCusto?: string | string[];
  centroLucro?: string | string[];
  safra?: string | string[];
  projeto?: string | string[];
  status?: string | string[];
  vencimentoDe?: string | string[];
  vencimentoAte?: string | string[];
};

export default async function ContasAReceberPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "titulo:ler");
  const podeEscrever = podeEscreverTitulo(sessao.perfil, sessao.podeAlterarFilial);
  const podeBaixar = podeBaixarTitulo(sessao.perfil, sessao.podeAlterarFilial);

  const sp = await searchParams;
  const get = (campo: string) => paramCru((sp as Record<string, string | string[] | undefined>)[campo]);
  const filtros = filtroTitulosDaUrl(get);
  const queryString = queryStringDosFiltros(get);

  const [titulos, clientes, categorias, centrosCusto, centrosLucro, safras, projetos, contasBancarias] =
    await Promise.all([
      listarTitulos(sessao.filialId, "RECEBER", filtros),
      listarClientes(sessao.empresaId),
      listarCategoriasFinanceiras(sessao.filialId),
      listarCentrosCusto(sessao.filialId),
      listarCentrosLucro(sessao.filialId),
      listarSafras(sessao.filialId),
      listarProjetos(sessao.filialId),
      listarContasBancarias(sessao.filialId),
    ]);

  const opcoes = {
    contrapartes: clientes,
    categorias,
    centrosCusto,
    centrosLucro,
    safras,
    projetos,
    contasBancarias: contasBancarias.map((conta) => ({
      id: conta.id,
      nome: `${conta.banco.nome} - Ag ${conta.agencia}/CC ${conta.conta}`,
    })),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Contas a receber</h1>
          <p className="text-sm text-muted-foreground">Títulos e parcelas a receber da filial ativa.</p>
        </div>
        <div className="flex items-center gap-4">
          <ExportarLinks baseHref="/financeiro/contas-a-receber/export" queryString={queryString} />
          {podeEscrever && (
            <TituloDialogForm
              tipo="RECEBER"
              contrapartes={opcoes.contrapartes}
              categorias={opcoes.categorias}
              centrosCusto={opcoes.centrosCusto}
              centrosLucro={opcoes.centrosLucro}
              safras={opcoes.safras}
              projetos={opcoes.projetos}
              contasBancarias={opcoes.contasBancarias}
            />
          )}
        </div>
      </div>
      <BarraDeFiltros
        rotuloContraparte="Cliente"
        opcoes={{
          categorias: opcoes.categorias,
          contrapartes: opcoes.contrapartes,
          centrosCusto: opcoes.centrosCusto,
          centrosLucro: opcoes.centrosLucro,
          safras: opcoes.safras,
          projetos: opcoes.projetos,
        }}
      />
      <ContasClientePanel
        tipo="RECEBER"
        titulos={titulos}
        opcoes={opcoes}
        podeEscrever={podeEscrever}
        podeBaixar={podeBaixar}
        filtroAtivo={algumFiltroAtivo(filtros)}
      />
    </div>
  );
}
