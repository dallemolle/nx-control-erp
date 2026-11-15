import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { prisma } from "@/server/db/client";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { temaAplicavel } from "@/server/services/temaEmpresa";
import { ImportarTemaForm } from "./importar-tema-form";
import { MarcaForm, RestaurarTemaForm } from "./marca-form";

export default async function TemaEmpresaPage({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "empresa:gerenciar");
  const { id } = await params;
  const empresa = await prisma.empresa.findUnique({ where: { id } });
  if (!empresa) notFound();
  const tema = temaAplicavel(empresa.tema);

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href="/empresas" className="underline-offset-4 hover:underline">
            Empresas
          </Link>
        </p>
        <h1 className="text-lg font-semibold">Tema e marca · {empresa.nomeFantasia}</h1>
        <p className="text-sm text-muted-foreground">
          Cores, fontes e logos do painel desta empresa. Sem tema, vale o visual padrão do sistema.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Tema atual</h2>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm">
            {tema ? (
              <>
                <strong>{tema.nome}</strong>
                {tema.cores.escuro ? " (claro e escuro)" : " (só claro)"}
              </>
            ) : (
              "Padrão do sistema"
            )}
          </p>
          {tema ? (
            <>
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<a href={`/empresas/${empresa.id}/tema/exportar`} download />}
              >
                Exportar tema
              </Button>
              <RestaurarTemaForm empresaId={empresa.id} />
            </>
          ) : null}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Importar tema</h2>
        <p className="text-sm text-muted-foreground">
          Gere o arquivo com uma IA a partir do manual de marca do cliente usando o{" "}
          <a href="/temas/modelo-pedido-ia.md" download className="underline underline-offset-4">
            modelo de pedido para a IA
          </a>
          . Referências: o{" "}
          <a href="/temas/nx-tema.schema.json" download className="underline underline-offset-4">
            formato (JSON Schema)
          </a>{" "}
          e o{" "}
          <a href="/temas/hortitex.json" download className="underline underline-offset-4">
            exemplo Hortitex
          </a>
          .
        </p>
        <ImportarTemaForm empresaId={empresa.id} logoUrl={empresa.logoUrl} logoEscuroUrl={empresa.logoEscuroUrl} />
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Marca</h2>
        <MarcaForm
          empresaId={empresa.id}
          logoUrl={empresa.logoUrl}
          logoEscuroUrl={empresa.logoEscuroUrl}
          faviconUrl={empresa.faviconUrl}
        />
      </section>
    </div>
  );
}
