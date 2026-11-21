"use client";

// Espelho de src/app/(dashboard)/empresas/page.tsx, empresa-dialog-form.tsx e da página Tema e marca
// (empresas/[id]/tema: editor-tema.tsx, campo-cor.tsx, previa-tema.tsx, marca-form.tsx). Mudou um rótulo, campo ou
// botão lá? Ajuste aqui também.

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alvo, BotaoSimulado, CampoSimulado, JanelaSimulada } from "@/components/ajuda/campos-simulados";
import type { PropsCena, Valores } from "@/ajuda/tipos";
import { CONTRASTE_MINIMO, contraste } from "@/lib/tema/contraste";
import { ROTULOS } from "@/lib/tema/editor";
import { cn } from "@/lib/utils";
import { BOA_VISTA, DEMONSTRACAO, EMPRESAS, RIO_PARA, TEMA, type EmpresaExemplo } from "./exemplo";

/** As empresas no ponto do roteiro, em ordem de razão social, como a tela lista. */
export function empresasDoRoteiro(valores: Valores): (EmpresaExemplo & { ativa: boolean })[] {
  const linhas = EMPRESAS.map((e) => ({ ...e, ativa: e.chave !== RIO_PARA.chave || valores["lista.rio-para"] !== "Inativa" }));
  if (valores["lista.boa-vista"] === "sim") {
    linhas.push({ ...BOA_VISTA, exigirAprovacaoPorOutro: valores["form.aprovacao"] !== "nao", ativa: true });
  }
  return linhas.sort((a, b) => a.razaoSocial.localeCompare(b.razaoSocial, "pt-BR"));
}

function Talvez({ alvo, children }: { alvo?: string; children: ReactNode }) {
  return alvo ? (
    <Alvo nome={alvo} className="inline-block px-1">
      {children}
    </Alvo>
  ) : (
    <>{children}</>
  );
}

function Caixinha({ marcada }: { marcada: boolean }) {
  return (
    <span
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-sm border border-input text-[10px]",
        marcada && "border-primary bg-primary text-primary-foreground",
      )}
    >
      {marcada ? "✓" : ""}
    </span>
  );
}

