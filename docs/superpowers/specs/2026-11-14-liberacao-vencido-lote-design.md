# Liberação de lote vencido no próprio lote

Data: 2026-11-14 · Status: implementada (2026-11-14)

Ajustes na implementação: a checagem do pedido e da OP mora numa função só,
`exigirLiberacao` em `src/server/services/estoque.ts`; a tela da OP mostra
"liberado até" apenas quando a liberação cobre a data da OP.

Item do backlog da Fase 7 ("Liberar fruto vencido na OP") e o mesmo problema
na venda. Hoje a liberação é feita **item a item, no lançamento**: quem cria o
pedido ou adiciona o consumo na OP precisa ter `venda:liberarVencido` ou
`producao:liberarVencido` e escrever o motivo. Essas permissões são do
Gestor, que não lança pedido nem OP; na prática só o Administrador lança e
libera ao mesmo tempo.

Novo modelo: o **Gestor libera o lote** na tela de Estoque, por um prazo
limitado definido no produto; depois disso qualquer perfil que lança pedido
ou OP movimenta o lote dentro do prazo.

Regras de origem: RN-09, RN-16 e RN-18 do
[doc 3](../../modulos/producao-estoque-vendas/03-regras-de-negocio.md);
D-03 do [doc 8](../../modulos/producao-estoque-vendas/08-duvidas-decisoes.md).

## Decisões deste desenho (registrar no doc 08)

- **D-35 — Liberação do vencido no lote:** substitui a liberação por item da
  D-03. O Gestor (e o Administrador) libera o lote vencido com motivo; a
  liberação vale até **validade + N dias**, onde N é configurado no produto.
  Pedido e OP aceitam o lote vencido enquanto a data da operação estiver
  dentro desse prazo, sem depender do perfil de quem lança.

Atualizações de decisões existentes, na mesma branch:

- **D-03:** nota "substituída pela D-35 (2026-11-14)".
- **D-10:** fechada. Os campos de texto da etiqueta já existem (registro
  ADEPARA e endereço na configuração de produção, texto livre no produto);
  quando a lista chegar, basta preenchê-los (2026-11-14).
- **D-21 e 7d:** de "adiada" para **definitivo: não haverá importação da
  planilha**, os dados estão desatualizados (2026-11-14).

## Modelo

Uma migration:

- `Produto.diasLiberacaoVencido Int?` — "Dias de liberação após vencimento".
  Inteiro de 1 a 365; vazio = o produto não pode ser liberado.
- `Lote`:
  - `liberadoAte DateTime?` — último dia em que o lote pode ser movimentado
    (inclusive);
  - `liberadoEm DateTime?`;
  - `liberadoPorId String?` → `Usuario` (`onDelete: SetNull`);
  - `motivoLiberacao String?`.
- `ItemPedidoVenda.motivoLiberacaoVencido` e `ConsumoOP.motivoLiberacaoVencido`
  continuam; passam a receber uma **cópia** do `motivoLiberacao` do lote.

Os quatro campos do lote são preenchidos juntos e limpos juntos.

## Regras

Funções puras em `src/lib/producao/liberacaoVencido.ts`:

- `liberadoAteDoLote(validade, dias)` = validade + `dias` dias (UTC, como as
  demais datas de lote).
- `liberacaoCobre(lote, data)` = `liberadoAte != null && data <= liberadoAte`.

**Liberar** (`liberarLoteVencido(sessao, loteId, motivo)` no serviço de
estoque). Exige `estoque:liberarVencido` e alteração na filial. Recusa, nesta
ordem:

1. lote de outra filial / inexistente → "Lote não encontrado";
2. recepção excluída, ou polpa de OP aberta/removida (`bloqueioDaProducao`);
3. saldo ≤ 0 → "O lote X está zerado";
4. não vencido hoje (validade ≥ hoje) → "O lote X ainda não venceu";
5. produto sem `diasLiberacaoVencido` → "Configure os dias de liberação após
   vencimento no cadastro do produto";
6. validade + N < hoje → "O prazo máximo de liberação deste lote terminou em
   dd/mm/aaaa";
7. motivo vazio → "Informe o motivo da liberação".

Grava `liberadoAte`, `liberadoEm = agora`, `liberadoPorId`, `motivoLiberacao`
e audita `LIBERAR_VENCIDO` (lote, liberado até, motivo). Liberar de novo um
lote já liberado substitui a liberação (novo motivo; a data recalculada é a
mesma, a não ser que N tenha mudado no produto) e também é auditado.

A data fica **congelada** no lote: mudar N no produto depois não altera
liberações já feitas.

**Revogar** (`revogarLiberacaoLote(sessao, loteId)`): mesma permissão; limpa
os quatro campos e audita `REVOGAR_LIBERACAO`. Recusa lote sem liberação.

**Pedido de venda e consumo da OP.** Um lote vencido na data da operação
(`loteVencidoNaData`) só é aceito se `liberacaoCobre(lote, dataDaOperacao)`;
o perfil de quem lança não importa mais. O motivo do item vem do lote. Fora
disso:

- sem liberação → "O lote X venceu em dd/mm/aaaa";
- liberação que não cobre a data → "O lote X venceu em dd/mm/aaaa; a
  liberação vale até dd/mm/aaaa".

O campo `motivoLiberacaoVencido` sai dos schemas de entrada do pedido e do
consumo (`pedidoVenda.ts`, `ordemProducao.ts`).

**Permissões.** `venda:liberarVencido` e `producao:liberarVencido` deixam de
existir; entra `estoque:liberarVencido`, do **Gestor** (o Administrador tem
todas). `cadastroProducao:escrever` continua sendo quem edita o produto.

**Status.** O `StatusLote` (RN-16) não muda: o lote continua "Vencido". A
liberação é uma informação a mais, mostrada enquanto `liberadoAte ≥ hoje`.

## Telas

**Cadastro do produto** (`/cadastros/produtos`): campo "Dias de liberação após
vencimento", opcional, com a dica "Tolerância máxima após a validade. Vazio =
o produto não pode ser liberado." Validação 1–365 no schema do produto.

**Estoque** (`/producao/estoque`, lista por lote):

- Ação **"Liberar"** ao lado de "Mover", em lotes vencidos com saldo, para
  quem tem `estoque:liberarVencido` e pode alterar a filial. Abre um diálogo:
  - produto com prazo e dentro dele: "A movimentação ficará liberada até
    dd/mm/aaaa (validade + N dias)", campo de motivo e botão Liberar;
  - produto sem prazo: a mensagem para configurar; link "Editar produto"
    (para `/cadastros/produtos`) só para quem tem `cadastroProducao:escrever`,
    os demais leem "peça a configuração a quem cadastra produtos"; sem botão
    Liberar;
  - prazo encerrado: a mensagem de prazo encerrado; sem botão Liberar.
- Lote com liberação vigente: abaixo do badge "Vencido", o texto
  **"Movimentação liberada até dd/mm/aaaa"**, com `title` "Liberado por
  Fulano em dd/mm/aaaa: motivo"; ação **"Revogar"** com confirmação.
- Passado o prazo, o texto some e o lote volta a ser só "Vencido".

**Pedido de venda** (`/vendas/pedidos/novo`): sai o campo de motivo por item.
Para lote vencido na data do pedido: "Liberado até dd/mm/aaaa" se a liberação
cobre; senão, em vermelho, "Lote vencido: peça a liberação ao gestor na tela
de Estoque". As opções de lote passam a trazer `liberadoAte`.

**OP** (adicionar consumo em `/producao/processamento/[numero]`): mesma troca
do pedido.

Os detalhes do pedido e da OP continuam mostrando o motivo gravado no item.

## Testes

- **Unitários** (`liberacaoVencido.test.ts`): `liberadoAteDoLote` (soma de
  dias, virada de mês) e `liberacaoCobre` (sem liberação, no limite, depois).
- **Integração do serviço de estoque**: liberar sem permissão, lote não
  vencido, zerado, produto sem prazo, prazo encerrado, sem motivo, caso
  válido (campos gravados e auditoria); liberar de novo; revogar (campos
  limpos, auditoria) e revogar sem liberação.
- **Pedido e OP**: aceitam lote liberado dentro do prazo com qualquer perfil
  que lança e copiam o motivo; recusam vencido sem liberação e com liberação
  que não cobre a data. Os testes atuais de motivo por item são adaptados.
- **Permissões**: `estoque:liberarVencido` só para Gestor e Administrador.
- **Produto**: schema aceita vazio e 1–365, recusa 0 e 366.
- **Navegador**: cenário por script (produto com e sem prazo, lote vencido
  dentro e fora do prazo), liberar com Gestor, vender com Vendas, consumir
  na OP com Produção, revogar; limpar no fim.

## Docs

- Doc 08: D-35; notas em D-03, D-10, D-21; 7d definitiva.
- Doc 03: RN-18 reescrita (bloqueio + liberação no lote, até validade + N) e
  menção na RN-09.
- Doc 05: permissão `estoque:liberarVencido` no lugar das duas antigas; ação
  na tela de Estoque.
- Ajuda (`content/ajuda/passo-a-passo.md`): seção do Estoque explica liberar
  e revogar; pedido e OP deixam de falar em motivo por item.
- Backlog: sai "Liberar fruto vencido na OP".
- `docs/fases/fase-7-producao-estoque-vendas.md` e README do módulo:
  liberação no lote, 7d definitiva, D-10 fechada.

## Fora do escopo

- Prazo escolhido pelo gestor menor que validade + N (a data é sempre a
  calculada). — **descartado:** o gestor pode desfazer a liberação a
  qualquer momento.
- Filtro "liberado" no Estoque e no relatório de estoque. —
  **descartado:** o lote liberado já aparece marcado na lista de
  vencidos.
- Aviso automático quando a liberação expira. — **descartado:** ao
  expirar, o lote volta a bloquear; nada sai vencido sem liberação.
