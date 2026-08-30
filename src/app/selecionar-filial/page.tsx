import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUsuarioAutenticado, EMPRESA_ATIVA_COOKIE } from "@/server/auth/sessao";
import { listarFiliaisAcessiveis } from "@/server/services/usuarioEmpresaFilial";
import { selecionarFilial } from "./actions";

export default async function SelecionarFilialPage() {
  const usuario = await requireUsuarioAutenticado();

  const cookieStore = await cookies();
  const empresaId = cookieStore.get(EMPRESA_ATIVA_COOKIE)?.value;
  if (!empresaId) {
    redirect("/selecionar-empresa");
  }

  const acessos = await listarFiliaisAcessiveis(usuario.id, empresaId);

  if (acessos.length === 0) {
    redirect("/selecionar-empresa");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Selecione a filial</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {acessos.map((acesso) => (
            <form key={acesso.filialId} action={selecionarFilial}>
              <input type="hidden" name="filialId" value={acesso.filialId} />
              <Button type="submit" variant="outline" className="w-full justify-between">
                <span>{acesso.filial.nome}</span>
                <span className="text-xs text-muted-foreground">
                  {acesso.podeAlterar ? "Alteração" : "Somente leitura"}
                </span>
              </Button>
            </form>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
