# Fase 6 — Gestão

Status: 🟢 **Concluída.** Os 4 sub-projetos estão implementados: Dashboard
executivo (design em
`docs/superpowers/specs/2026-09-12-dashboard-executivo-design.md`, tela em
`/dashboard-executivo`), Relatórios exportáveis (design em
`docs/superpowers/specs/2026-09-12-relatorios-exportaveis-design.md`),
Filtros globais combináveis (design em
`docs/superpowers/specs/2026-09-12-filtros-globais-design.md`, aplicado a
Contas a pagar/receber) e Auditoria — filtros e paginação (design em
`docs/superpowers/specs/2026-09-13-auditoria-filtros-design.md`, tela em
`/auditoria`).

## Escopo

### Dashboard executivo — implementado

- Indicadores: caixa disponível, contas a pagar/receber em aberto,
  inadimplência, geração de caixa do mês, obrigações dos próximos 7/30
  dias, recebimentos esperados em 30 dias, saldo projetado em 30 dias —
  9 indicadores, todos consolidados por empresa (soma de todas as
  filiais). "Saldo bancário" (redundante com caixa disponível),
  "endividamento" e "necessidade de capital de giro" ficaram fora — sem
  modelo de empréstimo/financiamento no schema hoje.
- Gráficos: entradas x saídas (6 meses), evolução do saldo (6 meses),
  aging de contas a pagar/receber. "Orçado x realizado" e "fluxo de
  caixa por centro de custo/lucro/safra" ficaram fora — essas dimensões
  são cadastros por filial, sem chave comum entre filiais da mesma
  empresa, então não consolidam corretamente (ver `docs/backlog.md`).
- Acesso restrito a ADMINISTRADOR/GESTOR/AUDITOR via nova permissão
  `dashboardExecutivo:ler` (não reaproveita `planejamentoEstrategico:ler`).
  Rota nova (`/dashboard-executivo`), não a `/` atual.

### Relatórios exportáveis — implementado

- Mecanismo genérico e reaproveitável (`src/lib/export/`): `gerarCsv`/
  `gerarExcel`/`responderExport`, aplicado via Route Handler
  (`export/route.ts`) em cada tela, com link simples (`ExportarLinks`,
  sem JavaScript/prefetch).
- Formatos: CSV (separador `;`, BOM UTF-8, decimal com vírgula — convenção
  pt-BR) e Excel (células nativas de número/data). PDF ficou fora — mais
  caro (paginação, cabeçalho/rodapé) e nenhum caso de uso real dos 2
  relatórios de referência precisa dele.
- 2 relatórios de referência: Contas a pagar/receber (uma linha por
  parcela) e Fluxo de caixa realizado (uma linha por sub-período). Os
  demais ~8 relatórios do escopo original (fluxo de caixa projetado,
  conciliação bancária, orçado x realizado, caixa por dimensão,
  obrigações/recebimentos futuros, movimentação bancária, auditoria de
  alterações) ficam para wiring futuro sobre o mesmo mecanismo — ver
  `docs/backlog.md`.

### Filtros globais combináveis — implementado (parcial, por design)

- Mecanismo de filtro combinável por 8 dimensões (categoria, contraparte,
  centro de custo, centro de lucro, safra, projeto, status, período de
  vencimento), aplicado à tela de referência Contas a pagar/receber —
  hoje a única tela financeira sem nenhum filtro de UI antes deste
  sub-projeto. Export (CSV/Excel) passa a respeitar os mesmos filtros da
  tela.
- Deliberadamente fora do escopo (registrados em `docs/backlog.md`):
  "empresa sem filial selecionada consolida todas as filiais" (exigiria
  tornar `SessaoAtiva.filialId` opcional — mudança de sessão/autenticação,
  não de tela); banco e conta bancária como filtro (hop extra via
  `contaBancaria.bancoId`); multi-select por dimensão; extensão do
  mecanismo para as demais telas financeiras (fluxo de caixa, dashboard
  executivo, conciliação) — o mecanismo está pronto, falta só wiring.

### Auditoria — filtros e paginação — implementado

- A cobertura de `AuditLog` para as operações citadas no escopo original
  (baixa, conciliação/desconciliação, aprovação, alteração de vencimento)
  **já estava completa** antes deste sub-projeto — levantamento mostrou
  que não havia gap real de instrumentação; o único ramo sem auditoria
  (classificação automática de conciliação sem match) é uma decisão
  consciente, pelo mesmo princípio já aplicado ao recálculo automático de
  status de parcela (derivado, não é ação de usuário).
- O gap real estava na tela `/auditoria`: busca fixa dos 200 registros
  mais recentes, sem filtro nem paginação, consultando `prisma` direto
  (quebra de convenção corrigida). Agora tem filtro combinável por 5
  dimensões (entidade, ação, usuário, filial, período) e paginação real
  (50 registros por página). `entidade`/`ação`/`usuário` têm opções
  vindas de valores distintos já gravados; `filial` vem do cadastro
  completo, não de logs (uma filial sem nenhum log ainda aparece como
  opção).
- **"Workflow de aprovação de pagamentos" de 5 passos (cadastro →
  aprovação → programação → pagamento → conciliação) ficou
  deliberadamente fora do escopo.** Levantamento mostrou que esse
  workflow não existe hoje — o fluxo real é de 3 passos (cadastro →
  aprovação-que-já-é-pagamento, fundidos em `aprovarBaixa` → conciliação),
  sem nenhum conceito de "programação" no schema. Desacoplar aprovação de
  pagamento é uma mudança de comportamento real, não uma extensão
  pequena, e não deve ser feita sem um pedido de negócio explícito — ver
  `docs/backlog.md`.

## Depende de

- Fases 2-5 (é a camada de consolidação/visualização sobre todas elas).
