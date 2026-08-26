"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Perfil } from "@prisma/client";
import { cn } from "@/lib/utils";
import { NAV_SECTIONS } from "./nav-items";

export function Sidebar({ perfil }: { perfil: Perfil }) {
  const pathname = usePathname();

  return (
    <nav className="flex w-60 shrink-0 flex-col gap-6 border-r bg-muted/20 p-4">
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
            <p className="px-2 text-xs font-medium uppercase text-muted-foreground">
              {secao.titulo}
            </p>
            {itensVisiveis.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "block rounded-md px-2 py-1.5 text-sm hover:bg-muted",
                  pathname.startsWith(item.href) && "bg-muted font-medium",
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
