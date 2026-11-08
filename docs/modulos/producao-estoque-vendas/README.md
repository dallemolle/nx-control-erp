# Produção, estoque e vendas (Fase 7)

Documentação de levantamento e desenho dos módulos de **recepção de fruto,
processamento (polpa), estoque por lote, vendas, entregas e rastreabilidade**,
a partir da planilha que hoje opera o negócio:

> `Hortitex - Controle produção e vendas V1.4.3.xlsx` — 26 abas, ~140 mil
> células com fórmula, Excel 365 sem macros. Analisada em 2026-11-08.

Status: 🟡 **Em desenho.** Nada foi implementado ainda. Estes documentos são a
base para a revisão do usuário; depois de aprovados viram specs de
sub-projeto em `docs/superpowers/specs/` (mesmo ciclo das Fases 1–6).

## Como ler

| # | Documento | Para quê |
|---|---|---|
| 1 | [Visão geral](./01-visao-geral.md) | O negócio, o fluxo físico e como a planilha o representa. Comece aqui. |
| 2 | [Mapeamento da planilha](./02-mapeamento-planilha.md) | Aba por aba, coluna por coluna: o que é digitado, o que é calculado e com qual fórmula. Referência. |
| 3 | [Regras de negócio](./03-regras-de-negocio.md) | Cada fórmula traduzida em regra numerada (RN-xx), com exemplo. É o que o código precisa reproduzir. |
| 4 | [Modelo de dados](./04-modelo-de-dados.md) | Entidades propostas (rascunho de schema Prisma) e como se ligam ao que já existe (Cliente, Fornecedor, Safra, Título). |
| 5 | [Fluxos, telas e permissões](./05-fluxos-telas-permissoes.md) | Passo a passo de uso no sistema, telas por módulo, perfis e ações de RBAC. |
| 6 | [Integração com o financeiro](./06-integracao-financeiro.md) | Venda → título a receber, compra de fruto → título a pagar, fiscal × gerencial, conciliação. |
| 7 | [Relatórios e indicadores](./07-relatorios-indicadores.md) | PAINEL e REL_* da planilha → telas e exports do sistema. |
| 8 | [Dúvidas e decisões](./08-duvidas-decisoes.md) | Pontos ambíguos, defeitos encontrados na planilha e decisões que precisam do usuário. **Revisar antes de desenvolver.** |
| 9 | [Plano de entrega](./09-plano-de-entrega.md) | Ordem dos sub-projetos, critérios de pronto, testes e importação dos dados da planilha. |

## Resumo em uma tela

- **O que a planilha faz:** recebe fruto (açaí, acerola) em cargas → cada
  carga vira um **lote** → o lote é vendido in natura ou processado numa
  **OP** que gera **lotes de polpa** (congelada/resfriada) → lotes são
  vendidos por pedido e entregues → tudo é rastreável lote a lote para a
  ADEPARA (defesa agropecuária do Pará).
- **O que já é usado de fato:** recepção de fruto (16 cargas, set–out/2026)
  e venda de fruto in natura (29 linhas, todas pagas, Pix/dinheiro).
  Processamento, entregas e ajustes ainda não tiveram lançamento.
- **O que o sistema ganha sobre a planilha:** número de lote que não muda
  ao reordenar linhas, saldo que não fica negativo, custo congelado na data
  da operação, recall completo (fruto → polpa → cliente), venda gerando
  título a receber, multi-filial e auditoria.
- **Maiores decisões em aberto** (ver doc 8): perfil operacional novo,
  cliente sem CPF/CNPJ, custo do fruto de produção própria, baixa automática
  de venda à vista e rateio do custo da OP entre polpas de qualidades
  diferentes.

## Dados sensíveis

Estes documentos usam só a **estrutura** da planilha (abas, colunas,
fórmulas, listas) e o catálogo de produtos. Nomes de clientes, fornecedores,
valores reais de venda e documentos não foram copiados.
