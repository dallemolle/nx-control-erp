import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lidos via fs em tempo de execução (não importados), então o rastreamento
  // automático de arquivos do build não os inclui sozinho. CHANGELOG.md só passa
  // a existir depois da primeira release cortada pelo release-please — o padrão
  // ainda cobre esse caso.
  outputFileTracingIncludes: {
    "/*": ["src/generated/versao.json", "content/ajuda/passo-a-passo.md", "CHANGELOG.md"],
  },
};

export default nextConfig;
