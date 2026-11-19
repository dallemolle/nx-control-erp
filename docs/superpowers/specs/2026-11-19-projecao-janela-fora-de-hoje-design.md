# Projeção de caixa em janelas que não contêm hoje

Data: 2026-11-19 · Status: implementada (2026-11-19)

Item do [backlog](../../backlog.md) ("Reconstrução da cadeia de saldo em
janelas fora do intervalo visível", Fase 4, sub-projeto 2). Completa a
[spec das parcelas vencidas](2026-11-16-projecao-parcelas-vencidas-design.md),
cuja decisão 4 deixou de fora as janelas que não contêm hoje.

## Problema

`listarFluxoDeCaixaProjetado` (`src/server/services/fluxoDeCaixaProjetado.ts`)
sempre parte do saldo em caixa de **hoje**, mas só soma a linha "Em atraso"
quando a janela contém hoje (`contemHoje`). Fora disso:

- **Janela no futuro** (ano civil seguinte, ou o modo móvel depois de
  "Próximo"): os meses partem do saldo de hoje, mas ficam de fora **todas** as
  parcelas em aberto que vencem antes da janela: as já atrasadas e as que
  vencem entre hoje e a véspera da janela. O saldo inicial da janela fica
  errado.
- **Janela no passado** (ano civil anterior): os meses mostram o que daquele
  ano ainda está em aberto, mas o atraso de antes da janela fica de fora.
- O aviso que o backlog cita não existe mais na tela: o número errado
  aparece sem nenhum alerta.

## Decisões deste desenho

1. **Uma regra para qualquer janela.** O *corte do atraso* é o menor entre o
   início da janela e o início de hoje (UTC, mesmo padrão das datas de
   vencimento).
2. **A linha "Em atraso" passa a existir sempre** (mesmo zerada): parcelas em
   aberto com vencimento antes do corte.
   - Janela que contém hoje: o corte é o início da janela, e o comportamento
     não muda.
   - Janela no passado: o corte é o início da janela. Os meses mostram o que
     daquele período continua em aberto, partindo do saldo de hoje mais o
     atraso anterior. A tela responde "se eu quitar tudo o que está atrasado
     até o fim deste período", coerente com os meses passados do ano corrente,
     que já funcionam assim (decisão do usuário).
   - Janela no futuro: o corte é hoje e o rótulo é "venc. até" ontem.
3. **Segunda linha "A vencer até dd/mm/aaaa"**, só em janela que começa depois
   de hoje (mesmo zerada): parcelas em aberto com vencimento de hoje até a
   véspera da janela. Ela fica entre "Em atraso" e o primeiro mês, e os meses
   partem do saldo final dela. Optamos por duas linhas, e não uma só, para que
   o atraso não se misture com o que vence normalmente (decisão do usuário).
4. **Sem contar duas vezes:** atraso (`< corte`), a vencer antes
   (`>= hoje` e `< início da janela`) e meses (dentro da janela) são
   intervalos disjuntos.
5. **Mesmas regras das demais linhas:** mesmos status em aberto, mesmo saldo
   remanescente, alerta de saldo negativo na visão sem filtro; com filtro de
   classificação, a regra é a mesma, o acumulado parte de 0 e não há alerta.

## Serviço (`fluxoDeCaixaProjetado.ts`)

- `calcularPeriodosFluxoDeCaixaProjetado(periodos, parcelas,
  saldoInicialAbsoluto, anteriores?)`: o quarto argumento passa a ser
  `{ atrasadas?: { parcelas: ParcelaParaProjecao[]; venceuAte: Date };
  aVencerAntes?: ParcelaParaProjecao[] }`. O encadeamento é: saldo inicial →
  "Em atraso" → "A vencer antes" → meses. Cada linha só existe se a lista
  correspondente vier, mesmo vazia. A função devolve
  `{ emAtraso: LinhaEmAtraso | null, aVencerAntes: LinhaAVencerAntes | null,
  periodos }`.
  - `LinhaEmAtraso.venceuAte` passa a vir do chamador (corte − 1 ms), porque
    na janela futura ele não é mais a véspera da janela.
  - `LinhaAVencerAntes = { venceAte: Date; saldoInicial; entradasProjetadas;
    saidasProjetadas; geracaoLiquida; saldoFinal; alerta }`, com
    `venceAte` = início da janela − 1 ms.
- Nova `buscarParcelasEmAbertoVencendoEntre(filialId, de, ate, classificacao?)`
  (`gte: de, lt: ate`) sobre o `buscarParcelasEmAberto` existente.
- `listarFluxoDeCaixaProjetado`: remove `contemHoje` e calcula
  `inicioDeHoje` e `corte = min(inicioDaJanela, inicioDeHoje)`. Sempre busca
  as atrasadas (`lt: corte`). Só busca as "a vencer antes" quando
  `inicioDaJanela > inicioDeHoje`. Tudo em paralelo com o saldo e as parcelas
  da janela. Com filtro de classificação, zera o alerta também na linha nova.

## Tela e export

- `formatar-rotulo-periodo.ts`: nova `rotuloAVencerAntes(venceAte)`, que gera
  "A vencer até dd/mm/aaaa".
- `page.tsx`: a linha nova vem logo depois de "Em atraso", com o mesmo tom
  discreto no rótulo e o mesmo alerta. O texto da tela explica as duas linhas:
  as parcelas em aberto vencidas antes do período (ou antes de hoje, num
  período futuro) entram em "Em atraso"; num período futuro, o que vence de
  hoje até o início dele entra em "A vencer até…"; o saldo dos meses parte da
  última dessas linhas.
- `export/route.ts`: as mesmas linhas, na mesma ordem, no topo do
  CSV/Excel/PDF.

## Testes

- **Função pura:**
  - encadeamento atraso → a vencer → meses;
  - `aVencerAntes` ausente devolve `null` e não muda os meses;
  - lista vazia gera linha zerada;
  - alerta na linha nova quando o saldo final fica negativo;
  - `venceuAte` repassado como veio.
- **Integração:**
  - ano civil seguinte: a parcela vencida antes de hoje cai em "Em atraso",
    a que vence entre hoje e 31/12 cai em "A vencer até" e nenhuma das duas
    aparece nos meses;
  - ano civil anterior: a parcela vencida antes da janela cai em "Em atraso"
    e a do próprio ano cai no mês, sem linha "A vencer";
  - janela atual: igual a hoje, sem linha "A vencer";
  - filtro de classificação filtra as duas linhas e zera o alerta.
- **Rótulo:** `rotuloAVencerAntes`.

## Docs

- Ajuda, seção 3.6 de `content/ajuda/passo-a-passo.md`: explicar as duas
  linhas e o que a tela mostra num período passado ou futuro.
- Spec de 2026-11-16: a decisão 4 e o item "Linha de atraso em janelas que
  não contêm hoje" do "fora do escopo" ganham "**feito** (2026-11-19, esta
  spec)".
- `docs/fases/fase-4-fluxo-de-caixa.md`: nota curta na seção do fluxo
  projetado.
- `docs/backlog.md`: remover o item.

## Fora do escopo

- "Saldo projetado (30 dias)" do dashboard executivo: **descartado**, porque a
  janela dele é sempre a atual.
- Reconstruir o saldo **realizado** no início de uma janela passada (saldo
  conciliado naquela data) em vez de partir de hoje: **descartado**, porque
  misturaria realizado com projetado. O fluxo realizado já mostra o passado
  (decisão do usuário: mesma lógica da projeção).
