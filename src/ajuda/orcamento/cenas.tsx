"use client";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alvo, BotaoSimulado, CampoSimulado, SelectSimulado } from "@/components/ajuda/campos-simulados";
import type { PropsCena } from "@/ajuda/tipos";
import { formatarMoeda, formatarPercentual } from "@/lib/formatacao";
import { MESES_ABREVIADOS } from "@/lib/meses";
import { lerValorEmReais, valorParaCampo } from "@/lib/valorEmReais";
import { ANO, CATEGORIAS, MES, compararLinha, type CategoriaExemplo } from "./exemplo";

// Espelho de src/app/(dashboard)/controladoria/orcamento/*. Mudou um rótulo ou coluna lá? Ajuste aqui também.

/** Só estas linhas têm alvo nos roteiros; as demais desenham sem destaque. */
const LINHAS_COM_ALVO = new Set(["insumos", "mao-de-obra", "venda"]);

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

function LinhaGrade({ categoria, valores }: { categoria: CategoriaExemplo; valores: PropsCena["valores"] }) {
  const comAlvo = categoria.chave === "insumos";
  const linha = (
    <div className="flex items-center gap-2 border-b py-2">
      <span className={`${COLUNA_DO_NOME} truncate text-sm font-medium`}>{categoria.nome}</span>
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

const BLOCOS_DA_GRADE = [
  { titulo: "Despesas", categorias: CATEGORIAS.filter((c) => c.tipo === "DESPESA") },
  { titulo: "Receitas", categorias: CATEGORIAS.filter((c) => c.tipo === "RECEITA") },
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
                {bloco.categorias.map((categoria) => (
                  <LinhaGrade key={categoria.chave} categoria={categoria} valores={valores} />
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
              {CATEGORIAS.map((categoria) => {
                const { realizado, projetado } = filtro ? categoria.novembroFiscal : categoria.novembro;
                const orcado = orcadoDe(categoria, MES, valores);
                const linha = compararLinha(categoria.tipo, orcado, realizado, projetado);
                return (
                  <TableRow key={categoria.chave} className={linha.alerta ? "bg-destructive/10" : undefined}>
                    <TableCell className="font-medium">
                      {LINHAS_COM_ALVO.has(categoria.chave) ? (
                        <Alvo nome={`comp.linha.${categoria.chave}`} className="inline-block px-1">
                          {categoria.nome}
                        </Alvo>
                      ) : (
                        categoria.nome
                      )}
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
