"use client";

import { unstable_rethrow } from "next/navigation";
import { useEffect, useMemo, useReducer, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { variaveisDoTema } from "@/lib/tema/css";
import {
  diagnostico,
  estadoInicial,
  graficosEfetivos,
  nomeArquivoTema,
  paresDoModo,
  reduzirEditor,
  temaInicial as temaInicialDe,
  temasIguais,
  urlFontesDaPrevia,
  valorEfetivo,
  type Modo,
} from "@/lib/tema/editor";
import type { Tema } from "@/lib/tema/schema";
import { analisarTexto, type PapelCor } from "@/lib/tema/validar";
import { aplicarTemaAction, restaurarTemaAction } from "./actions";
import { CampoCor, Grupo } from "./campo-cor";
import { CampoRaio, CamposFonte } from "./campos-fonte-raio";
import { PreviaDoTema } from "./previa-tema";

const GRUPOS: { titulo: string; papeis: PapelCor[]; aberto?: boolean }[] = [
  {
    titulo: "Essenciais",
    papeis: ["fundo", "texto", "primaria", "textoSobrePrimaria", "sidebar", "textoSobreSidebar"],
    aberto: true,
  },
  {
    titulo: "Superfícies e apoio",
    papeis: ["cartao", "apoio", "textoSobreApoio", "textoApagado", "destaque", "textoSobreDestaque"],
  },
  { titulo: "Cabeçalho, foco, borda e erro", papeis: ["cabecalho", "textoCabecalho", "foco", "borda", "erro"] },
];
const OBRIGATORIOS = GRUPOS[0].papeis;

const CLASSE_TEXTAREA =
  "w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

function formData(campos: Record<string, string>): FormData {
  const dados = new FormData();
  for (const [chave, valor] of Object.entries(campos)) dados.set(chave, valor);
  return dados;
}

export function EditorTema({
  empresaId,
  nomeEmpresa,
  temaInicial,
  aviso,
  temTemaGravado,
  logoUrl,
  logoEscuroUrl,
}: {
  empresaId: string;
  nomeEmpresa: string;
  temaInicial: Tema;
  aviso: string | null;
  temTemaGravado: boolean;
  logoUrl: string | null;
  logoEscuroUrl: string | null;
}) {
  const [estado, despachar] = useReducer(reduzirEditor, temaInicial, estadoInicial);
  const { tema, modo } = estado;
  const [gravado, setGravado] = useState(temTemaGravado);
  const [mensagem, setMensagem] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [importando, setImportando] = useState(false);
  const [errosImportacao, setErrosImportacao] = useState<string[]>([]);
  const [salvando, iniciar] = useTransition();
  const textoImportado = useRef<HTMLTextAreaElement>(null);

  const sujo = !temasIguais(tema, estado.salvo);
  const { erros, avisos } = useMemo(() => diagnostico(tema), [tema]);
  const cores = modo === "escuro" && tema.cores.escuro ? tema.cores.escuro : tema.cores.claro;
  const pares = useMemo(() => paresDoModo(tema, modo), [tema, modo]);
  const variaveis = useMemo(() => {
    const todas = variaveisDoTema(tema);
    return (modo === "escuro" ? todas.escuro : null) ?? todas.claro;
  }, [tema, modo]);

  // Folha do Google Fonts da prévia, com espera para não pedir uma fonte por tecla.
  const [urlFontes, setUrlFontes] = useState(() => urlFontesDaPrevia(tema));
  useEffect(() => {
    const espera = setTimeout(() => setUrlFontes(urlFontesDaPrevia(tema)), 600);
    return () => clearTimeout(espera);
  }, [tema]);

  useEffect(() => {
    if (!sujo) return;
    const avisar = (evento: BeforeUnloadEvent) => evento.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [sujo]);

  const confirmarPerda = () => !sujo || window.confirm("Descartar as alterações que não foram salvas?");

  function salvar() {
    if (erros.length > 0) return;
    const confirmar =
      avisos.length > 0 && window.confirm(`O tema tem ${avisos.length} aviso(s) de contraste. Salvar mesmo assim?`);
    if (avisos.length > 0 && !confirmar) return;
    const enviado = tema;
    iniciar(async () => {
      let resultado;
      try {
        resultado = await aplicarTemaAction(
          {},
          formData({ empresaId, texto: JSON.stringify(enviado), confirmarAvisos: confirmar ? "true" : "false" }),
        );
      } catch (erro) {
        unstable_rethrow(erro);
        setMensagem({ tipo: "erro", texto: "Não foi possível salvar. Tente de novo." });
        return;
      }
      if (resultado.erro) {
        setMensagem({ tipo: "erro", texto: resultado.erro });
        return;
      }
      despachar({ tipo: "salvo", tema: enviado });
      setGravado(true);
      setMensagem({ tipo: "ok", texto: "Tema salvo. As telas do painel já usam as cores novas." });
    });
  }

  function restaurar() {
    if (!window.confirm("Voltar ao visual padrão do sistema? Os logos continuam.")) return;
    iniciar(async () => {
      let resultado;
      try {
        resultado = await restaurarTemaAction({}, formData({ empresaId }));
      } catch (erro) {
        unstable_rethrow(erro);
        setMensagem({ tipo: "erro", texto: "Não foi possível restaurar. Tente de novo." });
        return;
      }
      if (resultado.erro) {
        setMensagem({ tipo: "erro", texto: resultado.erro });
        return;
      }
      despachar({ tipo: "restaurado", tema: temaInicialDe(null, nomeEmpresa).tema });
      setGravado(false);
      setMensagem({ tipo: "ok", texto: "Visual padrão do sistema restaurado." });
    });
  }

  function exportar() {
    const blob = new Blob([`${JSON.stringify(tema, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = nomeArquivoTema(nomeEmpresa);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function importar(texto: string) {
    const resultado = analisarTexto(texto);
    if (!resultado.ok) {
      setErrosImportacao(resultado.erros);
      return;
    }
    if (!confirmarPerda()) return;
    despachar({ tipo: "carregar", tema: resultado.tema });
    setErrosImportacao([]);
    setImportando(false);
    setMensagem({ tipo: "ok", texto: `Tema "${resultado.tema.nome}" carregado no editor. Confira e salve.` });
  }

  function irParaProblema() {
    const alvo = document.querySelector<HTMLElement>("[data-problema='essencial'], [data-problema='secundario']");
    if (!alvo) return;
    const detalhes = alvo.closest("details");
    if (detalhes) detalhes.open = true;
    alvo.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div className="space-y-4">
      {aviso ? (
        <p role="status" className="rounded-lg border border-amber-500/50 p-3 text-sm">
          {aviso}
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-56 flex-1 space-y-1">
          <Label htmlFor="nome-tema">Nome do tema</Label>
          <Input
            id="nome-tema"
            value={tema.nome}
            maxLength={60}
            onChange={(e) => despachar({ tipo: "nome", nome: e.target.value })}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(tema.cores.escuro)}
            onChange={(e) => {
              if (!e.target.checked && !window.confirm("Remover o modo escuro? A empresa ficará só no claro.")) return;
              despachar({ tipo: "modoEscuro", ligado: e.target.checked });
            }}
          />
          Ter modo escuro
        </label>
      </div>

      <div role="group" aria-label="Modo em edição" className="inline-flex rounded-lg border p-0.5">
        {(["claro", "escuro"] as Modo[])
          .filter((m) => m === "claro" || tema.cores.escuro)
          .map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={modo === m}
              onClick={() => despachar({ tipo: "modo", modo: m })}
              className={`rounded-md px-3 py-1 text-sm ${modo === m ? "bg-primary text-primary-foreground" : ""}`}
            >
              {m === "claro" ? "Claro" : "Escuro"}
            </button>
          ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="min-w-0 space-y-3 lg:sticky lg:top-4 lg:order-last lg:self-start">
          {urlFontes ? <link rel="stylesheet" href={urlFontes} /> : null}
          <PreviaDoTema
            previa={{
              variaveis,
              raio: tema.raio ?? null,
              fonteTexto: tema.fontes?.texto?.pilha ?? null,
              fonteTitulos: tema.fontes?.titulos?.pilha ?? null,
            }}
            logoUrl={logoUrl}
            logoEscuroUrl={logoEscuroUrl}
          />
        </div>

        <div className="min-w-0 space-y-3">
          {GRUPOS.map((grupo) => (
            <Grupo key={grupo.titulo} titulo={grupo.titulo} aberto={grupo.aberto}>
              {grupo.papeis.map((papel) => (
                <CampoCor
                  key={`${modo}-${papel}`}
                  papel={papel}
                  valor={cores[papel]}
                  efetivo={valorEfetivo(tema, modo, papel)}
                  opcional={!OBRIGATORIOS.includes(papel)}
                  pares={pares}
                  onChange={(valor) => despachar({ tipo: "cor", papel, valor })}
                />
              ))}
            </Grupo>
          ))}
          <Grupo titulo="Gráficos">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={!cores.graficos}
                onChange={(e) => despachar({ tipo: "graficosAutomaticos", ligado: e.target.checked })}
              />
              Automático (cores padrão do sistema)
            </label>
            <div className="flex flex-wrap gap-2">
              {graficosEfetivos(tema, modo).map((cor, indice) => (
                <input
                  key={indice}
                  type="color"
                  aria-label={`Cor ${indice + 1} dos gráficos`}
                  value={String(cores.graficos?.[indice] ?? cor)}
                  disabled={!cores.graficos}
                  onChange={(e) => despachar({ tipo: "grafico", indice, valor: e.target.value })}
                  className="h-8 w-10 cursor-pointer rounded border bg-transparent p-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                />
              ))}
            </div>
          </Grupo>
          <Grupo titulo="Fontes e raio">
            <CamposFonte
              grupo="texto"
              fonte={tema.fontes?.texto}
              onChange={(fonte) => despachar({ tipo: "fonte", grupo: "texto", fonte })}
            />
            <CamposFonte
              grupo="titulos"
              fonte={tema.fontes?.titulos}
              onChange={(fonte) => despachar({ tipo: "fonte", grupo: "titulos", fonte })}
            />
            <CampoRaio raio={tema.raio} onChange={(px) => despachar({ tipo: "raio", px })} />
          </Grupo>
        </div>
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 space-y-2 border-t bg-background px-4 py-3 md:mx-0 md:rounded-lg md:border">
        {erros.length + avisos.length > 0 ? (
          <button type="button" onClick={irParaProblema} className="text-left text-sm underline-offset-4 hover:underline">
            <span className={erros.length ? "text-destructive font-medium" : ""}>
              {erros.length} {erros.length === 1 ? "erro" : "erros"}
            </span>
            {" · "}
            {avisos.length} {avisos.length === 1 ? "aviso" : "avisos"}
            {erros.length ? " (corrija os erros para salvar)" : ""}
          </button>
        ) : null}
        {erros.length > 0 ? (
          <ul className="max-h-32 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs text-destructive">
            {erros.map((erro) => (
              <li key={erro} className="break-words">
                {erro}
              </li>
            ))}
          </ul>
        ) : null}
        {mensagem ? (
          <p
            role={mensagem.tipo === "erro" ? "alert" : "status"}
            className={`text-sm whitespace-pre-line ${mensagem.tipo === "erro" ? "text-destructive" : ""}`}
          >
            {mensagem.texto}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setImportando(true)}>
            Importar JSON
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={exportar}>
            Exportar
          </Button>
          {gravado ? (
            <Button type="button" variant="outline" size="sm" onClick={restaurar} disabled={salvando}>
              Restaurar padrão
            </Button>
          ) : null}
          <span className="flex-1" />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!sujo || salvando}
            onClick={() => confirmarPerda() && despachar({ tipo: "descartar" })}
          >
            Descartar alterações
          </Button>
          <Button type="button" size="sm" disabled={!sujo || erros.length > 0 || salvando} onClick={salvar}>
            {salvando ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </div>

      <Dialog
        open={importando}
        onOpenChange={(aberto) => {
          setImportando(aberto);
          if (!aberto) setErrosImportacao([]);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importar tema (JSON)</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="arquivo-tema">Arquivo .json</Label>
              <Input
                id="arquivo-tema"
                type="file"
                accept="application/json,.json"
                onChange={async (e) => {
                  const arquivo = e.target.files?.[0];
                  e.target.value = "";
                  if (arquivo) importar(await arquivo.text());
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="texto-tema">Ou cole o JSON</Label>
              <textarea id="texto-tema" ref={textoImportado} rows={6} className={CLASSE_TEXTAREA} spellCheck={false} />
            </div>
            {errosImportacao.length > 0 ? (
              <div role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">
                <p className="font-medium">O arquivo não pode ser carregado:</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {errosImportacao.map((erro) => (
                    <li key={erro} className="break-words">
                      {erro}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Gere o arquivo com uma IA usando o{" "}
              <a href="/temas/modelo-pedido-ia.md" download className="underline underline-offset-4">
                modelo de pedido
              </a>
              {" "}(referências:{" "}
              <a href="/temas/nx-tema.schema.json" download className="underline underline-offset-4">
                formato
              </a>{" "}
              e{" "}
              <a href="/temas/hortitex.json" download className="underline underline-offset-4">
                exemplo Hortitex
              </a>
              ).
            </p>
            <Button type="button" onClick={() => importar(textoImportado.current?.value ?? "")}>
              Carregar no editor
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
