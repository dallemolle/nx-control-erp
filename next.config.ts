import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // src/generated/versao.json é lido via fs em tempo de execução (não importado),
  // então o rastreamento automático de arquivos do build não o inclui sozinho.
  outputFileTracingIncludes: {
    "/*": ["src/generated/versao.json"],
  },
};

export default nextConfig;
