# Transferência parcial de lote entre locais

Data: 2026-11-18 · Status: desenho aprovado em chat

Item do backlog "Transferência parcial de lote entre locais" (7b; varredura
de 2026-11-16). Hoje `moverLote` ([estoque.ts](../../../src/server/services/estoque.ts))
troca o local do **lote inteiro** (D-15). Quando só parte do lote vai para
outra câmara, ou o local fica errado ou o usuário recorre a ajustes de
saída/entrada, que quebram a rastreabilidade do lote e a ocupação por local.

Regras de origem: RN-08, RN-19, RN-27 e RN-28 do
[doc 3](../../modulos/producao-estoque-vendas/03-regras-de-negocio.md);
D-07, D-15, D-33 e D-35 do
[doc 8](../../modulos/producao-estoque-vendas/08-duvidas-decisoes.md).

## Decisões deste desenho (registrar no doc 08)

- **D-36 — Transferência parcial por lote filho:** a parte transferida vira
  um **lote filho** no local de destino, com código `ORIGINAL/N` numerado a
  partir do lote original (nunca `ORIGINAL/1/1`). Se a família já tem um
  lote no destino, a quantidade é somada nele em vez de criar outro. A
  liberação de vencido (D-35) passa a valer para a família inteira.

Alternativa descartada: guardar o saldo do mesmo lote por local. Mantinha um
código só, mas obrigava toda saída (venda, consumo de OP, ajuste) a dizer de
qual local sai, mexendo em todas essas telas e regras.

Atualização de decisão existente, na mesma branch:

- **D-15:** nota "transferência parcial feita pela D-36 (2026-11-18)".

## Modelo

Uma migration:

- `Lote.loteOrigemId String?` → `Lote` (`onDelete: Restrict`), relação
  `"FamiliaDoLote"` (`loteOrigem` / `filhos`), `@@index([loteOrigemId])`.
  Vazio no lote original; nos filhos aponta **sempre para o original**, nunca
  para um filho intermediário.
- `TipoMovimentoEstoque` ganha `TRANSFERENCIA_SAIDA` e `TRANSFERENCIA_ENTRADA`.
- `MovimentoEstoque.transferenciaId String?` (uuid gerado no serviço, sem
  tabela própria), `@@index([transferenciaId])`: liga o par saída/entrada.

"Família" de um lote = o original (`loteOrigemId ?? id`) e todos os lotes com
`loteOrigemId` igual a ele.

O filho é criado com `origem`, `produtoId`, `data`, `validade`, `custoKg` e os
quatro campos de liberação copiados do original; `codigoManual = false`;
`quantidadeInicialKg = 0` e `saldoKg = 0` — o saldo entra pelo movimento
`TRANSFERENCIA_ENTRADA`, pelo caminho único `registrarMovimento`.

## Regras da transferência

`transferirLote(sessao, loteId, localId, kg)` em `estoque.ts` substitui
`moverLote` (o caso "lote inteiro" fica coberto por ele).

1. **Permissão:** `producao:escrever` + `requireAlteracaoFilial` (as mesmas
   do mover atual).
2. **Local de destino:** da filial, ativo e diferente do local do lote.
   Senão: "Local de armazenamento não encontrado ou inativo" / "O lote já
   está neste local".
3. **Quantidade:** `0 < kg ≤ saldo`, até 3 casas. Senão: "Informe uma
   quantidade maior que zero" / `Saldo insuficiente no lote X` (do
   `movimentarSaldo`).
4. **Com movimento, só lote que pode sair** (`LOTE_LIBERADO`, já ajustado
   para a família — ver abaixo): recepção do original não excluída, ou polpa
   de OP **encerrada**. Polpa de OP aberta é recusada (`bloqueioDaProducao`):
   o custo dela ainda muda no encerramento, e o movimento travaria reabrir e
   cancelar a OP. Recepção excluída: "O lote X é de uma recepção excluída".
   A troca de local do lote inteiro (sem movimento, regra 6) continua
   aceitando qualquer lote, como o mover atual.
5. **Vencido pode ser transferido:** a transferência não é saída de estoque;
   a liberação continua exigida só na venda e na OP.
6. **Destino:**
   - a família já tem lote no destino → `TRANSFERENCIA_SAIDA` no lote de
     origem e `TRANSFERENCIA_ENTRADA` nesse lote (mesmo `transferenciaId`);
     vale também para o saldo inteiro, que deixa o lote de origem zerado;
   - não tem e `kg` é o **saldo inteiro** → só troca o `localId` do lote,
     sem filho e sem movimento (comportamento atual do mover);
   - não tem e é parcial → cria o filho `ORIGINAL/N` no destino e grava o
     par de movimentos. `N` = maior sufixo numérico entre os códigos
     `ORIGINAL/…` da filial + 1.
7. **Concorrência:** a transação trava a linha do **lote original**
   (`SELECT … FOR UPDATE`), serializando as transferências da mesma família
   (evita dois filhos no mesmo destino e dois `/N` iguais). O índice único
   `[filialId, codigo]` continua como última barreira.
8. **Data:** o movimento é gravado com a data de hoje (`hojeDeCalendario`).
9. **Auditoria:** `TRANSFERIR` no lote de origem, com
   `anterior: { localId, saldoKg }` e
   `novo: { localDestinoId, kg, loteDestino (código), loteCriado (bool) }`.
   O caso "só troca o local" mantém a ação `MOVER` atual.

## Efeitos no resto do sistema

### Lote que pode sair (venda, OP, ajuste)

O filho não tem recepção nem `ProducaoOP` próprios. Sem ajuste, a polpa filha
ficaria bloqueada para sempre e o fruto filho passaria sem checar a recepção.

