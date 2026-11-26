# Corrigir e excluir lançamento manual e transferência

Data: 2026-11-26 · Status: implementada (2026-11-26)

Item 6 do [backlog](../../backlog.md), seção "Financeiro — lacunas achadas ao
escrever a ajuda contextual" ("Lançamento manual e transferência não podem ser
corrigidos").

## Problema

Não há edição nem exclusão de `LancamentoBancario`
(`src/server/services/lancamentoBancario.ts`), seja o lançamento manual
(criado na Tesouraria ou na Conciliação) ou a transferência. Uma tarifa de
R$ 45,90 lançada como R$ 459,00 fica errada no saldo, no fluxo e no orçamento.
O único contorno, que a ajuda ensina, é lançar o mesmo valor no sentido
contrário e depois o valor certo. Isso deixa dois registros falsos no fluxo,
na categoria e na conciliação, onde a anulação não tem linha no extrato.

## Decisões (usuário, 2026-11-26)

1. **Lançamento ligado ao extrato não tem estorno.** Na conciliação a soma
   tem de ser exata, então conta, tipo, data e valor já foram confirmados pelo
   banco. Nele só a classificação pode mudar. Para mudar o resto ou excluir,
   a pessoa usa **Desconciliar**, que já existe na Conciliação, e depois
   corrige. O "estornar" que o backlog previa não é feito.
2. **Sem vínculo com o extrato, tudo pode ser editado** e o lançamento pode
   ser excluído. Na transferência, os dois lados mudam juntos.
3. **Excluir apaga o registro.** A auditoria guarda o lançamento inteiro, quem
   excluiu, quando e o **motivo, obrigatório**. Não existe status "excluído":
   ele obrigaria a filtrar saldo, fluxos, orçamento, dashboard, conciliação,
   API e exportações, com risco de esquecer algum.
4. **Permissão:** a mesma de lançar (`lancamento:escrever` +
   `requireAlteracaoFilial`). Quem pode lançar corrige o lançamento de
   qualquer pessoa da filial.

## Regras

Só lançamentos com `origem` `MANUAL` ou `TRANSFERENCIA`. Os de origem `BAIXA`
são recusados ("Lançamento de baixa: corrija estornando a baixa"), porque se
corrigem pelo estorno da baixa.

**"Ligado ao extrato" = `grupoConciliacaoId` preenchido.** O lançamento da
conta Caixa nasce com `conciliado = true`, mas sem grupo, então se comporta
como um lançamento solto.

| Situação | Pode editar | Pode excluir |
|---|---|---|
| Manual sem grupo | conta, tipo, data, valor, descrição, categoria, centro de custo, centro de lucro, safra, projeto, classificação fiscal/gerencial, tipo e número do comprovante | sim, com motivo |
| Manual com grupo | descrição, categoria, centro de custo, centro de lucro, safra, projeto, classificação, comprovante | não |
| Transferência, nenhum lado com grupo | conta de origem, conta de destino, data, valor, descrição (nos dois lados) | sim, os dois lados, com motivo |
| Transferência, algum lado com grupo | só a descrição (nos dois lados) | não |

Mensagens de recusa:
- Excluir com grupo: "Este lançamento está conciliado com o extrato.
  Desconcilie na Conciliação antes de excluir."
- Mudar campo travado num lançamento com grupo: "Este lançamento está
  conciliado com o extrato: só descrição e classificação podem mudar.
  Desconcilie na Conciliação para mudar conta, tipo, data ou valor."
- Transferência com algum lado no grupo: as mesmas mensagens, trocando
  "lançamento" por "transferência" e citando o lado conciliado.

Um campo travado conta como "mudado" quando difere do valor gravado. Valor,
data e conta iguais aos atuais passam, para o formulário poder mandar tudo.

## Serviço (`src/server/services/lancamentoBancario.ts`)

### `editarLancamentoManual(sessao, id, dados)`

`dados` tem o formato de `LancamentoManualFormValues`, normalizado como na
criação (`normalizarOpcional`).

1. Permissão e `requireAlteracaoFilial`.
2. Busca o lançamento com `{ id, filialId }`. Não achou: "Lançamento não
   encontrado na filial ativa". `origem` diferente de `MANUAL`: recusa
   (transferência usa `editarTransferencia`, baixa usa o estorno).
3. Valida a conta nova pela filial (`buscarContaDaFilial`), as referências
   (`validarReferenciasDoLancamento`, que só checa a filial e aceita cadastro
   inativo) e o comprovante (`garantirComprovanteValido`).
