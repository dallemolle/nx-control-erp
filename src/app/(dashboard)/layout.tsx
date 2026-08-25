import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { prisma } from "@/server/db/client";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { Sidebar } from "./sidebar";
import { sair } from "./actions";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const sessao = await requireSessaoAtiva();
  const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: sessao.empresaId } });

  return (
    <div className="flex min-h-screen">
      <Sidebar perfil={sessao.perfil} />
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b px-6 py-3">
          <div className="text-sm">
            <p className="font-medium">{empresa.nomeFantasia}</p>
            <p className="text-xs text-muted-foreground">
              {sessao.nome} · {sessao.perfil}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              render={<Link href="/selecionar-empresa" />}
              nativeButton={false}
              variant="ghost"
              size="sm"
            >
              Trocar empresa
            </Button>
            <form action={sair}>
              <Button type="submit" variant="outline" size="sm">
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
