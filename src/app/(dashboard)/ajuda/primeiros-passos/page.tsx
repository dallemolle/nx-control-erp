import { requireSessaoAtiva } from "@/server/auth/sessao";
import { lerConteudoMarkdown } from "@/lib/conteudoMarkdown";
import { MarkdownContent } from "@/components/markdown-content";

export default async function PrimeirosPassosPage() {
  await requireSessaoAtiva();

  const conteudo = lerConteudoMarkdown("content/ajuda/primeiros-passos.md");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Primeiros passos</h1>
        <p className="text-sm text-muted-foreground">
          Como o sistema se organiza, como entrar e o que significam os termos. A ajuda de cada tela fica no ícone ?
          ao lado do título.
        </p>
      </div>

      {conteudo ? (
        <MarkdownContent conteudo={conteudo} />
      ) : (
        <p className="text-sm text-muted-foreground">Conteúdo indisponível no momento.</p>
      )}
    </div>
  );
}
