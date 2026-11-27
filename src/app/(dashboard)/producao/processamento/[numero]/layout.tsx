import { ProcessoNaoSalvoProvider } from "./processo-nao-salvo";

/** Só para o "Encerrar OP" (no cabeçalho) saber se a aba Processo tem números não salvos. */
export default function LayoutDaOP({ children }: { children: React.ReactNode }) {
  return <ProcessoNaoSalvoProvider>{children}</ProcessoNaoSalvoProvider>;
}