4. Com grupo: se conta, tipo, data ou valor mudaram, recusa.
5. Sem grupo: `conciliado` é recalculado pela conta (`CAIXA` → `true`, banco
   → `false`).
6. Grava com `updateMany({ where: { id, filialId, grupoConciliacaoId: <o que
   foi lido> } })`. Se `count === 0`, a conciliação mudou no meio do caminho:
   "O lançamento foi conciliado ou desconciliado agora há pouco. Abra de novo
   e confira." Com grupo, `conciliado` não é tocado.
7. Auditoria `EDITAR`, entidade `LancamentoBancario`, `anterior` e `novo` só
   com os campos editáveis.

### `editarTransferencia(sessao, transferenciaId, dados)`

`dados`: `TransferenciaFormValues` (origem, destino, data, valor, descrição).

1. Permissão e `requireAlteracaoFilial`.
2. Busca os dois lados (`transferenciaId`, `filialId`, `origem:
   "TRANSFERENCIA"`). Precisa haver exatamente uma `SAIDA` e uma `ENTRADA`,
   senão "Transferência não encontrada na filial ativa".
3. Valida as contas novas pela filial; origem igual ao destino é recusada
   pelo schema, como na criação.
4. Algum lado com grupo: se origem, destino, data ou valor mudaram, recusa.
5. Numa transação, atualiza cada lado com `updateMany` filtrando o
   `grupoConciliacaoId` lido. Algum `count === 0` desfaz tudo e dá a
   mensagem de corrida. Sem grupo, `conciliado` de cada lado é recalculado
   pela conta nova.
6. Auditoria `EDITAR_TRANSFERENCIA` no id da saída (a criação usa
   `TRANSFERIR` no id da saída), com `transferenciaId` e antes/depois de
   origem, destino, data, valor e descrição.

### `excluirLancamento(sessao, id, motivo)`

1. Permissão e `requireAlteracaoFilial`. `motivo.trim()` vazio: "Informe o
   motivo da exclusão".
2. Busca com `{ id, filialId }`. `BAIXA` é recusado. `TRANSFERENCIA` passa a
   valer para os dois lados (pelo `transferenciaId`).
3. Algum lançamento envolvido com grupo: recusa.
4. Numa transação, `deleteMany({ where: { id: { in: ids }, filialId,
   grupoConciliacaoId: null } })`. Se `count` for diferente do número de
   lados, desfaz e dá a mensagem de corrida.
5. Auditoria `EXCLUIR` (manual) ou `EXCLUIR_TRANSFERENCIA` (no id da saída),
   com `anterior` = os registros inteiros e `novo` = `{ motivo }`.

Nenhuma outra tabela aponta para `LancamentoBancario` por chave estrangeira
além do grupo de conciliação, por isso o `delete` não deixa órfãos.

### Ações (`src/app/(dashboard)/financeiro/tesouraria/actions.ts`)

`editarLancamentoManualAction`, `editarTransferenciaAction` e
`excluirLancamentoAction`, no mesmo padrão das existentes: o id vem do
`formData`, os dados passam pelos schemas de criação, e o motivo é validado no
serviço (`trim()` não vazio), sem `exclusaoLancamentoSchema`.
`revalidatePath("/financeiro/tesouraria")`.

## Tela da Tesouraria

Mudanças só visíveis para quem tem `podeEscrever`.

- **Coluna de ações** no fim de cada linha, com Editar e Excluir, só em
  lançamentos `MANUAL` e `TRANSFERENCIA`. Os de `BAIXA` ficam sem botões.
- **Selo "Conciliado"** ao lado da origem quando há grupo (para todos que
  veem a tela). Nessas linhas, Excluir fica desabilitado com a dica
  "Desconcilie na Conciliação para excluir".
- A transferência continua em duas linhas. Editar ou Excluir em qualquer
  delas age na transferência inteira, e a confirmação diz "os dois lados:
  Conta A → Conta B".
- `listarLancamentos` passa a trazer o `grupoConciliacaoId` (já vem no
  registro) e, para as transferências, o que for preciso para montar o
  diálogo com os dois lados (ids, contas, grupo de cada lado).

**Editar** reaproveita `LancamentoDialogForm` e `TransferenciaDialogForm` em
modo edição: recebem um lançamento ou uma transferência inicial, mudam o
título ("Editar lançamento", "Editar transferência"), vêm preenchidos e
chamam a ação de edição.
- Manual com grupo: conta, tipo, data e valor desabilitados, com a nota
  "Ligado ao extrato: para mudar conta, tipo, data ou valor, desconcilie na
  Conciliação."
