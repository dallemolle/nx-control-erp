import type { Tema } from "@/lib/tema/schema";
import { cssDoTema, urlGoogleFonts } from "@/lib/tema/css";

/**
 * CSS do tema da empresa e fontes do Google. O CSS é montado só com valores
 * validados (src/lib/tema); React eleva `<link>` e `<style>` com `precedence` ao `<head>`.
 */
export function TemaEmpresaHead({ tema, chave }: { tema: Tema; chave: string }) {
  const fontes = urlGoogleFonts(tema);
  return (
    <>
      {fontes ? (
        <>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
          <link rel="stylesheet" href={fontes} precedence="tema-empresa" />
        </>
      ) : null}
      <style href={`tema-empresa-${chave}`} precedence="tema-empresa">
        {cssDoTema(tema)}
      </style>
    </>
  );
}
