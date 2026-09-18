"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Perfil } from "@prisma/client";
import { cn } from "@/lib/utils";
import type { VersaoInfo } from "@/lib/versao";
import { Accordion, AccordionItem, AccordionPanel, AccordionTrigger } from "@/components/ui/accordion";
import { NAV_SECTIONS } from "./nav-items";
import { VersaoBadge } from "./versao-badge";

export function Sidebar({ perfil, versaoInfo }: { perfil: Perfil; versaoInfo: VersaoInfo }) {
  const pathname = usePathname();

  const secoesVisiveis = NAV_SECTIONS.map((secao) => ({
    ...secao,
    itens: secao.itens.filter((item) => !item.permitido || item.permitido.includes(perfil)),
  })).filter((secao) => secao.itens.length > 0);

  const secaoAtiva = secoesVisiveis.find((secao) =>
    secao.itens.some((item) => pathname.startsWith(item.href)),
  )?.titulo;

  const [abertas, setAbertas] = useState<string[]>(secaoAtiva ? [secaoAtiva] : []);

  useEffect(() => {
    if (secaoAtiva) {
      setAbertas((atual) => (atual.includes(secaoAtiva) ? atual : [...atual, secaoAtiva]));
    }
  }, [secaoAtiva]);

  return (
    <nav className="flex w-60 shrink-0 flex-col gap-4 border-r border-sidebar-border bg-sidebar p-4 text-sidebar-foreground">
      <Link href="/" className="px-2 text-sm font-semibold">
        NX Control
      </Link>
      <Accordion multiple value={abertas} onValueChange={(valor) => setAbertas(valor as string[])}>
        {secoesVisiveis.map((secao) => (
          <AccordionItem key={secao.titulo} value={secao.titulo}>
            <AccordionTrigger>{secao.titulo}</AccordionTrigger>
            <AccordionPanel>
              {secao.itens.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "block rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    pathname.startsWith(item.href) &&
                      "bg-sidebar-primary font-medium text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground",
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </AccordionPanel>
          </AccordionItem>
        ))}
      </Accordion>
      <div className="mt-auto">
        <VersaoBadge versaoInfo={versaoInfo} />
      </div>
    </nav>
  );
}
