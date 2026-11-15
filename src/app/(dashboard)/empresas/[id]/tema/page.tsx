import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db/client";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { temaInicial } from "@/lib/tema/editor";
import { EditorTema } from "./editor-tema";
import { MarcaForm } from "./marca-form";

export default async function TemaEmpresaPage({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "empresa:gerenciar");
  const { id } = await params;
  const empresa = await prisma.empresa.findUnique({ where: { id } });
  if (!empresa) notFound();
  const inicial = temaInicial(empresa.tema, empresa.nomeFantasia);

  return (
    <div className="max-w-6xl space-y-8">
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href="/empresas" className="underline-offset-4 hover:underline">
            Empresas
          </Link>
        </p>
        <h1 className="text-lg font-semibold">Tema e marca · {empresa.nomeFantasia}</h1>
        <p className="text-sm text-muted-foreground">
          Cores, fontes e logos do painel desta empresa. Sem tema salvo, vale o visual padrão do sistema.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Tema</h2>
        <EditorTema
          empresaId={empresa.id}
          nomeEmpresa={empresa.nomeFantasia}
          temaInicial={inicial.tema}
          aviso={inicial.aviso}
          temTemaGravado={empresa.tema !== null}
          logoUrl={empresa.logoUrl}
          logoEscuroUrl={empresa.logoEscuroUrl}
        />
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
