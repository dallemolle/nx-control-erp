import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lidos via fs em tempo de execução (não importados), então o rastreamento
  // automático de arquivos do build não os inclui sozinho. CHANGELOG.md só passa
  // a existir depois da primeira release cortada pelo release-please — o padrão
  // ainda cobre esse caso. Cada markdown vai só para a rota que o lê: o padrão
  // "CHANGELOG.md" também puxa o CHANGELOG de ~180 pacotes do node_modules, e
  // com "/*" isso ia junto para todas as rotas.
  outputFileTracingIncludes: {
    "/*": ["src/generated/versao.json"],
    "/ajuda/novidades": ["CHANGELOG.md"],
    "/ajuda/primeiros-passos": ["content/ajuda/primeiros-passos.md"],
  },
  // O manual "Passo a passo" foi aposentado: cada tela tem a sua ajuda (ícone ?).
  redirects() {
    return [{ source: "/ajuda/passo-a-passo", destination: "/ajuda/primeiros-passos", permanent: true }];
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
