import type { ReactNode, CSSProperties } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { prisma } from "@/server/db/client";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { obterVersaoInfo } from "@/lib/versao";
import { corDeTextoContrastante, tomDestaque } from "@/lib/corContraste";
import { Sidebar } from "./sidebar";
import { ThemeToggle } from "./theme-toggle";
import { sair } from "./actions";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const sessao = await requireSessaoAtiva();
  const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: sessao.empresaId } });
  const filial = await prisma.filial.findUniqueOrThrow({ where: { id: sessao.filialId } });
  const versaoInfo = obterVersaoInfo();

  const estiloSidebar: CSSProperties | undefined = empresa.corPrimaria
    ? ({
        "--sidebar": empresa.corPrimaria,
        "--sidebar-foreground": corDeTextoContrastante(empresa.corPrimaria),
        "--sidebar-accent": tomDestaque(empresa.corPrimaria, 8),
        "--sidebar-accent-foreground": corDeTextoContrastante(tomDestaque(empresa.corPrimaria, 8)),
        "--sidebar-primary": tomDestaque(empresa.corPrimaria, 16),
        "--sidebar-primary-foreground": corDeTextoContrastante(tomDestaque(empresa.corPrimaria, 16)),
      } as CSSProperties)
    : undefined;

  return (
    <div className="flex min-h-screen">
      <Sidebar
        perfil={sessao.perfil}
        versaoInfo={versaoInfo}
        estilo={estiloSidebar}
        logoUrl={empresa.logoUrl}
      />
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-app-header-foreground/10 bg-app-header px-6 py-3 text-app-header-foreground">
          <div className="text-sm">
            <p className="font-medium">
              {empresa.nomeFantasia} · {filial.nome}
            </p>
            <p className="text-xs text-app-header-foreground/70">
              {sessao.nome} · {sessao.perfil}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button
              render={<Link href="/selecionar-empresa" />}
              nativeButton={false}
              variant="ghost"
              size="sm"
              className="text-app-header-foreground hover:bg-app-header-foreground/10 hover:text-app-header-foreground"
            >
              Trocar empresa
            </Button>
            <Button
              render={<Link href="/selecionar-filial" />}
              nativeButton={false}
              variant="ghost"
              size="sm"
              className="text-app-header-foreground hover:bg-app-header-foreground/10 hover:text-app-header-foreground"
            >
              Trocar filial
            </Button>
            <form action={sair}>
              <Button
                type="submit"
                variant="outline"
                size="sm"
                className="border-app-header-foreground/30 text-app-header-foreground hover:bg-app-header-foreground/10 hover:text-app-header-foreground"
              >
                Sair
              </Button>
            </form>
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
