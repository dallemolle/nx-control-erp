import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/server/db/client";
import { requireUsuarioAutenticado } from "@/server/auth/sessao";
import { selecionarEmpresa } from "./actions";

export default async function SelecionarEmpresaPage() {
  const usuario = await requireUsuarioAutenticado();

  const vinculos = await prisma.usuarioEmpresa.findMany({
    where: { usuarioId: usuario.id, ativo: true, empresa: { ativo: true } },
    include: { empresa: true },
    orderBy: { empresa: { razaoSocial: "asc" } },
  });

  if (vinculos.length === 0) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Selecione a empresa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {vinculos.map((vinculo) => (
            <form key={vinculo.empresaId} action={selecionarEmpresa}>
              <input type="hidden" name="empresaId" value={vinculo.empresaId} />
              <Button type="submit" variant="outline" className="w-full justify-between">
                <span>{vinculo.empresa.nomeFantasia}</span>
                <span className="text-xs text-muted-foreground">{vinculo.perfil}</span>
              </Button>
            </form>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
