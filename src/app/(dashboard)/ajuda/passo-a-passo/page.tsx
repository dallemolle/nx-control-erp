import { requireSessaoAtiva } from "@/server/auth/sessao";
import { lerConteudoMarkdown } from "@/lib/conteudoMarkdown";
import { MarkdownContent } from "@/components/markdown-content";

export default async function PassoAPassoPage() {
  await requireSessaoAtiva();

  const conteudo = lerConteudoMarkdown("content/ajuda/passo-a-passo.md");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Passo a passo</h1>
        <p className="text-sm text-muted-foreground">Manual de uso do sistema, tela por tela.</p>
      </div>

      {conteudo ? (
        <MarkdownContent conteudo={conteudo} />
      ) : (
        <p className="text-sm text-muted-foreground">Conteúdo indisponível no momento.</p>
      )}
    </div>
  );
}
