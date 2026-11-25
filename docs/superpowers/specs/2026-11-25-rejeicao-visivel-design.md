# Baixa rejeitada visível para quem registrou

Data: 2026-11-25 · Status: implementada (2026-11-25)

Item 5 do [backlog](../../backlog.md), seção "Financeiro — lacunas achadas ao
escrever a ajuda contextual" ("Rejeição não chega a quem registrou",
prioridade alta).

## Problema

`rejeitarBaixa` (`src/server/services/baixa.ts`) grava `motivoRejeicao`,
`avaliadoPorId` e `avaliadoEm`, mas nenhuma tela mostra isso fora da
Auditoria, que o perfil Financeiro não acessa. A lista "Baixas" da parcela
(`titulos-para-cliente.ts`) descarta as rejeitadas de propósito ("rejeitadas
são o item 5 do backlog").

Exemplo: a Tesouraria rejeita a baixa de R$ 1.012,00 com o motivo "Data
errada: pago em 16/10". Maria (Financeiro), que registrou, não fica sabendo. A
parcela volta a aceitar baixa, mas ninguém relança, e o pagamento real fica
sem registro no sistema. Hoje a ajuda de Aprovações manda avisar a pessoa por
fora.

## Decisões deste desenho

Todas foram escolhas do usuário.

1. **A parcela mostra a rejeição e Contas a pagar/receber mostra um aviso.**
   Mostrar só na parcela exige que a pessoa abra o título certo. O aviso no
   topo da lista ("N baixas rejeitadas aguardando novo registro") leva a um
   filtro só com os títulos afetados. Descartado: um cartão na Visão geral, que
   hoje só mostra contagens de cadastro.
2. **A rejeição se resolve sozinha, e quem trata pode dispensar.** Ela deixa de
   contar no aviso quando uma baixa nova é registrada na parcela, ou quando a
   parcela fica paga, cancelada ou renegociada. Quando a rejeição está certa e
   nada deve ser relançado (o pagamento não aconteceu), o botão **Dispensar**
   tira o aviso, com motivo, quem e quando. Descartados: só resolver
   automaticamente (a rejeição correta ficaria no aviso até a parcela ser
   quitada) e só dispensar manualmente (trabalho a mais em toda rejeição já
   relançada).
3. **O aviso conta todas as rejeições da filial**, não só as de quem está
   logado, para um colega poder tratar se quem registrou estiver fora.
   Qualquer pessoa que pode registrar baixa (`titulo:baixar`) pode dispensar.
4. **"Em aberto" é calculado na hora, não gravado.** A `Baixa` ganha só as
   colunas da dispensa. Descartado: gravar uma marca "resolvida", que exigiria
   lembrar de atualizá-la em registrar baixa, cancelar, renegociar, quitar,
   venda à vista e repasse. Esquecer um desses caminhos deixaria o aviso preso.

## Regra: rejeição em aberto

Uma baixa é uma **rejeição em aberto** quando cumpre as quatro condições:

1. `statusAprovacao` é `REJEITADO`;
2. `dispensadaEm` é nulo;
3. nenhuma outra baixa da mesma parcela, com qualquer status, tem `criadoEm`
   maior que o `avaliadoEm` desta;
4. a parcela não está `PAGO`, `CANCELADO` nem `RENEGOCIADO`.

A regra fica numa função pura, `rejeicaoEmAberto`, em
`src/lib/financeiro/rejeicaoEmAberto.ts`. Ela recebe a baixa, as outras baixas
da parcela e o status da parcela. A tela, a contagem do aviso e o filtro usam
essa função, para os três sempre concordarem.

Casos:

- **Rejeitada, relançada e rejeitada de novo:** a primeira se resolve, porque
  veio uma baixa depois dela. Só a mais nova fica em aberto. Pela regra, uma
  parcela tem no máximo uma rejeição em aberto, então o aviso conta parcelas
  sem repetir nenhuma.
- **Relançada e depois estornada:** a rejeição continua resolvida, porque
  houve um registro novo. O estorno tem seu próprio histórico.
- **Rejeitadas de antes desta mudança:** entram na regra normalmente. Uma que
  já tenha sido tratada por fora aparece no aviso e sai com um Dispensar. Os
  módulos ainda não estão em uso, então deve haver pouca ou nenhuma.
- **Baixa de venda à vista e de repasse de cartão:** nasce aprovada e nunca
  é rejeitada. Nada muda para elas.

## Banco de dados

Migration com três colunas novas, todas opcionais, em `Baixa`:

```prisma
dispensadaPorId String?
dispensadaEm    DateTime?
motivoDispensa  String?

dispensadaPor Usuario? @relation("BaixaRejeicaoDispensadaPor", fields: [dispensadaPorId], references: [id])
```

`Usuario` ganha a relação inversa. Não há conversão de dados.

## Servidor

### `dispensarRejeicao(sessao, baixaId, motivo)` em `baixa.ts`

1. `requirePermission(sessao.perfil, "titulo:baixar")` e
   `requireAlteracaoFilial(sessao.podeAlterarFilial)`.
2. Motivo com `trim()`, com pelo menos 3 caracteres; o schema zod da action
   valida antes, como no estorno.
3. Busca a baixa da filial ativa, com a parcela e as outras baixas dela
   (`buscarBaixaDaFilial` ou uma variante). Se não for da filial, dá o mesmo
   erro de "não encontrada" das outras ações.
4. Se não estiver em aberto (`rejeicaoEmAberto`), lança
   `RejeicaoNaoDispensavelError`, uma classe nova exportada de `baixa.ts`, como
   `BaixaPendenteError`. A mensagem depende do caso:
   - não é rejeitada: "Só uma baixa rejeitada pode ser dispensada";
   - já dispensada: "Esta rejeição já foi dispensada por {nome} em
     {data e hora}";
   - já resolvida: "Esta rejeição já foi resolvida: a parcela recebeu outra
     baixa ou não está mais em aberto".
5. Numa transação, grava `dispensadaPorId`, `dispensadaEm` e
   `motivoDispensa`, e registra a auditoria com entidade `Baixa`, ação
   `DISPENSAR_REJEICAO`, `anterior: { dispensadaEm: null }` e
   `novo: { dispensadaEm, motivoDispensa }`. O rótulo
   "Dispensar rejeição" entra em `src/lib/auditoria/rotulos.ts`.

Não há segregação de funções: dispensar só esconde o aviso, não mexe em saldo
nem em lançamento.

### Listagem

- `INCLUDE_TELA_TITULOS` (`titulo.ts`) passa a trazer, nas baixas,
  `avaliadoEm`, `motivoRejeicao`, `dispensadaEm`, `motivoDispensa` e
  `dispensadaPor { nome }`. `avaliadoEm` e `motivoRejeicao` são colunas da
  própria baixa e já vêm no `include`.
- `FiltroTitulos` ganha `rejeitadas?: true`. Com ele, `listarTitulos` mantém
  só os títulos com alguma parcela que tenha rejeição em aberto. O filtro é
  aplicado depois da busca, como os filtros de parcela, porque a regra compara
  baixas entre si.
- `contarRejeicoesEmAberto(filialId, tipo)` é uma função nova em `titulo.ts`
  ou `baixa.ts`. Ela busca as baixas `REJEITADO` não dispensadas da filial e
  do tipo, com a parcela (status e `criadoEm` das outras baixas), e conta as
  que passam em `rejeicaoEmAberto`. A página chama essa função à parte do
  filtro, para o aviso aparecer mesmo com outros filtros ativos.
- O export (CSV, Excel e PDF) não ganha colunas novas. Ele segue o filtro da
  URL, então com `rejeitadas=1` exporta só os títulos com rejeição em aberto,
  e o cabeçalho do PDF descreve o filtro.

## Tela

### URL e filtro

`rejeitadas=1` entra em `CAMPOS_FILTRO_TITULOS` (assim o link de exportar
leva o filtro) e em `filtroTitulosDaUrl`.
Qualquer outro valor é ignorado. `descrever-filtro-titulos.ts` descreve o
filtro como "com baixa rejeitada aguardando novo registro". A barra de filtros
não ganha um campo novo: o filtro é ligado pelo aviso e desligado pelo "Limpar
filtros", que já existe.

### Aviso no topo de Contas a pagar e Contas a receber

Com N > 0, um aviso aparece acima da tabela, no estilo âmbar já usado em
`producao/processamento/[numero]/page.tsx` (`rounded-md border
border-amber-500/40 bg-amber-500/10`, com `role="status"`):

> **2 baixas rejeitadas aguardando novo registro.** Confira o motivo na
> parcela e lance de novo, ou dispense se não houver o que relançar. **Ver**

"Ver" leva para a mesma página com `?rejeitadas=1`. Com o filtro já ativo, o
link some. N = 1 usa o singular. Todos os perfis que veem a tela veem o aviso.

### Lista "Baixas" da parcela

`titulosParaCliente` passa a incluir as rejeitadas. `BaixaDaParcela` ganha:

- `status` com o valor `"REJEITADO"`;
- `rejeitadaPor`, `rejeitadaEm` e `motivoRejeicao`, vindos de
  `avaliadoPor`, `avaliadoEm` e `motivoRejeicao`; quando a baixa é rejeitada,
  `aprovadaPor` fica nulo;
- `rejeicaoEmAberto: boolean`;
- `dispensadaPor`, `dispensadaEm` e `motivoDispensa`.

A lista continua ordenada pela data e, empatando, pelo registro.

**Rejeição em aberto:** linha normal com o selo **Rejeitada** (variante
`destructive`) e, embaixo:

> rejeitada por Ana em 15/10/2026 14:32: Data errada: pago em 16/10

À direita, para quem tem `titulo:baixar`: o botão **Dispensar** (variante
outline, `aria-label` "Dispensar rejeição da baixa de {data} de {valor}").
O botão Baixar da parcela continua onde está: é por ele que se relança.

**Rejeição resolvida** (relançada, dispensada ou parcela fechada): uma linha
só, apagada (`text-muted-foreground`), sem botão:

> Baixa de 14/10/2026 · R$ 1.012,00 · rejeitada por Ana: Data errada: pago em
> 16/10

Quando foi dispensada, a linha acrescenta "· dispensada por Maria: pagamento
não aconteceu".

`temBaixaPendente` continua contando só `PENDENTE`.

### Diálogo Dispensar

Copia o `estornar-dialog.tsx`: título "Dispensar rejeição", o resumo da baixa
(data, conta, valor, motivo da rejeição), a pergunta "Por que não vai lançar
de novo?", um campo de motivo obrigatório e os botões **Dispensar** e
**Cancelar**. A action nova, `dispensarRejeicaoAction`, fica em
`_titulos/actions.ts`, faz `revalidatePath` das duas telas de títulos e
devolve a mensagem de `RejeicaoNaoDispensavelError` como erro do formulário.

## Ajuda

- `src/ajuda/aprovacoes/roteiros.ts`, roteiro `rejeitar-baixa`, passo
  "Clique em Rejeitar": a dica deixa de mandar avisar por fora. Passa a dizer
  que a rejeição aparece na parcela, com o motivo, e no aviso de Contas a
  pagar/receber. O "E depois?" deixa de falar só que a linha some.
- `src/ajuda/contas-a-pagar/roteiros.ts` e
  `src/ajuda/contas-a-receber/roteiros.ts`:
  - novo roteiro `tratar-rejeitada` ("Quando uma baixa é rejeitada"): o aviso
    no topo, o Ver, a parcela com o selo e o motivo, relançar pelo Baixar ou
    Dispensar com motivo;
  - os textos das linhas 286 e 296 de pagar (285 e 295 de receber), que dizem
    que a rejeitada deixa a parcela em aberto, citam onde ver o motivo.
- As réplicas (`src/ajuda/_titulos/cenas.tsx` e `exemplo.ts`) ganham o aviso,
  a linha rejeitada e o diálogo Dispensar, seguindo o comentário de
  espelhamento em `baixas-da-parcela.tsx`.

## Testes

- `rejeicaoEmAberto`: cada condição e cada caso da seção Regra, incluindo
  rejeitada duas vezes e relançada e estornada.
- `dispensarRejeicao` (banco de teste, como `baixa.test.ts`): sucesso com a
  auditoria, motivo curto, perfil sem `titulo:baixar` (Tesouraria tem; Gestor
  não), filial somente leitura, baixa de outra filial, baixa não rejeitada, já
  dispensada e já resolvida.
- `contarRejeicoesEmAberto` e o filtro `rejeitadas` em `listarTitulos`: só as
  em aberto, por tipo e por filial.
- `titulosParaCliente`: inclui as rejeitadas com os campos novos;
  `filtroTitulosDaUrl`: `rejeitadas=1` e um valor inválido.
- Ajuda: os testes de roteiros e cenas que já existem cobrem os alvos novos.
- Conferência no navegador: rejeitar em Aprovações; ver o aviso e o filtro
  como Financeiro; ver a parcela; relançar e o aviso sumir; rejeitar de novo e
  dispensar.

## Fora do escopo

- **API** → descartado (já atendido): `GET /titulos` usa
  `parcelas: { include: { baixas: true } }` e já devolve cada baixa com
  `statusAprovacao` (inclusive `REJEITADO`), `motivoRejeicao` e `avaliadoEm`;
  as colunas novas da dispensa saem do mesmo jeito. Basta uma nota em
  `docs/api-v1.md` dizendo onde ver a rejeição e a regra de "em aberto".
- **Notificação por e-mail ou no sino** → descartado: o sistema não tem envio
  de e-mail nem central de notificações, e o aviso na lista resolve.
- **Filtro de rejeitadas na barra de filtros** → descartado: o aviso já liga o
  filtro, e um campo a mais na barra pouco ajuda.
- **Rejeições na Visão geral** → descartado: a página só mostra contagens de
  cadastro (decisão 1).
