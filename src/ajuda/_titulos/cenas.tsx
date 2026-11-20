"use client";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Alvo,
  BotaoSimulado,
  CampoSimulado,
  JanelaSimulada,
  SelectSimulado,
} from "@/components/ajuda/campos-simulados";
import type { PropsCena, TipoTela } from "@/ajuda/tipos";
import type { ExemploTitulos } from "./exemplo";

// Espelho de src/app/(dashboard)/financeiro/_titulos/*. Mudou um rótulo ou campo lá? Ajuste aqui também.
// As cenas valem para Contas a pagar e Contas a receber: os rótulos vêm de `tipo` e os dados, do exemplo.

type ComExemplo = { exemplo: ExemploTitulos };

const rotuloContraparte = (tipo: TipoTela) => (tipo === "PAGAR" ? "Fornecedor" : "Cliente");
const sufixo = (tipo: TipoTela) => (tipo === "PAGAR" ? "a pagar" : "a receber");
const VARIANTE_STATUS: Record<string, "default" | "secondary" | "destructive"> = {
  PAGO: "default",
  VENCIDO: "destructive",
};

function BarraDeFiltros({ tipo, valores }: PropsCena) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <SelectSimulado
        alvo="lista.filtro.classificacao"
        compacto
        rotulo="Classificação"
        valor={valores["lista.filtro.classificacao"] || "Todas"}
        className="w-40"
      />
      <SelectSimulado
        alvo="lista.filtro.categoria"
        compacto
        rotulo="Categoria"
        valor={valores["lista.filtro.categoria"] || "Todas"}
        className="w-48"
      />
      <SelectSimulado
        alvo="lista.filtro.fornecedor"
        compacto
        rotulo={rotuloContraparte(tipo)}
        valor={valores["lista.filtro.fornecedor"] || "Todos"}
        className="w-48"
      />
      <SelectSimulado compacto rotulo="Centro de custo" valor="Todos" className="w-48" />
      <SelectSimulado compacto rotulo="Centro de lucro" valor="Todos" className="w-48" />
      <SelectSimulado compacto rotulo="Safra" valor="Todas" className="w-48" />
      <SelectSimulado compacto rotulo="Projeto" valor="Todos" className="w-48" />
      <SelectSimulado
        alvo="lista.filtro.status"
        compacto
        rotulo="Status"
        valor={valores["lista.filtro.status"] || "Todos os status"}
        className="w-48"
      />
      <CampoSimulado
        alvo="lista.filtro.vencimentoDe"
        compacto
        rotulo="Vencimento de"
        valor={valores["lista.filtro.vencimentoDe"]}
        placeholder="dd/mm/aaaa"
        className="w-40"
      />
      <CampoSimulado
        alvo="lista.filtro.vencimentoAte"
        compacto
        rotulo="Vencimento até"
        valor={valores["lista.filtro.vencimentoAte"]}
        placeholder="dd/mm/aaaa"
        className="w-40"
      />
      <BotaoSimulado alvo="lista.filtro.limpar" variant="outline" size="sm">
        Limpar filtros
      </BotaoSimulado>
    </div>
  );
}

function Detalhe({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex gap-1">
      <dt className="text-muted-foreground">{rotulo}:</dt>
      <dd>{valor}</dd>
    </div>
  );
}

