# Confirmar 1:1 na Conciliação só com valor igual

Data: 2026-11-26 · Status: aprovada, aguardando plano

Item 8 do [backlog](../../backlog.md), seção "Financeiro — lacunas achadas ao
escrever a ajuda contextual" ("Confirmar 1:1 na Conciliação aceita valor
diferente").

## Problema

`confirmarConciliacaoManual` (`src/server/services/conciliacao.ts`) só confere
a conta e se o lançamento está livre. Ela não compara valor nem sentido com a
linha do extrato. A caixa de candidatos da linha (`buscarCandidatosLancamento`)
traz lançamentos do mesmo sentido em ±30 dias, de qualquer valor. Uma linha de
R$ 990,00 conciliada com um lançamento de R$ 1.000,00 deixa o realizado com
R$ 1.000,00, e os R$ 10,00 de diferença somem escondidos pela conciliação. A
conciliação em grupo já exige soma exata; o 1:1 é a porta aberta.

Desde a correção de lançamentos (item 6, 2026-11-26), um lançamento solto pode
ser editado na Tesouraria entre a leitura e o vínculo. Isso vale para o 1:1, a
conciliação automática e "Criar lançamento". Hoje só a conciliação em grupo
reconfere a soma dentro da transação.

## Decisões (usuário, 2026-11-26)

1. **Uma conciliação só é gravada se a soma das linhas for igual à soma dos
   lançamentos**, contando o sentido (entrada +, saída −), em todos os
   caminhos: Confirmar (1:1), automática na importação, "Reconciliar
   pendentes", "Criar lançamento" e grupo.
2. **A caixa de Confirmar lista só lançamentos de valor igual.** Quando só
   houver candidatos de valor diferente, a linha mostra um aviso com o valor
   encontrado e os dois caminhos:
   - lançamento digitado errado: corrigir na Tesouraria (item 6) e depois
     confirmar;
   - diferença real (tarifa, juros): Conciliar em grupo com "Lançar a
     diferença".
3. **"Divergência de valor" continua como status**, um diagnóstico da
   importação. Ela deixa de ser resolvida pelo Confirmar.

## Serviço (`src/server/services/conciliacao.ts`)

### `vincularEmGrupo`: reconfere a soma

É o ponto único que grava qualquer conciliação. Depois dos dois `updateMany`
(que prendem linhas e lançamentos ao grupo e travam essas linhas no banco), ele
relê com `tx` as linhas (`linhaIds`) e os lançamentos (`lancamentoIds`) e
recalcula com `diferencaDoGrupo` (`src/lib/conciliacaoGrupo.ts`). Diferente de
zero: lança `SomaDoGrupoMudouError`, com a mensagem
"Algum lançamento mudou enquanto você conciliava. Confira os valores e tente de
novo." A transação é desfeita.

A conferência equivalente que hoje fica dentro do `conciliarEmGrupo` (depois de
chamar `vincularEmGrupo`) sai de lá, porque passa a estar no lugar comum. O
`conciliarEmGrupo` continua conferindo a soma antes da transação, para dar a
mensagem com o valor da diferença ("A soma das linhas e dos lançamentos não
bate…").

Por que a releitura enxerga o valor certo: o `updateMany` dos lançamentos trava
as linhas deles. Uma edição na Tesouraria que chegue depois espera o commit e
então falha no filtro `grupoConciliacaoId: null` (mensagem de corrida do item
6). Uma edição que já tinha sido gravada aparece na releitura.

### `confirmarConciliacaoManual`: valor e sentido iguais

Depois de achar a linha e o lançamento (as checagens de hoje ficam), e antes da
transação:

- sentido diferente (`lancamento.tipo !== linha.tipo`):
  "O lançamento é uma entrada e a linha do extrato é uma saída." (ou o
  contrário, com as palavras certas);
- valor diferente (`!lancamento.valor.equals(linha.valor)`):
  "O lançamento tem valor diferente da linha (R$ 1.000,00 no lançamento,
  R$ 990,00 no extrato). Se foi digitado errado, corrija na Tesouraria; se a
  diferença é real, use Conciliar em grupo com “Lançar a diferença”."
  (valores com `formatarMoeda`).

A releitura dentro de `vincularEmGrupo` cobre o caso de o lançamento mudar
depois desta conferência.

### Conciliação automática (`processarLinhasPendentes`)

Hoje ela pula a linha quando dá `ItemJaConciliadoError`. Passa a pular também
quando dá `SomaDoGrupoMudouError`: a linha fica como estava e a rodada segue.

### Candidatos da linha