- `LOTE_LIBERADO` passa a aceitar o filho quando o **original** satisfaz a
  regra atual (`loteOrigem: { is: <regra atual> }`).
- `SELECT_BLOQUEIO_PRODUCAO` e `bloqueioDaProducao` olham a `ProducaoOP` do
  original quando o lote é filho; idem a checagem de recepção excluída no
  ajuste e na liberação.
- Na prática o original não volta a ficar bloqueado: a transferência grava
  movimento no original (ou o original nem tem saldo transferido, no caso
  "só troca o local"), e isso já impede excluir a recepção e reabrir ou
  cancelar a OP. O ajuste existe para a regra ser correta por construção, não
  depender dessa coincidência.

### Recepção e OP

- **Excluir recepção** com lote transferido: recusado pela regra atual
  (movimento além da entrada). Sem mudança.
- **Reabrir/cancelar OP** com polpa transferida: recusado pela regra atual de
  `situacaoParaDesfazer` (movimento além de `PRODUCAO_OP`). A mensagem passa
  de "já teve venda ou ajuste" para "já teve venda, ajuste ou transferência".
- **Cancelar OP** que consumiu fruto de um filho: o fruto volta ao lote
  consumido, como hoje.

### Liberação de vencido (D-35)

`liberarLoteVencido` e `revogarLiberacaoLote` gravam os quatro campos em
**todos os lotes da família** (`updateMany`), com uma auditoria por ação (no
lote em que a ação foi feita, com `familia: [códigos]` no `novo`). As
checagens (vencido, prazo, saldo) usam o lote clicado; "zerado" passa a olhar
o saldo da família.

### Rastreabilidade (7f)

A consulta passa a ser **por família**: digitar o original ou qualquer filho
mostra a família inteira (no recall o que importa é a origem).

- **Lote consultado:** cabeçalho mostra o lote digitado (código, local,
  saldo, status).
- **Para trás:** recepção e OP de origem vêm do original.
- **Para frente (fruto):** OPs que consumiram qualquer lote da família;
  `kgDesteLote` vira o kg da família, e cada OP lista quais lotes da família
  consumiu.
- **Clientes:** itens de pedido de qualquer lote da família (caminho
  `DIRETO`) e das polpas derivadas (`POLPA`); `loteVendido` já mostra qual.
- **Destino de cada kg:** `destinoDoLote` recebe os movimentos e o saldo da
  família. `TRANSFERENCIA_*` não entra em nenhuma linha e se anula na soma,
  então `confere` continua valendo.
- **Frutos consumidos (polpa):** quando o fruto consumido é filho, a origem
  (talhão/fornecedor) vem da recepção do original.
- **Seção nova "Lotes da família"** (só quando a família tem mais de um
  lote): código, local, saldo, validade; o consultado destacado.
- **Export** Excel/PDF da rastreabilidade ganha a mesma seção.

Relatórios mensal, origem, processamento e painel leem `RecepcaoFruto` e
`ProducaoOP`, não lotes: não mudam.

### Tela de Estoque

- O diálogo "Mover lote" vira **"Transferir"**: local de destino e kg
  (pré-preenchido com o saldo). A action chama `transferirLote`.
- A lista de lotes não muda; o filho aparece como lote comum com o código
  `/N`. Ocupação por local fica correta porque cada lote continua num local.

## Testes

Banco real, mesmo padrão de `estoque.test.ts`/`producaoTestFixtures.ts`.

- Parcial cria `/1` no destino com atributos do original, par de movimentos
  com o mesmo `transferenciaId`, saldos certos; segunda transferência para
  outro local cria `/2`; transferir o `/1` para um terceiro local cria `/3`.
- Destino com lote da família soma nele; devolver para o local do original
  junta no original; saldo inteiro para lá zera a origem.
- Saldo inteiro sem lote da família no destino: só troca o local, sem filho
  nem movimento, auditoria `MOVER`; aceito também para polpa de OP aberta.
- Recusas: kg ≤ 0, kg > saldo, mesmo local, local inativo ou de outra
  filial, lote de outra filial, polpa de OP aberta, recepção excluída,
  perfil sem permissão.
- Lote vencido é transferido.
- Liberar/revogar num filho vale para a família.
- Venda, OP e ajuste aceitam o filho de original liberado; polpa filha de OP
  encerrada sai normalmente.
- Reabrir/cancelar OP com polpa transferida é recusado com a mensagem nova.
- Excluir recepção com lote transferido é recusado.
- Rastreabilidade: consultar o filho traz recepção do original; OPs e
  clientes de todos os lotes da família; destino da família confere; seção
  "Lotes da família"; fruto filho consumido mostra a origem do original.
- `destinoDoLote` ignora `TRANSFERENCIA_*` (teste unitário).

Conferência no navegador no fim, com cenário por script temporário:
transferir parte, juntar de volta, vender o filho, rastrear.

## Documentação

- Doc 08: D-36; nota na D-15.
- Doc 03: **RN-34 — Transferência entre locais** (regras 2 a 6 acima).
- Ajuda (`content/ajuda/passo-a-passo.md`): como transferir; "Lotes da
  família" na rastreabilidade.
- `docs/fases/fase-7-producao-estoque-vendas.md`: registrar a entrega.
- `docs/backlog.md`: remover o item.

## Fora do escopo

- Desfazer transferência — descartado (transferir de volta junta no lote de
  origem e resolve).
- Data retroativa na transferência — descartado (a transferência é física e
  imediata, não muda o saldo da família nem valores).
- Transferência entre filiais — descartado (lote, local e estoque são por
  filial; seria venda/compra entre filiais, outro assunto).
- Juntar lotes de famílias diferentes — descartado (misturaria origens e
  quebraria a rastreabilidade).
