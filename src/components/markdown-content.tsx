import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";

const componentes: Components = {
  h1: ({ children }) => <h1 className="mb-4 text-2xl font-semibold">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-8 mb-3 text-xl font-semibold first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-6 mb-2 text-lg font-medium">{children}</h3>,
  p: ({ children }) => <p className="mb-3 leading-relaxed text-foreground/90">{children}</p>,
  ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-6">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-6">{children}</ol>,
  li: ({ children }) => <li className="text-foreground/90">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="mb-3 border-l-2 border-muted-foreground/30 pl-4 text-sm text-muted-foreground">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="mb-4 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="border-b">{children}</thead>,
  th: ({ children }) => <th className="px-3 py-2 text-left font-medium">{children}</th>,
  td: ({ children }) => <td className="border-b px-3 py-2 align-top">{children}</td>,
  a: ({ children, href }) => (
    <a href={href} className="text-primary underline underline-offset-2">
      {children}
    </a>
  ),
  code: ({ children }) => <code className="rounded bg-muted px-1 py-0.5 text-sm">{children}</code>,
};

export function MarkdownContent({ conteudo }: { conteudo: string }) {
  return (
    <div className="max-w-3xl">
      <ReactMarkdown components={componentes}>{conteudo}</ReactMarkdown>
    </div>
  );
}
