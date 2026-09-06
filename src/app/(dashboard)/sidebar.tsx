"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Perfil } from "@prisma/client";
import { cn } from "@/lib/utils";
import { NAV_SECTIONS } from "./nav-items";

export function Sidebar({ perfil }: { perfil: Perfil }) {
  const pathname = usePathname();

  return (
    <nav className="flex w-60 shrink-0 flex-col gap-6 border-r border-sidebar-border bg-sidebar p-4 text-sidebar-foreground">
      <Link href="/" className="px-2 text-sm font-semibold">
        nx-control-erp
      </Link>
      {NAV_SECTIONS.map((secao) => {
        const itensVisiveis = secao.itens.filter(
          (item) => !item.permitido || item.permitido.includes(perfil),
        );
        if (itensVisiveis.length === 0) return null;

        return (
          <div key={secao.titulo} className="space-y-1">
            <p className="px-2 text-xs font-medium uppercase text-sidebar-foreground/60">
              {secao.titulo}
            </p>
            {itensVisiveis.map((item) => (
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
          </div>
        );
      })}
    </nav>
  );
}
