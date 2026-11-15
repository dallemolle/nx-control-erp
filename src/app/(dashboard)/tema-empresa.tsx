import type { Tema } from "@/lib/tema/schema";
import { cssDoTema, urlGoogleFonts } from "@/lib/tema/css";

/**
 * CSS do tema da empresa e fontes do Google. O CSS é montado só com valores
 * validados (src/lib/tema). `<style>` e a folha de fontes ficam no lugar, sem
 * `precedence`: assim o React os remove ao restaurar o padrão ou trocar de
 * empresa (um recurso elevado ao `<head>` continuaria lá até recarregar a página).
 */
export function TemaEmpresaHead({ tema, chave }: { tema: Tema; chave: string }) {
  const fontes = urlGoogleFonts(tema);
  return (
    <>
      {fontes ? (
        <>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
          <link rel="stylesheet" href={fontes} />
        </>
      ) : null}
      <style key={chave}>{cssDoTema(tema)}</style>
    </>
  );
}
