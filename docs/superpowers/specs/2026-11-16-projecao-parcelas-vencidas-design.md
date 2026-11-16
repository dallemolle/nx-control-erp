# Parcelas vencidas na projeção de caixa

Data: 2026-11-16 · Status: desenho aprovado

Item do [backlog](../../backlog.md) ("Parcelas vencidas em aberto somem da
projeção"), levantado na varredura dos "fora do escopo" de 2026-11-16. Resolve
a "segunda limitação aceita conscientemente" da
[spec do fluxo projetado](2026-09-07-fluxo-caixa-projetado-design.md).

## Problema

`buscarParcelasEmAbertoNoPeriodo` (`src/server/services/fluxoDeCaixaProjetado.ts`)
só busca parcelas com `dataVencimento` dentro da janela de 12 meses. No modo
móvel a janela começa no dia 1 do mês atual: uma parcela a pagar ou a receber
vencida no mês passado (ou antes) e ainda em aberto não aparece em mês nenhum,
embora o dinheiro ainda vá sair ou entrar. O saldo projetado fica otimista ou
pessimista na medida do atraso acumulado. A tela só avisa isso no texto de
rodapé.

## Decisões deste desenho

1. **Linha "Em atraso" no topo da tabela**, antes do primeiro mês, com saldo
   inicial, entradas, saídas, geração líquida e saldo final. O saldo final
   dela é o saldo inicial do primeiro mês: o atraso entra na conta sem se
   misturar com o que vence no mês (decisão do usuário).
2. **Entra todo o atrasado**, sem corte por idade (decisão do usuário). O que
   não vai mais ser pago ou recebido deve ser baixado ou cancelado no
   financeiro; o aging do dashboard já mostra a idade.
3. **"Em atraso" = parcela em aberto vencida antes do início da janela.**
   Mesmos status já usados na projeção (`EM_ABERTO`, `A_VENCER`, `VENCIDO`,
   `PARCIALMENTE_PAGO`) e mesmo saldo remanescente (`valorAtualizado` menos as
   baixas aprovadas).
4. **A linha só existe quando a janela contém hoje:** sempre no modo móvel; no
   ano civil, só no ano corrente (aí ela traz o que venceu antes de janeiro; o
   que venceu de janeiro até o mês passado continua na linha do próprio mês,
   como hoje, sem contar duas vezes). Numa janela inteira no futuro ou no
   passado não há linha: "antes da janela" incluiria parcelas que ainda nem
   venceram. Esse caso segue com o aviso atual e pertence ao item "meses
   invisíveis" do backlog.
5. **A linha aparece mesmo zerada** quando a janela contém hoje: "0,00 em
   atraso" também informa.
6. **Mesmas regras dos meses:** alerta de saldo negativo (`saldoFinal < 0`) na
   visão sem filtro; com filtro de classificação, o atraso respeita o filtro, o
   acumulado parte de 0 e não há alerta.
7. **Escopo:** tela e export do fluxo projetado. O "Saldo projetado (30 dias)"
   do dashboard executivo fica como está (lá a inadimplência tem indicador
   próprio).

## Serviço (`fluxoDeCaixaProjetado.ts`)

- `calcularPeriodosFluxoDeCaixaProjetado(periodos, parcelas, saldoInicialAbsoluto,
  atrasadas?)` — função pura. Com `atrasadas` (lista de `ParcelaParaProjecao`,
  pode ser vazia), monta primeiro a linha de atraso a partir do saldo inicial e
  encadeia os meses a partir do saldo final dela. Devolve
  `{ emAtraso: LinhaEmAtraso | null, periodos }`, com
  `LinhaEmAtraso = { venceuAte: Date; saldoInicial; entradasProjetadas;
  saidasProjetadas; geracaoLiquida; saldoFinal; alerta }`. `venceuAte` é o
  último dia antes da janela (para o rótulo). Sem `atrasadas`, `emAtraso` é
  `null` e o cálculo dos meses é o de hoje.
- `buscarParcelasEmAbertoVencidasAntes(filialId, inicio, classificacao?)` —
  mesma consulta de `buscarParcelasEmAbertoNoPeriodo` com
  `dataVencimento: { lt: inicio }`. As duas compartilham o `where`/`map` para
  não duplicar a regra de status e saldo.
- `listarFluxoDeCaixaProjetado` passa a devolver
  `{ emAtraso, periodos }`. Decide se a janela contém hoje
  (`inicioDaJanela <= agora <= fimDaJanela`); só então busca as atrasadas (em
  paralelo com o saldo e as parcelas da janela) e as passa à função pura. Com
  filtro de classificação zera o alerta também na linha de atraso.

## Tela e export

- `page.tsx`: primeira linha da tabela com rótulo **"Em atraso (venc. até
  dd/mm/aaaa)"**, em tom discreto (`text-muted-foreground` no rótulo) para se
  distinguir dos meses; alerta igual ao dos meses. O texto de rodapé deixa de
  dizer que os vencidos ficam de fora e passa a explicar a linha: "parcelas em
  aberto vencidas antes do período entram na linha Em atraso, e o saldo dos
  meses parte dela".
- `export/route.ts`: a mesma linha como primeira linha do CSV/Excel/PDF, com o
  mesmo rótulo na coluna "Mês".

## Testes

- Função pura: com atrasadas, a linha soma por tipo e o primeiro mês parte do
  saldo final dela; atrasadas vazias geram linha zerada; sem atrasadas,
  `emAtraso` é `null` e os meses não mudam; alerta na linha quando o saldo
  final dela fica negativo.
- Integração (`fluxoDeCaixaProjetado.test.ts`): parcela em aberto vencida no
  mês anterior aparece na linha de atraso e em nenhum mês; parcela paga ou
  cancelada vencida antes não entra; ano civil de outro ano não tem linha;
  filtro de classificação filtra a linha e zera o alerta.
- Export: a primeira linha é a de atraso.

## Docs

- Ajuda, seção 3.6 de `content/ajuda/passo-a-passo.md`: explicar a linha.
- Spec de 2026-09-07: a segunda limitação e o item do "fora de escopo" ganham
  "**feito** (2026-11-16, esta spec)".
- `docs/backlog.md`: remover o item.
- `docs/fases/fase-4-*.md`: nota curta na seção do fluxo projetado.

## Fora do escopo

- "Saldo projetado (30 dias)" do dashboard executivo incluir o atraso —
  **descartado:** o dashboard mostra a inadimplência em indicador próprio.
- Linha de atraso em janelas que não contêm hoje — **descartado:** pertence
  ao item "meses invisíveis", já no backlog.
- Corte do atraso por idade — **descartado:** decisão do usuário (entra tudo).