function LinhasDoExemplo({ valores, exemplo }: Pick<PropsCena, "valores"> & ComExemplo) {
  const expandido = valores["lista.linhaExemplo"] === "expandida";
  return (
    <>
      <TableRow className={expandido ? "bg-muted/50" : undefined}>
        <TableCell>
          <Alvo nome="lista.linhaExemplo" className="inline-flex flex-col p-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">{exemplo.documento}</span>
              <Badge variant="outline">Fiscal</Badge>
            </div>
            <div className="text-xs text-muted-foreground">
              {exemplo.tipoComprovante} nº {exemplo.numeroNota} / série {exemplo.serie}
            </div>
          </Alvo>
        </TableCell>
        <TableCell>{exemplo.contraparte}</TableCell>
        <TableCell>{exemplo.categoria}</TableCell>
        <TableCell className="text-right">{exemplo.parcelas.length}</TableCell>
        <TableCell className="text-right">
          <BotaoSimulado variant="outline" size="sm">
            Editar
          </BotaoSimulado>
        </TableCell>
      </TableRow>
      {expandido && (
        <>
          <TableRow className="bg-muted/30">
            <TableCell colSpan={5}>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
                <Detalhe rotulo="Emissão" valor={exemplo.emissao} />
                <Detalhe rotulo="Competência" valor={exemplo.competencia} />
                <Detalhe rotulo="Centro de custo" valor={exemplo.centroCusto ?? "—"} />
                <Detalhe rotulo="Centro de lucro" valor={exemplo.centroLucro ?? "—"} />
                <Detalhe rotulo="Safra" valor={exemplo.safra ?? "—"} />
                <Detalhe rotulo="Projeto" valor="—" />
                <Detalhe rotulo="Conta bancária" valor={exemplo.conta} />
                <Detalhe rotulo="Forma de pagamento" valor={exemplo.formaPagamento} />
                <Detalhe rotulo="Classificação" valor="Fiscal" />
                <Detalhe rotulo="Comprovante" valor={exemplo.tipoComprovante} />
              </dl>
            </TableCell>
          </TableRow>
          {exemplo.parcelas.map((parcela) => {
            const p = `lista.p${parcela.numero}`;
            return (
              <TableRow key={parcela.numero} className="bg-muted/30">
                <TableCell colSpan={3} className="pl-8">
                  Parcela {parcela.numero} — venc. {parcela.vencimento} — valor {parcela.valorFormatado}
                </TableCell>
                <TableCell>
                  <Badge variant={VARIANTE_STATUS[parcela.status] ?? "secondary"}>{parcela.status}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <div className="flex items-center gap-1">
                      <CampoSimulado
                        alvo={`${p}.vencimento`}
                        valor={valores[`${p}.vencimento`] ?? parcela.vencimento}
                        className="w-32"
                      />
                      <BotaoSimulado alvo={`${p}.alterar`} variant="outline" size="sm">
                        Alterar vencimento
                      </BotaoSimulado>
                    </div>
                    <BotaoSimulado alvo={`${p}.baixar`} size="sm">
                      Baixar
                    </BotaoSimulado>
                    {parcela.status === "VENCIDO" && (
                      <BotaoSimulado alvo={`${p}.renegociar`} variant="outline" size="sm">
                        Renegociar
                      </BotaoSimulado>
                    )}
                    <BotaoSimulado alvo={`${p}.cancelar`} variant="outline" size="sm">
                      Cancelar
                    </BotaoSimulado>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
          <TableRow className="bg-muted/30">
            <TableCell colSpan={5}>
              <div className="space-y-2 py-2 pl-8 text-sm">
                <div className="font-medium text-muted-foreground">Anexos</div>
                <CampoSimulado placeholder="Escolher arquivo — nenhum arquivo escolhido" className="max-w-sm" />
              </div>
            </TableCell>
          </TableRow>
        </>
      )}
    </>
  );
}

function CenaLista({ tipo, valores, exemplo }: PropsCena & ComExemplo) {
  const semExemplo = valores["lista.tabela"] === "sem-exemplo";
  const filtrado = Boolean(valores["lista.filtro.fornecedor"]);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">{tipo === "PAGAR" ? "Contas a pagar" : "Contas a receber"}</p>
          <p className="text-sm text-muted-foreground">Títulos e parcelas {sufixo(tipo)} da filial ativa.</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Alvo nome="lista.exportar" className="flex flex-wrap gap-x-3 gap-y-1 p-1 text-sm text-primary">
            <span>Exportar CSV</span>
            <span>Exportar Excel</span>
            <span>Exportar PDF</span>
          </Alvo>
          <BotaoSimulado alvo="lista.novo">Novo título {sufixo(tipo)}</BotaoSimulado>
        </div>
      </div>
      <BarraDeFiltros tipo={tipo} valores={valores} />
      <div className="space-y-4">
        <div className="flex justify-end">
          <BotaoSimulado alvo="lista.importar" variant="outline">
            Importar CSV
          </BotaoSimulado>
        </div>
        <Alvo nome="lista.tabela">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Documento</TableHead>
                <TableHead>{rotuloContraparte(tipo)}</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Parcelas</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!filtrado &&
                exemplo.outrosTitulos.map((titulo) => (
                  <TableRow key={titulo.documento}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{titulo.documento}</span>
                        <Badge variant={titulo.classificacao === "Fiscal" ? "outline" : "secondary"}>
                          {titulo.classificacao}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>{titulo.contraparte}</TableCell>
                    <TableCell>{titulo.categoria}</TableCell>
                    <TableCell className="text-right">{titulo.parcelas}</TableCell>
                    <TableCell className="text-right">
                      <BotaoSimulado variant="outline" size="sm">
                        Editar
                      </BotaoSimulado>
                    </TableCell>
                  </TableRow>
                ))}
              {!semExemplo && <LinhasDoExemplo valores={valores} exemplo={exemplo} />}
            </TableBody>
          </Table>
        </Alvo>
      </div>
    </div>
  );
}

function LinhaDeParcela({
  alvo,
  valores,
  vencimento,
  valor,
  removivel,
}: {
  alvo: string;
  valores: PropsCena["valores"];
  vencimento: string;
  valor: string;
  removivel: boolean;
}) {
  const preenchida = valores[alvo] === "preenchida";
  return (
    <Alvo nome={alvo} className="flex items-end gap-2 p-1">
      <CampoSimulado valor={preenchida ? vencimento : undefined} placeholder="dd/mm/aaaa" />
      <CampoSimulado valor={preenchida ? valor : undefined} placeholder="Valor" />
      {removivel && (
        <BotaoSimulado variant="outline" size="sm">
          Remover
        </BotaoSimulado>
      )}
    </Alvo>
  );
}

function CenaNovoTitulo({ tipo, valores, exemplo }: PropsCena & ComExemplo) {
  const comNota = Boolean(valores["novo.tipoComprovante"]);
  const linhas = [1, 2, 3].filter((n) => n === 1 || valores[`novo.parcela${n}`] !== undefined);
  return (
    <JanelaSimulada titulo="Novo título">
      <SelectSimulado alvo="novo.fornecedor" rotulo={rotuloContraparte(tipo)} valor={valores["novo.fornecedor"]} />
      <CampoSimulado alvo="novo.documento" rotulo="Documento" valor={valores["novo.documento"]} />
      <div className="grid grid-cols-2 gap-4">
        <CampoSimulado alvo="novo.emissao" rotulo="Emissão" valor={valores["novo.emissao"]} placeholder="dd/mm/aaaa" />
        <CampoSimulado
          alvo="novo.competencia"
          rotulo="Competência"
          valor={valores["novo.competencia"]}
          placeholder="dd/mm/aaaa"
        />
      </div>
      <SelectSimulado alvo="novo.categoria" rotulo="Categoria financeira" valor={valores["novo.categoria"]} />
      <div className="grid grid-cols-2 gap-4">
        <SelectSimulado alvo="novo.centroCusto" rotulo="Centro de custo" valor={valores["novo.centroCusto"] ?? "Nenhum"} />
        <SelectSimulado alvo="novo.centroLucro" rotulo="Centro de lucro" valor={valores["novo.centroLucro"] ?? "Nenhum"} />
        <SelectSimulado alvo="novo.safra" rotulo="Safra" valor={valores["novo.safra"] ?? "Nenhum"} />
        <SelectSimulado alvo="novo.projeto" rotulo="Projeto" valor={valores["novo.projeto"] ?? "Nenhum"} />
      </div>
      <SelectSimulado alvo="novo.conta" rotulo="Conta bancária prevista" valor={valores["novo.conta"] ?? "Nenhuma"} />
      <CampoSimulado
        alvo="novo.formaPagamento"
        rotulo="Forma de pagamento"
        valor={valores["novo.formaPagamento"]}
        placeholder="Opcional (ex.: Boleto, PIX)"
      />
      <Separator />
      <p className="text-sm font-medium">Documento fiscal</p>
      <div className="grid grid-cols-2 gap-4">
        <SelectSimulado
          alvo="novo.classificacao"
          rotulo="Classificação"
          valor={valores["novo.classificacao"] ?? exemplo.classificacao}
        />
        <SelectSimulado
          alvo="novo.tipoComprovante"
          rotulo="Tipo de comprovante"
          valor={valores["novo.tipoComprovante"] ?? "Nenhum"}
        />
      </div>
      {comNota && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <CampoSimulado alvo="novo.numeroNota" rotulo="Nº da nota" valor={valores["novo.numeroNota"]} />
            <CampoSimulado alvo="novo.serie" rotulo="Série" valor={valores["novo.serie"]} />
            <CampoSimulado
              alvo="novo.emissaoNota"
              rotulo="Emissão da nota"
              valor={valores["novo.emissaoNota"]}
              placeholder="dd/mm/aaaa"
            />
          </div>
          <Alvo nome="novo.chave" className="space-y-2">
            <CampoSimulado
              rotulo="Chave de acesso"
              valor={valores["novo.chave"]}
              placeholder="44 dígitos (pode colar com espaços)"
            />
            <p className="text-xs text-muted-foreground">
              {valores["novo.chave"] ? "Chave válida" : "Opcional — sem ela o título fica como pendência fiscal"}
            </p>
          </Alvo>
        </>
      )}
      <Alvo nome="novo.parcelas" className="space-y-2">
        <span className="text-sm leading-none font-medium">Parcelas</span>
        {linhas.map((n) => (
          <LinhaDeParcela
            key={n}
            alvo={`novo.parcela${n}`}
            valores={valores}
            vencimento={exemplo.parcelas[n - 1].vencimento}
            valor={exemplo.parcelas[n - 1].valor}
            removivel={linhas.length > 1}
          />
        ))}
        <BotaoSimulado alvo="novo.adicionarParcela" variant="outline" size="sm">
          Adicionar parcela
        </BotaoSimulado>
      </Alvo>
      <BotaoSimulado alvo="novo.salvar" largo>
        Salvar
      </BotaoSimulado>
    </JanelaSimulada>
  );
}

function CenaBaixa({ valores }: PropsCena) {
  return (
    <JanelaSimulada titulo="Registrar baixa">
      <div className="grid grid-cols-2 gap-4">
        <CampoSimulado alvo="baixa.data" rotulo="Data" valor={valores["baixa.data"]} placeholder="dd/mm/aaaa" />
        <CampoSimulado alvo="baixa.valorPago" rotulo="Valor pago" valor={valores["baixa.valorPago"]} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <CampoSimulado alvo="baixa.juros" rotulo="Juros" valor={valores["baixa.juros"] ?? "0"} />
        <CampoSimulado alvo="baixa.multa" rotulo="Multa" valor={valores["baixa.multa"] ?? "0"} />
        <CampoSimulado alvo="baixa.desconto" rotulo="Desconto" valor={valores["baixa.desconto"] ?? "0"} />
      </div>
      <SelectSimulado alvo="baixa.conta" rotulo="Conta bancária" valor={valores["baixa.conta"]} />
      <BotaoSimulado alvo="baixa.registrar" largo>
        Registrar baixa (fica pendente de aprovação)
      </BotaoSimulado>
    </JanelaSimulada>
  );
}

function CenaRenegociar({ valores, exemplo }: PropsCena & ComExemplo) {
  const linhas = [1, 2].filter((n) => n === 1 || valores[`reneg.parcela${n}`] !== undefined);
  return (
    <JanelaSimulada titulo="Renegociar parcela">
      <div className="space-y-4">
        {linhas.map((n) => {
          const alvo = `reneg.parcela${n}`;
          const preenchida = valores[alvo] === "preenchida";
          const nova = exemplo.renegociacao[n - 1];
          return (
            <Alvo key={n} nome={alvo} className="flex gap-2 p-1">
              <CampoSimulado valor={preenchida ? nova.vencimento : undefined} placeholder="dd/mm/aaaa" />
              <CampoSimulado valor={preenchida ? nova.valor : undefined} placeholder="Valor" />
            </Alvo>
          );
        })}
        <BotaoSimulado alvo="reneg.adicionar" variant="outline" size="sm">
          Adicionar nova parcela
        </BotaoSimulado>
        <BotaoSimulado alvo="reneg.confirmar" largo>
          Confirmar renegociação
        </BotaoSimulado>
      </div>
    </JanelaSimulada>
  );
}

/** As cenas de uma tela de títulos, preenchidas com o exemplo dela. */
export function criarCenas(exemplo: ExemploTitulos) {
  return {
    lista: function Lista(props: PropsCena) {
      return <CenaLista {...props} exemplo={exemplo} />;
    },
    novoTitulo: function NovoTitulo(props: PropsCena) {
      return <CenaNovoTitulo {...props} exemplo={exemplo} />;
    },
    baixa: CenaBaixa,
    renegociar: function Renegociar(props: PropsCena) {
      return <CenaRenegociar {...props} exemplo={exemplo} />;
    },
  };
}