`buscarCandidatosDaLinha` continua devolvendo todos os candidatos (mesmo
sentido, ±30 dias, conciliados ou não), porque a tela usa os conciliados para o
aviso de Duplicado. Cada candidato ganha o campo `valorIgual: boolean`
(`candidato.valor.equals(linha.valor)`), calculado no serviço, que já tem a
linha em mãos. `buscarCandidatosAction`
(`src/app/(dashboard)/financeiro/conciliacao/actions.ts`) repassa o campo para a
tela.

## Tela da Conciliação (`linha-extrato-actions.tsx`)

- Caixa de Confirmar: só candidatos `!conciliado && valorIgual`.
- Sem nenhum desses, mas com algum `!conciliado && !valorIgual`: no lugar da
  caixa, um aviso em texto pequeno, no tom do aviso de Duplicado que já existe:
  "Há lançamento com valor diferente: <descrição> — <valor> em <data>. Se foi
  digitado errado, corrija na Tesouraria; se a diferença é real (tarifa,
  juros), use Conciliar em grupo com “Lançar a diferença”." Com mais de um,
  mostra o de data mais próxima da linha e "e mais N".
- "Conciliar em grupo" e "Criar lançamento" continuam como estão.

## Ajuda (`src/ajuda/conciliacao/`)

- Roteiro `confirmar-sugestao`:
  - "Quando usar" sem a Divergência de valor ("Sugestão ou Divergência de
    data");
  - passo "Escolha o lançamento na caixa da linha": a explicação diz que a
    caixa só lista lançamentos de valor igual; a dica deixa de dizer que o
    sistema aceita valor diferente e passa a explicar o aviso e os dois
    caminhos.
- Roteiro da lista (o que explica os status, linha ~101): a frase da
  Divergência de valor passa a dizer como resolvê-la. No "E depois?" (linha
  ~115), Confirmar fica para Sugestão e Divergência de data, e a Divergência de
  valor vai para a Tesouraria ou o grupo.
- Cenas (`cenas.tsx`): se alguma linha do exemplo estiver em Divergência de
  valor com caixa de Confirmar, ela passa a mostrar o aviso. O plano confere os
  dados de `exemplo.ts`.

## Dados antigos

Conciliações já gravadas com soma diferente não são mexidas. Para conferir na
produção (só leitura):

```sql
select g.id as grupo, f.nome as filial,
  (select coalesce(sum(case when x.tipo = 'ENTRADA' then x.valor else -x.valor end), 0)
     from linhas_extrato x where x."grupoConciliacaoId" = g.id) as soma_linhas,
  (select coalesce(sum(case when l.tipo = 'ENTRADA' then l.valor else -l.valor end), 0)
     from lancamentos_bancarios l where l."grupoConciliacaoId" = g.id) as soma_lancamentos
from grupos_conciliacao g join filiais f on f.id = g."filialId"
where (select coalesce(sum(case when x.tipo = 'ENTRADA' then x.valor else -x.valor end), 0)
         from linhas_extrato x where x."grupoConciliacaoId" = g.id)
   <> (select coalesce(sum(case when l.tipo = 'ENTRADA' then l.valor else -l.valor end), 0)
         from lancamentos_bancarios l where l."grupoConciliacaoId" = g.id);
```

Se aparecer algum grupo, é só desconciliar a linha na tela e refazer pelo
caminho certo.

## Testes

Serviço (`conciliacao.test.ts`, banco de teste):
- 1:1 com valor diferente é recusado com a mensagem nova, e nada é gravado;
- 1:1 com sentido diferente é recusado;
- 1:1 com valor igual e data a mais de 3 dias (Divergência de data) passa;
- corrida no 1:1: o lançamento muda de valor no banco entre a leitura e o
  vínculo (espião no `findFirst` devolvendo o registro lido antes), e o erro
  `SomaDoGrupoMudouError` desfaz tudo;
- a corrida da conciliação em grupo (teste existente) continua passando com a
  conferência movida para `vincularEmGrupo`;
- automática: com um lançamento alterado entre a classificação e o vínculo, a
  linha é pulada e a rodada não quebra;
- candidatos: `buscarCandidatosDaLinha` devolve `valorIgual` certo (igual e
  diferente).

Ajuda: testes dos roteiros (`roteiros.test.ts`).

Depois: conferência no navegador (linha com candidato de valor igual
confirma; linha só com valor diferente mostra o aviso; Conciliar em grupo com
diferença continua funcionando).

## Fora do escopo

- **Item 9 do backlog** ("Reconciliar pendentes" ignora Sugestão, Divergência
  e Duplicado): → continua no backlog, sem mudança.
- **Mudar a classificação automática:** descartado. Ela já só vincula quando o
  valor é igual.
- **Corrigir conciliações antigas com soma diferente:** descartado. Consulta
  acima e correção manual (desconciliar e refazer).

Backlog: o item 8 sai de `docs/backlog.md` nesta branch.
