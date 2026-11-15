import type { ReactNode, CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { prisma } from "@/server/db/client";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { obterVersaoInfo } from "@/lib/versao";
import { corDeTextoContrastante, tomDestaque } from "@/lib/corContraste";
import { temModoEscuro } from "@/lib/tema/css";
import { logoDaSidebar } from "@/lib/tema/logo";
import { temaAplicavel } from "@/server/services/temaEmpresa";
import { Sidebar } from "./sidebar";
import { BotaoMenuLateral, MenuLateralProvider } from "./menu-lateral-context";
import { ThemeToggle } from "./theme-toggle";
import { TemaEmpresaHead } from "./tema-empresa";
import { sair } from "./actions";

/** Favicon da empresa, quando configurado na tela Tema e marca. */
export async function generateMetadata(): Promise<Metadata> {
  const sessao = await requireSessaoAtiva();
  const empresa = await prisma.empresa.findUnique({ where: { id: sessao.empresaId }, select: { faviconUrl: true } });
  return empresa?.faviconUrl ? { icons: { icon: empresa.faviconUrl } } : {};
}

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const sessao = await requireSessaoAtiva();
  const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: sessao.empresaId } });
  const filial = await prisma.filial.findUniqueOrThrow({ where: { id: sessao.filialId } });
  const versaoInfo = obterVersaoInfo();
  const tema = temaAplicavel(empresa.tema);
  const modoAparencia = !tema ? "livre" : temModoEscuro(tema) ? "claro-escuro" : "so-claro";

  // Com tema, a sidebar vem do tema; a cor única da empresa só vale sem tema.
  const estiloSidebar: CSSProperties | undefined = !tema && empresa.corPrimaria
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
    <MenuLateralProvider>
      {tema ? <TemaEmpresaHead tema={tema} chave={`${empresa.id}-${empresa.atualizadoEm.getTime()}`} /> : null}
      <div className="flex min-h-screen">
        <Sidebar
          perfil={sessao.perfil}
          versaoInfo={versaoInfo}
          estilo={estiloSidebar}
          logoUrl={logoDaSidebar({
            tema,
            corPrimaria: empresa.corPrimaria,
            logoUrl: empresa.logoUrl,
            logoEscuroUrl: empresa.logoEscuroUrl,
          })}
        />
        {/* min-w-0: sem ele, uma tabela larga estica a coluna e a página inteira rola na horizontal. */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between gap-3 border-b border-app-header-foreground/10 bg-app-header px-4 py-3 text-app-header-foreground md:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <BotaoMenuLateral className="-ml-1 shrink-0 text-app-header-foreground hover:bg-app-header-foreground/10 hover:text-app-header-foreground md:hidden" />
              <div className="min-w-0 text-sm">
                <p className="truncate font-medium">
                  {empresa.nomeFantasia} · {filial.nome}
                </p>
                <p className="truncate text-xs text-app-header-foreground/70">
                  {sessao.nome} · {sessao.perfil}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <ThemeToggle modo={modoAparencia} />
              {/* No celular estes dois vão para o rodapé do menu lateral. */}
              <Button
                render={<Link href="/selecionar-empresa" />}
                nativeButton={false}
                variant="ghost"
                size="sm"
                className="hidden text-app-header-foreground hover:bg-app-header-foreground/10 hover:text-app-header-foreground sm:inline-flex"
              >
                Trocar empresa
              </Button>
              <Button
                render={<Link href="/selecionar-filial" />}
                nativeButton={false}
                variant="ghost"
                size="sm"
                className="hidden text-app-header-foreground hover:bg-app-header-foreground/10 hover:text-app-header-foreground sm:inline-flex"
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
          <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
        </div>
      </div>
    </MenuLateralProvider>
  );
}
