"use client";

import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alvo, BotaoSimulado, CampoSimulado, SelectSimulado } from "@/components/ajuda/campos-simulados";
import type { PropsCena } from "@/ajuda/tipos";
import { formatarMoeda, formatarPercentual } from "@/lib/formatacao";
import { montarArvore } from "@/lib/arvoreDeLinhas";
import { MESES_ABREVIADOS } from "@/lib/meses";
import { recuoDoNivel } from "@/lib/recuoDoNivel";
import { lerValorEmReais, valorParaCampo } from "@/lib/valorEmReais";
import { ANO, CATEGORIAS, MES, compararLinha, type CategoriaExemplo } from "./exemplo";

// Espelho de src/app/(dashboard)/controladoria/orcamento/*. Mudou um rótulo ou coluna lá? Ajuste aqui também.

/** Só estas linhas têm alvo nos roteiros; as demais desenham sem destaque. */
const LINHAS_COM_ALVO = new Set(["bancarias", "insumos", "mao-de-obra", "venda"]);

/** Orçado do mês, com o que o roteiro digitou por cima na grade (lido como a tela lê). */
function orcadoDe(categoria: CategoriaExemplo, mes: number, valores: PropsCena["valores"]): number {
  const digitado = valores[`grade.${categoria.chave}.mes-${mes}`];
  return digitado !== undefined ? (lerValorEmReais(digitado) ?? 0) : categoria.orcadoPorMes[mes - 1];
}

const COLUNA_DO_NOME = "sticky left-0 z-10 w-40 shrink-0 bg-background";

function CabecalhoDaGrade({ titulo }: { titulo: string }) {
  return (
    <div className="flex items-end gap-2 border-b pt-4 pb-1 text-xs text-muted-foreground">
      <span className={`${COLUNA_DO_NOME} text-sm font-semibold text-foreground`}>{titulo}</span>
      {MESES_ABREVIADOS.map((mes) => (
        <span key={mes} className="w-24 shrink-0 px-1">
          {mes}
        </span>
      ))}
    </div>
  );
}

function LinhaGrade({
  categoria,
  nivel,
  valores,
}: {
  categoria: CategoriaExemplo;
  nivel: number;
  valores: PropsCena["valores"];
}) {
  const comAlvo = categoria.chave === "insumos";
  const linha = (
    <div className="flex items-center gap-2 border-b py-2">
      <span className={`${COLUNA_DO_NOME} truncate text-sm font-medium`} style={recuoDoNivel(nivel)}>
        {categoria.nome}
      </span>
      {categoria.orcadoPorMes.map((_, indice) => {
        const mes = indice + 1;
        const digitado = valores[`grade.${categoria.chave}.mes-${mes}`];
        return (
          <CampoSimulado
            key={mes}
            alvo={comAlvo && mes === MES ? `grade.${categoria.chave}.mes-${mes}` : undefined}
            valor={digitado ?? valorParaCampo(orcadoDe(categoria, mes, valores))}
            className="w-24 shrink-0"
          />
        );
      })}
      <BotaoSimulado alvo={comAlvo ? `grade.${categoria.chave}.salvar` : undefined} size="sm">
        Salvar
      </BotaoSimulado>
      {comAlvo && valores[`grade.${categoria.chave}.salvar`] === "salvo" ? (
        <span className="text-xs text-muted-foreground">Salvo</span>
      ) : null}
    </div>
  );
  return comAlvo ? <Alvo nome={`grade.${categoria.chave}`}>{linha}</Alvo> : linha;
}

/** Categorias em ordem de árvore: cada filha logo abaixo da mãe, com o nível para o recuo. */
const emArvore = (tipo: CategoriaExemplo["tipo"]) =>
  montarArvore(
    CATEGORIAS.filter((c) => c.tipo === tipo).map((c) => ({ ...c, id: c.chave, parentId: c.pai ?? null, grupo: c.tipo })),
    () => ({}),
  );

const BLOCOS_DA_GRADE = [
  { titulo: "Despesas", itens: emArvore("DESPESA") },
  { titulo: "Receitas", itens: emArvore("RECEITA") },
];

function CabecalhoComAlvo({ alvo, children }: { alvo: string; children: string }) {
  return (
    <TableHead>
      <Alvo nome={alvo} className="inline-block px-1">
        {children}
      </Alvo>
    </TableHead>
  );
}

