import { requireSessaoAtiva } from "@/server/auth/sessao";
import { lerConteudoMarkdown } from "@/lib/conteudoMarkdown";
import { MarkdownContent } from "@/components/markdown-content";

export default async function NovidadesPage() {
  await requireSessaoAtiva();

  const conteudo = lerConteudoMarkdown("CHANGELOG.md");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Novidades</h1>
        <p className="text-sm text-muted-foreground">Histórico de releases: o que foi criado, ajustado ou corrigido.</p>
      </div>

      {conteudo ? (
        <MarkdownContent conteudo={conteudo} />
      ) : (
        <p className="text-sm text-muted-foreground">Nenhuma release publicada ainda.</p>
      )}
    </div>
  );
}
