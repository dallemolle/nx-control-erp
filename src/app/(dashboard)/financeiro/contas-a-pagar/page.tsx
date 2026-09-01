import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission, podeEscreverTitulo, podeBaixarTitulo } from "@/server/auth/permissions";
import { listarTitulos } from "@/server/services/titulo";
import { listarFornecedores } from "@/server/services/fornecedor";
import { listarCategoriasFinanceiras } from "@/server/services/categoriaFinanceira";
import { listarCentrosCusto } from "@/server/services/centroCusto";
import { listarCentrosLucro } from "@/server/services/centroLucro";
import { listarSafras } from "@/server/services/safra";
import { listarProjetos } from "@/server/services/projeto";
import { listarContasBancarias } from "@/server/services/contaBancaria";
import { TituloDialogForm } from "../_titulos/titulo-dialog-form";
import { ContasClientePanel } from "../_titulos/contas-client-panel";

export default async function ContasAPagarPage() {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "titulo:ler");
  const podeEscrever = podeEscreverTitulo(sessao.perfil, sessao.podeAlterarFilial);
  const podeBaixar = podeBaixarTitulo(sessao.perfil, sessao.podeAlterarFilial);

  const [titulos, fornecedores, categorias, centrosCusto, centrosLucro, safras, projetos, contasBancarias] =
    await Promise.all([
      listarTitulos(sessao.filialId, "PAGAR"),
      listarFornecedores(sessao.empresaId),
      listarCategoriasFinanceiras(sessao.filialId),
      listarCentrosCusto(sessao.filialId),
      listarCentrosLucro(sessao.filialId),
      listarSafras(sessao.filialId),
      listarProjetos(sessao.filialId),
      listarContasBancarias(sessao.filialId),
    ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Contas a pagar</h1>
          <p className="text-sm text-muted-foreground">Títulos e parcelas a pagar da filial ativa.</p>
        </div>
        {podeEscrever && (
          <TituloDialogForm
            tipo="PAGAR"
            contrapartes={fornecedores}
            categorias={categorias}
            centrosCusto={centrosCusto}
            centrosLucro={centrosLucro}
            safras={safras}
            projetos={projetos}
            contasBancarias={contasBancarias}
          />
        )}
      </div>
      <ContasClientePanel
        tipo="PAGAR"
        titulos={titulos}
        podeEscrever={podeEscrever}
        podeBaixar={podeBaixar}
        contasBancarias={contasBancarias}
      />
    </div>
  );
}