export function CenaPainel({ valores }: PropsCena) {
  const filtro = valores["painel.classificacao"];
  const itensDoComparativo = montarArvore(
    CATEGORIAS.map((c) => ({ ...c, id: c.chave, parentId: c.pai ?? null, grupo: c.tipo })),
    (categoria) => {
      const { realizado, projetado } = filtro ? categoria.novembroFiscal : categoria.novembro;
      return { orcado: orcadoDe(categoria, MES, valores), realizado, projetado };
    },
  );

  return (
    <div className="space-y-8">
      <div>
        <p className="text-lg font-semibold">Orçamento</p>
        <p className="text-sm text-muted-foreground">
          Orçamento por categoria financeira e mês. Comparativo usa o realizado (movimentações conciliadas) e o
          projetado (títulos em aberto) já existentes no sistema.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Alvo nome="painel.ano" className="flex flex-wrap items-center gap-2 p-1">
          <BotaoSimulado variant="outline" size="sm">
            Ano anterior
          </BotaoSimulado>
          <span className="text-sm font-medium">{ANO}</span>
          <BotaoSimulado variant="outline" size="sm">
            Próximo ano
          </BotaoSimulado>
        </Alvo>
        <SelectSimulado alvo="painel.mes" valor="Novembro" className="w-40" />
        <SelectSimulado alvo="painel.classificacao" valor={filtro || "Todos"} className="w-40" />
        <Alvo nome="painel.exportar" className="flex flex-wrap gap-x-3 gap-y-1 p-1 text-sm text-primary">
          <span>Exportar CSV</span>
          <span>Exportar Excel</span>
          <span>Exportar PDF</span>
        </Alvo>
      </div>

      {filtro && (
        <Alvo nome="painel.aviso">
          <p className="text-sm text-muted-foreground">
            Realizado e projetado mostram só o movimento {filtro.toLowerCase()}; o orçado é um só e não é dividido
            por classificação.
          </p>
        </Alvo>
      )}

      <Alvo nome="grade.secao" className="space-y-2">
        <p className="text-base font-semibold">Valores orçados — {ANO}</p>
        <div className="overflow-x-auto">
          <div className="w-max min-w-full">
            {BLOCOS_DA_GRADE.map((bloco) => (
              <div key={bloco.titulo}>
                <CabecalhoDaGrade titulo={bloco.titulo} />
                {bloco.itens.map((item) => (
                  <LinhaGrade key={item.chave} categoria={item.origem} nivel={item.nivel} valores={valores} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </Alvo>

      <section className="space-y-2">
        <p className="text-base font-semibold">Comparativo — mês selecionado</p>
        <Alvo nome="comp.tabela">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Categoria</TableHead>
                <TableHead>Orçado</TableHead>
                <CabecalhoComAlvo alvo="comp.realizado">Realizado</CabecalhoComAlvo>
                <CabecalhoComAlvo alvo="comp.projetado">Projetado</CabecalhoComAlvo>
                <TableHead>Previsto</TableHead>
                <TableHead>Variação</TableHead>
                <TableHead>Variação %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itensDoComparativo.map((item) => {
                const categoria = item.origem;
                const { orcado, realizado, projetado } = item.valores;
                const linha = compararLinha(categoria.tipo, orcado, realizado, projetado);
                const nome = LINHAS_COM_ALVO.has(categoria.chave) && !item.direto ? (
                  <Alvo nome={`comp.linha.${categoria.chave}`} className="inline-block px-1">
                    {item.nome}
                  </Alvo>
                ) : (
                  item.nome
                );
                return (
                  <TableRow key={item.chave} className={linha.alerta ? "bg-destructive/10" : undefined}>
                    <TableCell
                      className={item.direto ? "text-muted-foreground" : item.temFilhos ? "font-semibold" : "font-medium"}
                    >
                      <div className="flex items-center gap-1" style={recuoDoNivel(item.nivel)}>
                        {item.temFilhos ? (
                          <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
                        ) : (
                          <span className="inline-block w-5" aria-hidden />
                        )}
                        {nome}
                      </div>
                    </TableCell>
                    <TableCell>{formatarMoeda(orcado)}</TableCell>
                    <TableCell>{formatarMoeda(realizado)}</TableCell>
                    <TableCell>{formatarMoeda(projetado)}</TableCell>
                    <TableCell className="font-medium">{formatarMoeda(linha.previsto)}</TableCell>
                    <TableCell className={linha.alerta ? "font-medium text-destructive" : undefined}>
                      <div className="flex items-center gap-2">
                        {formatarMoeda(linha.variacaoAbsoluta)}
                        {linha.alerta && <Badge variant="destructive">Estouro</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      {linha.variacaoPercentual === null ? "—" : formatarPercentual(linha.variacaoPercentual)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Alvo>
      </section>
    </div>
  );
}
