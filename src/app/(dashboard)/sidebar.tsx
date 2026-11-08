"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import type { Perfil } from "@prisma/client";
import { cn } from "@/lib/utils";
import type { VersaoInfo } from "@/lib/versao";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionItem, AccordionPanel, AccordionTrigger } from "@/components/ui/accordion";
import { NAV_SECTIONS } from "./nav-items";
import { VersaoBadge } from "./versao-badge";
import { useMenuLateral } from "./menu-lateral-context";

type SidebarProps = {
  perfil: Perfil;
  versaoInfo: VersaoInfo;
  estilo?: CSSProperties;
  logoUrl?: string | null;
};

const CLASSE_LINK =
  "block rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";

/**
 * Desktop (md+): barra fixa à esquerda, como sempre. Celular: a barra some e
 * o mesmo conteúdo abre numa gaveta (Dialog da Base UI — foco preso, Esc e
 * toque fora fecham, rolagem da página travada) pelo botão do cabeçalho.
 */
export function Sidebar({ perfil, versaoInfo, estilo, logoUrl }: SidebarProps) {
  const { aberto, setAberto } = useMenuLateral();

  return (
    <>
      <nav
        aria-label="Menu principal"
        style={estilo}
        className="hidden w-60 shrink-0 flex-col gap-4 border-r border-sidebar-border bg-sidebar p-4 text-sidebar-foreground md:flex"
      >
        <ConteudoMenu perfil={perfil} versaoInfo={versaoInfo} logoUrl={logoUrl} />
      </nav>

      <DialogPrimitive.Root open={aberto} onOpenChange={setAberto}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/30 duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 md:hidden" />
          <DialogPrimitive.Popup
            id="menu-lateral-movel"
            aria-label="Menu principal"
            style={estilo}
            className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col gap-4 overflow-y-auto bg-sidebar p-4 text-sidebar-foreground shadow-xl outline-none duration-200 data-open:animate-in data-open:slide-in-from-left data-closed:animate-out data-closed:slide-out-to-left md:hidden"
          >
            <DialogPrimitive.Title className="sr-only">Menu principal</DialogPrimitive.Title>
            <DialogPrimitive.Close
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="absolute top-3 right-3 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                />
              }
            >
              <XIcon />
              <span className="sr-only">Fechar menu</span>
            </DialogPrimitive.Close>

            <ConteudoMenu
              perfil={perfil}
              versaoInfo={versaoInfo}
              logoUrl={logoUrl}
              aoNavegar={() => setAberto(false)}
              rodapeMovel
            />
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}

function ConteudoMenu({
  perfil,
  versaoInfo,
  logoUrl,
  aoNavegar,
  rodapeMovel = false,
}: {
  perfil: Perfil;
  versaoInfo: VersaoInfo;
  logoUrl?: string | null;
  /** Gaveta do celular: escolher uma página fecha o menu. */
  aoNavegar?: () => void;
  /** No celular, "Trocar empresa/filial" saem do cabeçalho e vêm para o rodapé do menu. */
  rodapeMovel?: boolean;
}) {
  const pathname = usePathname();

  const secoesVisiveis = NAV_SECTIONS.map((secao) => ({
    ...secao,
    itens: secao.itens.filter((item) => !item.permitido || item.permitido.includes(perfil)),
  })).filter((secao) => secao.itens.length > 0);

  const secaoAtiva = secoesVisiveis.find((secao) =>
    secao.itens.some((item) => pathname.startsWith(item.href)),
  )?.titulo;

  const [abertas, setAbertas] = useState<string[]>(secaoAtiva ? [secaoAtiva] : []);

  // Ao navegar para outra seção, abre-a (sem fechar as que o usuário abriu).
  // Ajuste durante o render em vez de useEffect: https://react.dev/learn/you-might-not-need-an-effect
  const [secaoAnterior, setSecaoAnterior] = useState(secaoAtiva);
  if (secaoAtiva !== secaoAnterior) {
    setSecaoAnterior(secaoAtiva);
    if (secaoAtiva && !abertas.includes(secaoAtiva)) setAbertas([...abertas, secaoAtiva]);
  }

  return (
    <>
      <div className="flex items-center gap-2 px-2">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="size-6 rounded object-contain" />
        ) : null}
        <Link href="/" className="text-sm font-semibold" onClick={aoNavegar}>
          NX Control
        </Link>
      </div>
      <Accordion multiple value={abertas} onValueChange={(valor) => setAbertas(valor as string[])}>
        {secoesVisiveis.map((secao) => (
          <AccordionItem key={secao.titulo} value={secao.titulo}>
            <AccordionTrigger>{secao.titulo}</AccordionTrigger>
            <AccordionPanel>
              {secao.itens.map((item) => {
                const ativo = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={aoNavegar}
                    aria-current={ativo ? "page" : undefined}
                    className={cn(
                      CLASSE_LINK,
                      ativo &&
                        "bg-sidebar-primary font-medium text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </AccordionPanel>
          </AccordionItem>
        ))}
      </Accordion>
      <div className="mt-auto space-y-3">
        {rodapeMovel ? (
          <div className="space-y-1 border-t border-sidebar-border pt-3 sm:hidden">
            <Link href="/selecionar-empresa" className={CLASSE_LINK} onClick={aoNavegar}>
              Trocar empresa
            </Link>
            <Link href="/selecionar-filial" className={CLASSE_LINK} onClick={aoNavegar}>
              Trocar filial
            </Link>
          </div>
        ) : null}
        <VersaoBadge versaoInfo={versaoInfo} />
      </div>
    </>
  );
}
