"use client";

import { useState, useTransition } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TipoTitulo } from "@prisma/client";
import { validarCsvAction, confirmarImportacaoAction } from "./actions";
import type { LinhaImportacao } from "@/server/services/importacaoTitulo";

const COLUNAS_CSV = [
  { nome: "cnpjCpf", obrigatoria: true, descricao: "CNPJ ou CPF do fornecedor/cliente já cadastrado (com ou sem pontuação)" },
  { nome: "documento", obrigatoria: true, descricao: "Número do documento (nota fiscal, boleto, etc.)" },
  { nome: "dataEmissao", obrigatoria: true, descricao: "Data de emissão (aaaa-mm-dd)" },
  { nome: "dataCompetencia", obrigatoria: true, descricao: "Data de competência (aaaa-mm-dd)" },
  { nome: "categoriaFinanceira", obrigatoria: true, descricao: "Nome exato da categoria financeira já cadastrada" },
  { nome: "centroCusto", obrigatoria: false, descricao: "Código do centro de custo já cadastrado" },
  { nome: "centroLucro", obrigatoria: false, descricao: "Código do centro de lucro já cadastrado" },
  { nome: "safra", obrigatoria: false, descricao: "Nome exato da safra já cadastrada" },
  { nome: "projeto", obrigatoria: false, descricao: "Código do projeto já cadastrado" },
  { nome: "contaBancariaAgencia", obrigatoria: false, descricao: "Agência da conta bancária prevista (preencher junto com a conta)" },
  { nome: "contaBancariaConta", obrigatoria: false, descricao: "Número da conta bancária prevista (preencher junto com a agência)" },
  { nome: "formaPagamento", obrigatoria: false, descricao: "Texto livre (ex.: Boleto, PIX)" },
  { nome: "numeroParcela", obrigatoria: false, descricao: "Número da parcela (padrão: 1)" },
  { nome: "dataVencimento", obrigatoria: true, descricao: "Data de vencimento da parcela (aaaa-mm-dd)" },
  { nome: "valorOriginal", obrigatoria: true, descricao: "Valor da parcela (ex.: 1500.00)" },
] as const;

function montarModeloCsv(tipo: TipoTitulo): string {
  const cabecalho = COLUNAS_CSV.map((coluna) => coluna.nome).join(",");
  const documentoExemplo = tipo === "PAGAR" ? "NF-0001" : "REC-0001";
  const linhaExemplo = [
    "12.345.678/0001-90",
    documentoExemplo,
    "2026-09-01",
    "2026-09-01",
    "Insumos Agrícolas",
    "",
    "",
    "",
    "",
    "",
    "",
    "PIX",
    "1",
    "2026-10-01",
    "1500.00",
  ].join(",");
  return `${cabecalho}\n${linhaExemplo}\n`;
}

export function ImportarCsvDialog({ tipo }: { tipo: TipoTitulo }) {
  const [aberto, setAberto] = useState(false);
  const [mostrarAjuda, setMostrarAjuda] = useState(false);
  const [linhas, setLinhas] = useState<LinhaImportacao[]>([]);
  const [erro, setErro] = useState<string>();
  const [pendente, iniciarTransicao] = useTransition();

  async function lerArquivo(arquivo: File) {
    try {
      const conteudo = await arquivo.text();
      const resultado = await validarCsvAction(tipo, conteudo);
      setLinhas(resultado);
      setErro(undefined);
    } catch (falha) {
      // A action valida sessão/permissão e limita o tamanho do CSV — sem este catch
      // a rejeição some e o dialog fica em branco.
      setLinhas([]);
      setErro(falha instanceof Error ? falha.message : "Não foi possível ler o arquivo");
    }
  }

  function confirmar() {
    iniciarTransicao(async () => {
      const resultado = await confirmarImportacaoAction(tipo, linhas);
      if (resultado.erro) {
        setErro(resultado.erro);
        return;
      }
      setAberto(false);
      setLinhas([]);
    });
  }

  const temErro = linhas.some((linha) => linha.erros.length > 0);
  const rotuloContraparte = tipo === "PAGAR" ? "fornecedor" : "cliente";
  const modeloCsvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(montarModeloCsv(tipo))}`;

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant="outline" />}>Importar CSV</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar títulos via CSV</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Button type="button" variant="outline" size="sm" onClick={() => setMostrarAjuda((atual) => !atual)}>
            {mostrarAjuda ? "Ocultar" : "Como formatar o arquivo?"}
          </Button>
          {mostrarAjuda && (
            <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
              <p>
                O arquivo precisa ter uma linha de cabeçalho com estes nomes de coluna. Os campos de {rotuloContraparte}{" "}
                e demais cadastros são identificados pelo CNPJ/CPF, código ou nome já cadastrado — não pelo ID interno.
              </p>
              <ul className="space-y-0.5">
                {COLUNAS_CSV.map((coluna) => (
                  <li key={coluna.nome}>
                    <span className="font-mono">{coluna.nome}</span>
                    {coluna.obrigatoria ? " (obrigatória)" : " (opcional)"} — {coluna.descricao}
                  </li>
                ))}
              </ul>
              <a
                href={modeloCsvHref}
                download={`modelo-importacao-titulos-${tipo.toLowerCase()}.csv`}
                className="inline-block text-primary underline-offset-4 hover:underline"
              >
                Baixar modelo CSV
              </a>
            </div>
          )}
          <Input
            type="file"
            accept=".csv"
            onChange={(e) => e.target.files?.[0] && lerArquivo(e.target.files[0])}
          />
          {linhas.length > 0 && (
            <div className="max-h-64 overflow-y-auto text-sm space-y-1">
              {linhas.map((linha) => (
                <div key={linha.linha} className={linha.erros.length > 0 ? "text-destructive" : ""}>
                  Linha {linha.linha}: {linha.erros.length > 0 ? linha.erros.join("; ") : "OK"}
                </div>
              ))}
            </div>
          )}
          {erro ? <p className="text-sm text-destructive">{erro}</p> : null}
          <Button type="button" className="w-full" disabled={linhas.length === 0 || temErro || pendente} onClick={confirmar}>
            {pendente ? "Importando..." : "Confirmar importação"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