- Transferência com algum lado no grupo: só a descrição habilitada, com a
  mesma nota.
- **Cadastros inativos já usados continuam na lista.** A conta (hoje
  `resumoContas` só traz as ativas), a categoria e as dimensões gravadas no
  lançamento entram nas opções do diálogo mesmo inativas. Sem isso, o campo
  viria vazio e salvar apagaria a classificação sem a pessoa perceber.

**Excluir:** diálogo de confirmação com data, conta e valor (na transferência,
as duas contas) e o campo **Motivo**, obrigatório.

## Ajuda

- `src/ajuda/tesouraria/roteiros.ts`:
  - remover `SEM_CORRECAO` (linha 11) e o texto equivalente da transferência
    (linha 173). O passo de salvar passa a dizer que dá para corrigir depois
    pela lista;
  - "E depois?" do `ver-lancamentos` (linha 303): trocar o contorno da
    anulação pelo Editar e Excluir;
  - novo roteiro **"Corrigir ou excluir um lançamento"** (`corrigir-lancamento`),
    com passos para Editar, Excluir com motivo, o selo Conciliado e o caminho
    pela Conciliação (Desconciliar). Exemplo: as diárias da colheita lançadas
    como R$ 650,00 em vez de R$ 560,00 (a tarifa, na história da ajuda, ainda
    não foi lançada);
  - `cenas.tsx` e `alvos.ts`: coluna de ações e selo na cena da lista.
- `src/ajuda/conciliacao/roteiros.ts` (linha 265): o "E depois?" do
  `criar-lancamento` passa a dizer que a correção é feita na Tesouraria, e
  que conta, tipo, data e valor pedem desconciliar antes.
- O comentário no topo de `page.tsx` já lembra de espelhar a tela na ajuda.

O manual citado no backlog (seção 3.3) foi aposentado em 2026-11-21. Não há
outro texto a mudar.

## Testes

Serviço (`lancamentoBancario.test.ts`, banco de teste, no padrão dos atuais):
- manual sem grupo: edita todos os campos; auditoria `EDITAR` com antes e
  depois;
- trocar a conta de banco para Caixa deixa `conciliado = true`, e de Caixa
  para banco deixa `false`;
- manual com grupo: muda descrição e categoria; mudar valor, data, tipo ou
  conta é recusado; `conciliado` e grupo continuam iguais;
- transferência sem grupo: edita origem, destino, valor e data nos dois
  lados; com um lado no grupo, só a descrição;
- excluir manual sem grupo apaga e audita com o motivo; motivo vazio ou só
  espaços é recusado; com grupo é recusado;
- excluir transferência apaga os dois lados; com um lado no grupo, nenhum é
  apagado;
- origem `BAIXA` recusada em editar e excluir;
- lançamento de outra filial: não encontrado; conta e categoria de outra
  filial recusadas;
- corrida: o lançamento ganha grupo entre a leitura e a gravação (simulado
  pelo filtro do `updateMany`/`deleteMany`) e nada é gravado.

Ajuda: os testes atuais dos roteiros (`roteiros.test.ts`) cobrem o roteiro
novo (alvos existentes na cena).

Depois: conferência no navegador (editar manual em banco e em Caixa, editar
conciliado, editar e excluir transferência, excluir com motivo, conferir a
auditoria).

## Fora do escopo

- **Estorno de lançamento conciliado:** descartado. Conciliado só muda a
  classificação; para o resto, desconciliar (decisão 1).
- **Editar e excluir pela API REST** (`/api/v1/lancamentos-bancarios`):
  descartado. A API serve para o agente lançar, e a correção é feita por uma
  pessoa na tela.
- **Corrigir lançamento na tela da Conciliação:** descartado. A Tesouraria
  lista todos os lançamentos, e a Conciliação já tem o Desconciliar.
- **Lançamentos de origem `BAIXA`:** feito (item 3, estorno de baixa).
- **Status "excluído" visível na lista:** descartado (decisão 3). A
  auditoria guarda o registro e o motivo.
- **Lista da Tesouraria sem paginação e opções por linha:** backlog (item 64).
- **Corrida entre edição e conciliação 1:1/automática:** backlog (item 8,
  Cuidados).

Backlog: o item 6 sai de `docs/backlog.md` nesta branch.
