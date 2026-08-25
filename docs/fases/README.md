# Fases do projeto

O `nx-control-erp` está sendo construído em fases incrementais. Cada fase tem
seu próprio ciclo de design → plano → implementação — a documentação abaixo é
atualizada conforme o trabalho avança.

| Fase | Nome | Status |
|---|---|---|
| 1 | [Fundação](./fase-1-fundacao.md) | 🟡 Em andamento (núcleo completo, cadastros básicos parciais) |
| 2 | [Financeiro (Contas a Pagar/Receber, Bancos)](./fase-2-financeiro.md) | ⚪ Planejada |
| 3 | [Conciliação bancária](./fase-3-conciliacao.md) | ⚪ Planejada |
| 4 | [Fluxo de caixa](./fase-4-fluxo-de-caixa.md) | ⚪ Planejada |
| 5 | [Controladoria e orçamento](./fase-5-controladoria.md) | ⚪ Planejada |
| 6 | [Gestão (dashboards, relatórios, auditoria, aprovações)](./fase-6-gestao.md) | ⚪ Planejada |

## Como isso é organizado

- Cada arquivo de fase futura descreve **escopo**, não um plano de
  implementação — o desenho técnico detalhado só é feito quando a fase
  anterior estiver concluída e a fase entrar em desenvolvimento.
- O arquivo da Fase 1 é o único atualizado continuamente à medida que partes
  dela são implementadas, já que é a fase em andamento.
- Decisões de arquitetura que valem para o sistema todo (stack, modelo de
  dados, padrões de código) ficam documentadas na Fase 1, por ser onde foram
  definidas, e são referenciadas pelas fases seguintes em vez de repetidas.