export function CenaLista({ valores }: PropsCena) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">Empresas</p>
          <p className="text-sm text-muted-foreground">Empresas que você administra. Cada empresa é um contexto isolado de dados.</p>
        </div>
        <BotaoSimulado alvo="lista.nova">Nova empresa</BotaoSimulado>
      </div>
      <Alvo nome="lista.tabela" className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome fantasia</TableHead>
              <TableHead>Razão social</TableHead>
              <TableHead>CNPJ/CPF</TableHead>
              <TableHead>Moeda</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {empresasDoRoteiro(valores).map((e) => {
              const aqui = e.chave === DEMONSTRACAO.chave;
              const status = <Badge variant={e.ativa ? "default" : "secondary"}>{e.ativa ? "Ativa" : "Inativa"}</Badge>;
              return (
                <TableRow key={e.chave}>
                  <TableCell className="font-medium">
                    <Talvez
                      alvo={e.chave === BOA_VISTA.chave ? "lista.boa-vista" : aqui ? "lista.demonstracao" : undefined}
                    >
                      {e.nomeFantasia}
                    </Talvez>
                  </TableCell>
                  <TableCell>{e.razaoSocial}</TableCell>
                  <TableCell>{e.cnpjCpf}</TableCell>
                  <TableCell>{e.moeda}</TableCell>
                  <TableCell>
                    <Talvez alvo={e.chave === RIO_PARA.chave ? "lista.rio-para" : undefined}>{status}</Talvez>
                  </TableCell>
                  <TableCell className="flex justify-end gap-2">
                    <BotaoSimulado
                      alvo={e.chave === BOA_VISTA.chave ? "lista.editar-boa-vista" : undefined}
                      variant="outline"
                      size="sm"
                    >
                      Editar
                    </BotaoSimulado>
                    <BotaoSimulado alvo={aqui ? "lista.tema-demonstracao" : undefined} variant="outline" size="sm">
                      Tema e marca
                    </BotaoSimulado>
                    {aqui ? null : (
                      <BotaoSimulado
                        alvo={e.chave === RIO_PARA.chave ? "lista.inativar-rio-para" : undefined}
                        variant="outline"
                        size="sm"
                      >
                        {e.ativa ? "Inativar" : "Reativar"}
                      </BotaoSimulado>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Alvo>
    </div>
  );
}

function FormularioEmpresa({ valores, titulo, cnpj }: PropsCena & { titulo: string; cnpj?: string }) {
  const aprovacao = valores["form.aprovacao"] !== "nao";
  return (
    <JanelaSimulada titulo={titulo}>
      <CampoSimulado alvo="form.razao" rotulo="Razão social" valor={valores["form.razao"]} />
      <CampoSimulado alvo="form.fantasia" rotulo="Nome fantasia" valor={valores["form.fantasia"]} />
      <CampoSimulado alvo="form.cnpj" rotulo="CNPJ/CPF" valor={cnpj ?? valores["form.cnpj"]} />
      <CampoSimulado alvo="form.moeda" rotulo="Moeda padrão" valor={valores["form.moeda"] ?? "BRL"} />
      <Alvo nome="form.cor" className="space-y-2 px-1">
        <div className="flex items-center gap-2 text-sm">
          <Caixinha marcada={false} />
          Usar cor personalizada nesta empresa
        </div>
        <span aria-hidden className="block h-9 w-16 rounded border bg-[#0b2545] opacity-40" />
      </Alvo>
      <CampoSimulado alvo="form.logo" rotulo="Logo" valor="Escolher arquivo · Nenhum arquivo escolhido" />
      <Alvo nome="form.aprovacao" className="space-y-1 px-1">
        <div className="flex items-center gap-2 text-sm">
          <Caixinha marcada={aprovacao} />
          Exigir que a baixa seja aprovada por outra pessoa
        </div>
        <p className="text-sm text-muted-foreground">
          Quem registra uma baixa não pode aprová-la. Desmarque se a empresa tem uma pessoa só no financeiro.
        </p>
      </Alvo>
      <BotaoSimulado alvo="form.salvar" largo>
        Salvar
      </BotaoSimulado>
    </JanelaSimulada>
  );
}

export const CenaNova = (props: PropsCena) => <FormularioEmpresa {...props} titulo="Nova empresa" />;
export const CenaEditar = (props: PropsCena) => (
  <FormularioEmpresa {...props} titulo="Editar empresa" cnpj={BOA_VISTA.cnpjCpf} />
);

const DECIMAL = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

/** O contraste do texto dos botões com a primária em edição: o mesmo cálculo do editor. */
export function contrasteDaPrimaria(valores: Valores) {
  const primaria = valores["tema.primaria"] ?? TEMA.primariaReprovada;
  const razao = contraste(TEMA.textoSobrePrimaria, primaria);
  return { primaria, razao, ok: razao >= CONTRASTE_MINIMO };
}

function LinhaCor({ rotulo, cor, alvo, selo }: { rotulo: string; cor: string; alvo?: string; selo?: ReactNode }) {
  const conteudo = (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-40 flex-1 text-sm">{rotulo}</span>
        <span aria-hidden className="h-8 w-10 shrink-0 rounded border p-0.5">
          <span className="block size-full rounded-sm" style={{ backgroundColor: cor }} />
        </span>
        <span className="flex h-8 w-24 items-center rounded-lg border px-2 font-mono text-xs">{cor}</span>
      </div>
      {selo}
    </div>
  );
  return alvo ? <Alvo nome={alvo}>{conteudo}</Alvo> : conteudo;
}

function GrupoFechado({ titulo, alvo, children }: { titulo: string; alvo?: string; children?: ReactNode }) {
  const caixa = (
    <div className="rounded-lg border">
      <p className="px-3 py-2 text-sm font-medium">
        <span className="mr-1 inline-block">{children ? "⌄" : "›"}</span>
        {titulo}
      </p>
      {children ? <div className="space-y-3 border-t px-3 py-3">{children}</div> : null}
    </div>
  );
  return alvo ? <Alvo nome={alvo}>{caixa}</Alvo> : caixa;
}

export function CenaTema({ valores }: PropsCena) {
  const { primaria, razao, ok } = contrasteDaPrimaria(valores);
  const salvo = valores["tema.salvar"] === "sim";
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted-foreground underline-offset-4">Empresas</p>
        <p className="text-lg font-semibold">Tema e marca · {DEMONSTRACAO.nomeFantasia}</p>
        <p className="text-sm text-muted-foreground">
          Cores, fontes e logos do painel desta empresa. Sem tema salvo, vale o visual padrão do sistema.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <CampoSimulado alvo="tema.nome" rotulo="Nome do tema" valor={TEMA.nome} className="min-w-56 flex-1" />
        <span className="flex items-center gap-2 text-sm">
          <Caixinha marcada />
          Ter modo escuro
        </span>
      </div>
      <Alvo nome="tema.modo" className="inline-flex rounded-lg border p-0.5">
        <span className="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground">Claro</span>
        <span className="rounded-md px-3 py-1 text-sm">Escuro</span>
      </Alvo>
      <div className="grid gap-4 lg:grid-cols-2">
        <Alvo nome="tema.previa" className="lg:order-last">
          <div className="overflow-hidden rounded-lg border" style={{ backgroundColor: TEMA.fundo, color: TEMA.texto }}>
            <div className="flex">
              <div className="w-24 space-y-2 p-3 text-xs" style={{ backgroundColor: TEMA.sidebar, color: TEMA.textoSobreSidebar }}>
                <p className="font-semibold">NX Control</p>
                <p>Financeiro</p>
                <p>Produção</p>
              </div>
              <div className="flex-1 space-y-3 p-4">
                <p className="text-sm font-semibold">Prévia</p>
                <p className="text-xs">Assim fica o painel com estas cores.</p>
                <span
                  className="inline-block rounded-md px-3 py-1 text-xs font-medium"
                  style={{ backgroundColor: primaria, color: TEMA.textoSobrePrimaria }}
                >
                  Salvar
                </span>
              </div>
            </div>
          </div>
        </Alvo>
        <div className="space-y-3">
          <Alvo nome="tema.essenciais">
            <GrupoFechado titulo="Essenciais">
              <LinhaCor rotulo={ROTULOS.fundo} cor={TEMA.fundo} />
              <LinhaCor rotulo={ROTULOS.texto} cor={TEMA.texto} />
              <LinhaCor rotulo={ROTULOS.primaria} cor={primaria} alvo="tema.primaria" />
              <LinhaCor
                rotulo={ROTULOS.textoSobrePrimaria}
                cor={TEMA.textoSobrePrimaria}
                selo={
                  <Alvo nome="tema.selo" className="inline-block px-1">
                    <span className={cn("text-xs", ok ? "text-muted-foreground" : "font-medium text-destructive")}>
                      {ok ? "✓" : "✕"} {DECIMAL.format(razao)}:1 com {ROTULOS.primaria}
                    </span>
                  </Alvo>
                }
              />
              <LinhaCor rotulo={ROTULOS.sidebar} cor={TEMA.sidebar} />
              <LinhaCor rotulo={ROTULOS.textoSobreSidebar} cor={TEMA.textoSobreSidebar} />
            </GrupoFechado>
          </Alvo>
          <GrupoFechado titulo="Superfícies e apoio" alvo="tema.opcional">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 opacity-60">
                <span className="min-w-40 flex-1 text-sm">{ROTULOS.cartao}</span>
                <span className="h-8 w-10 rounded border" style={{ backgroundColor: TEMA.fundo }} />
                <span className="flex h-8 w-24 items-center rounded-lg border px-2 font-mono text-xs">{TEMA.fundo}</span>
              </div>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <Caixinha marcada />
                Automático (herda de Fundo)
              </span>
            </div>
          </GrupoFechado>
          <GrupoFechado titulo="Cabeçalho, foco, borda e erro" />
          <GrupoFechado titulo="Gráficos" />
          <GrupoFechado titulo="Fontes e raio" alvo="tema.fontes" />
        </div>
      </div>
      <div className="space-y-2 rounded-lg border px-4 py-3">
        {ok ? null : (
          <Alvo nome="tema.resumo" className="inline-block px-1 text-sm">
            <span className="font-medium text-destructive">1 erro</span> · 0 avisos (corrija os erros para salvar)
          </Alvo>
        )}
        {salvo ? <p className="text-sm">Tema salvo.</p> : null}
        <div className="flex flex-wrap gap-2">
          <BotaoSimulado alvo="tema.importar" variant="outline" size="sm">
            Importar JSON
          </BotaoSimulado>
          <BotaoSimulado alvo="tema.exportar" variant="outline" size="sm">
            Exportar
          </BotaoSimulado>
          {salvo ? (
            <BotaoSimulado variant="outline" size="sm">
              Restaurar padrão
            </BotaoSimulado>
          ) : null}
          <span className="flex-1" />
          <BotaoSimulado variant="outline" size="sm">
            Descartar alterações
          </BotaoSimulado>
          {/* Com erro, o Salvar real fica desabilitado. */}
          <BotaoSimulado alvo="tema.salvar" size="sm" className={ok ? undefined : "opacity-50"}>
            Salvar
          </BotaoSimulado>
        </div>
      </div>
    </div>
  );
}

function CampoImagem({ alvo, rotulo, dica, escuro = false }: { alvo: string; rotulo: string; dica: string; escuro?: boolean }) {
  return (
    <Alvo nome={alvo} className="space-y-2 px-1">
      <p className="text-sm font-medium">{rotulo}</p>
      <div className={cn("flex h-16 items-center justify-center rounded-lg border text-xs", escuro ? "bg-[#2e1238] text-white" : "text-muted-foreground")}>
        Sem imagem
      </div>
      <div className="flex h-8 items-center rounded-lg border px-2.5 text-xs text-muted-foreground">Escolher arquivo</div>
      <p className="text-xs text-muted-foreground">{dica}</p>
    </Alvo>
  );
}

export function CenaMarca() {
  return (
    <div className="space-y-4">
      <p className="text-base font-semibold">Marca</p>
      <div className="grid gap-4 md:grid-cols-3">
        <CampoImagem alvo="marca.logo" rotulo="Logo para fundo claro" dica="PNG, JPG, SVG ou WebP, até 1 MB." />
        <CampoImagem alvo="marca.logo-escuro" rotulo="Logo para fundo escuro" dica="Usado quando a barra lateral é escura." escuro />
        <CampoImagem alvo="marca.favicon" rotulo="Favicon" dica="Ícone da aba do navegador: PNG, SVG ou ICO." />
      </div>
      <BotaoSimulado alvo="marca.salvar">Salvar marca</BotaoSimulado>
    </div>
  );
}
