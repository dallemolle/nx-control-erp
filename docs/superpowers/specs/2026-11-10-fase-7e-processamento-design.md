# Fase 7e — Processamento (OP)

Data: 2026-11-10 · Status: implementada (2026-11-10)

Ajuste na implementação: `atualizarOP` virou duas operações,
`atualizarCabecalhoOP` (data, fruta, responsável) e `atualizarProcessoOP`
(branqueamento, água, caroço, perda, observação), para um formulário não
apagar os campos que o outro não envia.

Quinto sub-projeto da Fase 7 (ver
[plano de entrega](../../modulos/producao-estoque-vendas/09-plano-de-entrega.md)).
Parte da 7b (lotes, saldo por movimentos, etiqueta) e da 7c (venda que
passa a respeitar o bloqueio da polpa). Entrega a ordem de produção (OP)
com consumo de fruto, produção de lotes de polpa, insumos e processo;
rendimento, balanço de massa, branqueamento e custo ao vivo; encerramento
com custo gravado; reabertura; cancelamento; e a etiqueta configurável da
polpa. **Não inclui** rastreabilidade (7f), relatório de processamento e
painel (7g), rateio de custo por qualidade nem estoque de insumos.

Regras de origem: RN-02, RN-07, RN-08, RN-09 a RN-14 e RN-19 do
[doc 3](../../modulos/producao-estoque-vendas/03-regras-de-negocio.md).

Decisões aplicadas:

- **Estoque a cada linha:** cada consumo lançado baixa o fruto na hora e
  cada produção lançada cria o lote de polpa na hora. Corrigir é remover a
  linha (gera estorno) e lançar de novo.
- **D-05:** custo do insumo congelado no lançamento da linha; custo do
  fruto é o `custoKg` do lote no lançamento do consumo.
- **D-06:** todas as polpas da OP recebem o mesmo custo/kg. Rateio por
  qualidade vai para o backlog.
- **D-07:** lote de polpa de OP não encerrada fica **bloqueado para venda e
  ajuste** (mover de local continua permitido). Libera ao encerrar.
- **D-08:** `Fruta.exigeBranqueamento` (já existe desde a 7a).
- **D-10:** etiqueta configurável (endereço por filial, texto por produto)
  até a lista da ADEPARA/APPCC chegar.
- **Fruto vencido:** recusado na OP, salvo para quem tem
  `producao:liberarVencido`, com motivo obrigatório gravado na linha e na
  auditoria (mesma regra da venda, D-03).
- **OP encerrada com erro:** **reabrir** (motivo obrigatório) se nenhum
  lote de polpa da OP teve venda ou ajuste; ou cancelar, com a mesma
  condição.

## 1. Modelo

### Enums

```prisma
enum StatusOrdemProducao { ABERTA ENCERRADA CANCELADA }
// TipoMovimentoEstoque += CONSUMO_OP, ESTORNO_CONSUMO_OP, PRODUCAO_OP, ESTORNO_PRODUCAO_OP
```

### Ordem de produção

```prisma
model OrdemProducao {
  id                        String              @id @default(uuid())
  filialId                  String
  numero                    String               // OP-261110-01 (RN-02)
  data                      DateTime             // data de calendário (UTC)
  frutaId                   String
  responsavel               String?              // texto livre
  branqueamentoTemperaturaC Decimal?  @db.Decimal(5, 1)
  branqueamentoTempoS       Int?
  aguaLitros                Decimal   @default(0) @db.Decimal(18, 3)
  carocoResiduoKg           Decimal   @default(0) @db.Decimal(18, 3)
  perdaKg                   Decimal   @default(0) @db.Decimal(18, 3)
  observacao                String?
  status                    StatusOrdemProducao @default(ABERTA)
  // gravados ao encerrar (RN-13); limpos ao reabrir:
  custoFrutoTotal           Decimal?  @db.Decimal(18, 2)
  custoInsumosTotal         Decimal?  @db.Decimal(18, 2)
  custoKgPolpa              Decimal?  @db.Decimal(18, 4)
  encerradaEm               DateTime?
  motivoReabertura          String?              // a última
  motivoCancelamento        String?
  canceladaEm               DateTime?
  usuarioId                 String
  criadoEm / atualizadoEm
  @@unique([filialId, numero])
  @@index([filialId, data])
  @@map("ordens_producao")
}
```

### Linhas

```prisma
model ConsumoOP {
  id                     String    @id @default(uuid())
  ordemProducaoId        String
  loteId                 String               // lote de FRUTO, mesma fruta (RN-14)
  quantidadeKg           Decimal   @db.Decimal(18, 3)
  custoKg                Decimal   @db.Decimal(18, 4) // do lote, no lançamento
  motivoLiberacaoVencido String?
  removidoEm             DateTime?
  criadoEm
  @@index([ordemProducaoId])
  @@index([loteId])
  @@map("consumos_op")
}

model ProducaoOP {
  id              String    @id @default(uuid())
  ordemProducaoId String
  loteId          String    @unique            // o lote de POLPA que ela cria
  produtoId       String                       // POLPA, mesma fruta
  quantidadeKg    Decimal   @db.Decimal(18, 3)
  embalagens      Int?
  localId         String
  removidoEm      DateTime?
  criadoEm
  @@index([ordemProducaoId])
  @@map("producoes_op")
}

model InsumoOP {
  id              String    @id @default(uuid())
  ordemProducaoId String
  insumoId        String
  quantidade      Decimal   @db.Decimal(18, 3)
  custoUnitario   Decimal   @db.Decimal(18, 4) // congelado no lançamento (D-05)
  removidoEm      DateTime?
  criadoEm
  @@index([ordemProducaoId])
  @@map("insumos_op")
}
```

Linhas removidas não são apagadas: ficam com `removidoEm` e os estornos
correspondentes no ledger. Telas e cálculos consideram só linhas com
`removidoEm = null`. Um mesmo lote de fruto não aparece em duas linhas
ativas da mesma OP.

`MovimentoEstoque` ganha `consumoOpId String?` e `producaoOpId String?`
(FKs). Movimentos:

| Evento | Lote | Tipo | kg |
|---|---|---|---|
| Lançar consumo | fruto | `CONSUMO_OP` | − |
| Remover consumo / cancelar OP | fruto | `ESTORNO_CONSUMO_OP` | + |
| Lançar produção | polpa (novo) | `PRODUCAO_OP` | + |
| Remover produção / cancelar OP | polpa | `ESTORNO_PRODUCAO_OP` | − (zera) |

### Acréscimos

| Onde | Campo | Uso |
|---|---|---|
| `Produto` | `textoEtiqueta String?` | Texto livre na etiqueta (ingredientes, instruções de conservação). |
| `ConfiguracaoProducao` | `enderecoEtiqueta String?` | Endereço impresso na etiqueta. |

### Ciclo de vida

- **ABERTA:** linhas lançadas e removidas uma a uma. O lote de polpa nasce
  com código do padrão da 7b (`prefixoDoLote(produto.codigo, data da OP)`),
  validade = data da OP + validade do produto (RN-07), local informado
  (RN-08) e `custoKg` **provisório**, recalculado em todos os lotes de
  polpa ativos da OP a cada mudança de consumo, produção ou insumo. Data e
  fruta só podem mudar enquanto a OP não tem linhas ativas.
- **ENCERRADA:** custos gravados na OP e `custoKg` final em todos os lotes
  de polpa. Nenhuma linha muda.
- **Reabrir:** ENCERRADA → ABERTA, limpa os custos gravados e
  `encerradaEm`; a polpa volta a ficar bloqueada.
- **CANCELADA:** estorna todos os consumos e zera todos os lotes de polpa
  ativos (as linhas não são marcadas como removidas: o status da OP já
  diz). Final.

## 2. Cálculos (funções puras, `src/lib/producao/op.ts`)

- `rendimento(frutoKg, polpaKg)` → `polpa ÷ fruto`, ou `null` se fruto = 0
  (RN-10).
- `balancoMassa({ frutoKg, aguaLitros, polpaKg, carocoResiduoKg, perdaKg }, tolerancia)`
  → `{ diferencaKg, percentual, status: "OK" | "VERIFICAR" }`;
  `diferença = fruto + água − polpa − caroço − perda`;
  `% = diferença ÷ (fruto + água)`; OK se `|%| ≤ tolerância`. Entrada
  (fruto + água) = 0 → `percentual = null`, `VERIFICAR` (RN-11).
- `statusBranqueamento({ exige, temperaturaC, tempoS }, { temperaturaMinC, tempoMinS })`
  → `NAO_SE_APLICA` se a fruta não exige; `OK` se temperatura ≥ mínimo **e**
  tempo ≥ mínimo; senão `VERIFICAR` (inclui valor não preenchido) (RN-12).
- `custoOP({ consumos: [{ quantidadeKg, custoKg }], insumos: [{ quantidade, custoUnitario }], polpaKg })`
  → `{ custoFrutoTotal, custoInsumosTotal, custoTotal, custoKgPolpa }`;
  totais com 2 casas, custo/kg com 4; `custoKgPolpa = 0` se polpa = 0
  (RN-13).
- Número: `proximoCodigoDeLote("OP-" + AAMMDD, existentes)` (reaproveita a
  função da 7b).

## 3. Serviços

### Ordem de produção (`ordemProducao.ts`)

Toda escrita: `producao:escrever` + `requireAlteracaoFilial`, transação,
auditoria (`CRIAR`, `ATUALIZAR`, `ADICIONAR_CONSUMO`, `REMOVER_CONSUMO`,
`ADICIONAR_PRODUCAO`, `REMOVER_PRODUCAO`, `ADICIONAR_INSUMO`,
`REMOVER_INSUMO`, `ENCERRAR`, `REABRIR`, `CANCELAR`).

**Trava da OP:** toda operação de linha, encerrar, reabrir e cancelar
começa com um `updateMany` condicionado ao status esperado (ex.:
`{ id, filialId, status: "ABERTA" }`, tocando `atualizadoEm`). `count = 0`
→ "A OP não está aberta" (ou a mensagem do status). Isso trava a linha da
OP até o fim da transação, então encerrar e lançar ao mesmo tempo não
deixam linha órfã.

- **`criarOP(sessao, { data, frutaId, responsavel })`** — fruta ativa da
  empresa; número `max + 1` do dia com nova tentativa em P2002 (até 3).
- **`atualizarOP(sessao, id, dados)`** — responsável, processo
  (branqueamento, água, caroço, perda; ≥ 0), observação. Data e fruta só
  sem linhas ativas.
- **`adicionarConsumo(sessao, opId, { loteId, quantidadeKg, motivoLiberacaoVencido? })`**
  — lote da filial, produto FRUTO da mesma fruta (RN-14), recepção não
  cancelada, sem outra linha ativa do mesmo lote, kg > 0. Vencido
  (`validade < data da OP`) → "O lote X venceu em dd/mm/aaaa", salvo
  `producao:liberarVencido` **e** motivo; motivo sem lote vencido é
  descartado. Grava a linha (`custoKg` = do lote) e `CONSUMO_OP` (saldo
  insuficiente → "Saldo insuficiente no lote X").
- **`removerConsumo(sessao, consumoId)`** — `removidoEm` + `ESTORNO_CONSUMO_OP`.
- **`adicionarProducao(sessao, opId, { produtoId, quantidadeKg, embalagens?, localId })`**
  — produto POLPA ativo da mesma fruta, kg > 0, embalagens ≥ 1 se
  informado, local ativo da filial. Cria o lote (origem PRODUCAO, código
  com nova tentativa em P2002), a linha e `PRODUCAO_OP`.
- **`removerProducao(sessao, producaoId)`** — `removidoEm` +
  `ESTORNO_PRODUCAO_OP` pelo saldo do lote (zera). Como a polpa está
  bloqueada, o saldo é a quantidade inteira.
- **`adicionarInsumo` / `removerInsumo`** — insumo ativo da empresa,
  quantidade > 0, `custoUnitario` copiado do cadastro.
- Depois de toda operação de linha: recalcula o custo provisório e grava
  `custoKg` nos lotes de polpa ativos da OP.
- **`encerrarOP(sessao, id, { confirmarVerificar })`** — exige ao menos um
  consumo e uma produção ativos. Se balanço ou branqueamento estiver
  `VERIFICAR` e `confirmarVerificar` não for `true` → erro listando o que
  está a verificar. Grava custos, `custoKg` final nos lotes, `encerradaEm`,
  status ENCERRADA. A auditoria registra os status e a confirmação.
- **`situacaoParaDesfazer(opId)`** → `{ pode: true } | { pode: false, motivo }`:
  OP cancelada; algum lote de polpa da OP com movimento além de
  `PRODUCAO_OP` (venda, ajuste) → "O lote X já teve venda ou ajuste".
- **`reabrirOP(sessao, id, motivo)`** — ENCERRADA, motivo obrigatório,
  `situacaoParaDesfazer`. Limpa custos e `encerradaEm`, grava o motivo,
  status ABERTA.
- **`cancelarOP(sessao, id, motivo)`** — ABERTA ou ENCERRADA, motivo
  obrigatório, `situacaoParaDesfazer`. `ESTORNO_CONSUMO_OP` por consumo
  ativo, `ESTORNO_PRODUCAO_OP` por produção ativa, status CANCELADA.
- **`listarOPs(filialId, filtros)`** — período, fruta, status; cada OP com
  fruto, polpa, rendimento, balanço, branqueamento e custo/kg (gravado se
  encerrada, provisório se aberta).
- **`obterOP(filialId, numero)`** — cabeçalho, linhas ativas com lote,
  produto, local e insumo, resumo calculado e `situacaoParaDesfazer`.
- **`lotesParaConsumo(filialId, frutaId, data)`** — lotes FRUTO da fruta,
  saldo > 0, recepção não cancelada, ordem FEFO, com flag de vencido na
  data.

### Bloqueio da polpa (7b e 7c)

Um filtro único `loteLiberado` (Prisma `where`): origem RECEPCAO com
recepção não cancelada, **ou** origem PRODUCAO com OP ENCERRADA. Aplicado
em:

- `lotesParaVenda` e na validação de `criarPedido` → "O lote X está numa
  OP aberta";
- criação de ajuste de estoque → mesma mensagem;
- tela de estoque: lote de OP aberta mostra a marca "Em produção".

Mover de local (D-15) continua permitido.

### Recepção (7b)

O cancelamento da recepção é recusado se o lote tem consumo ativo numa OP
não cancelada ("O lote foi usado na OP X"). Conferir na implementação se a
regra atual (movimentos além da entrada) já cobre; se cobrir, só ajustar a
mensagem.

### Etiqueta

`DadosEtiqueta` ganha `cnpj` (da filial), `endereco`
(`enderecoEtiqueta`), `texto` (`Produto.textoEtiqueta`) e `copias`. Campos
vazios não aparecem. Lote de polpa com `embalagens` informado: uma página
por embalagem, peso líquido = kg ÷ embalagens (3 casas). Sem embalagens:
uma página com o peso do lote, como hoje. Etiqueta de lote de OP não
encerrada → 409 "Encerre a OP antes de imprimir a etiqueta".

### Configuração e cadastro

- Configuração de produção: campo "Endereço na etiqueta".
- Cadastro de produto: campo "Texto da etiqueta" (multilinha).

## 4. Telas (menu **Produção → Processamento**, `producao:ler`)

### `/producao/processamento`
Lista: nº, data, fruta, responsável, fruto (kg), polpa (kg), rendimento,
balanço, branqueamento, custo/kg, status. Filtros (barra da 7b): período
(padrão mês atual), fruta, status. Exportação CSV, Excel e PDF. Botão
**Nova OP** (`producao:escrever` + filial com alteração): diálogo com data
(hoje), fruta e responsável; ao salvar, vai para o detalhe.

### `/producao/processamento/[numero]`
Página boa no celular (390 px).

- **Topo:** número, data, fruta, responsável, status; resumo ao vivo
  (fruto, polpa, rendimento, balanço kg/%/status, branqueamento, custo
  total e custo/kg, com "provisório" enquanto aberta).
- **Abas:**
  - **Consumo:** lote (lista FEFO com saldo e validade; vencido marcado),
    kg, motivo da liberação (só lote vencido e quem pode liberar). Cada
    linha mostra kg, custo/kg e custo.
  - **Produção:** produto de polpa, kg, embalagens, local. Cada linha
    mostra o código do lote criado, validade e, se encerrada, o link da
    etiqueta.
  - **Insumos:** insumo (com unidade e custo do cadastro), quantidade;
    linha mostra o custo.
  - **Processo:** branqueamento (°C, s; só se a fruta exige), água (L),
    caroço/resíduo (kg), perda (kg), observação. Botão salvar.
- Cada aba: linha "adicionar" e botão remover por linha (confirmação).
  Selects controlados (lição da 7b). Encerrada ou cancelada: só leitura.
- **Ações:**
  - **Encerrar:** confirmação; se houver "Verificar", lista o quê e exige
    marcar "Confirmo".
  - **Reabrir** e **Cancelar:** com motivo; desabilitados com o motivo
    quando `situacaoParaDesfazer` não permite.

### Estoque (7b)
Marca "Em produção" nos lotes de polpa de OP aberta.

### Ajuda
`content/ajuda/passo-a-passo.md` ganha o fluxo da OP.

## 5. Permissões

Nova ação `producao:liberarVencido` (ADMIN, GESTOR). Lançar, encerrar,
reabrir e cancelar OP usam `producao:escrever` (ADMIN, PRODUCAO), como a
recepção.

## 6. Fora da 7e

Rastreabilidade (7f); relatório de processamento e painel (7g); rateio de
custo por qualidade (D-06, backlog); estoque de insumos (D-14); edição de
quantidade de linha (remove e lança de novo); transferência parcial de
lote.

## 7. Testes

Unitários (`op.ts`): rendimento (com e sem fruto); balanço com o exemplo
do doc 3 (200 + 40 − 120 − 105 − 10 = 5 kg ⇒ 2,1% ⇒ OK), acima da
tolerância e sem entrada; branqueamento (OK, abaixo da temperatura, abaixo
do tempo, valor faltando, não se aplica); custo com arredondamento e polpa
zero; número da OP.

Integração (Postgres real):
- Fluxo completo: OP `OP-…-01` e depois `-02`; consumo baixa o fruto
  (`CONSUMO_OP`, `custoKg` do lote); produção cria o lote de polpa com
  código, validade, local e custo provisório; insumo com custo congelado
  (mudar o cadastro depois não altera); encerrar grava os custos e o mesmo
  `custoKg` em todas as polpas.
- Recusas no consumo: fruta diferente; produto POLPA; kg acima do saldo
  (nada gravado); lote repetido; recepção cancelada; outra filial; vencido
  sem permissão; vencido com permissão sem motivo. Aceito com permissão e
  motivo (gravado na linha).
- Recusas na produção: produto FRUTO, fruta diferente, local de outra
  filial.
- Remover linha: estorno no ledger, saldo de volta, `removidoEm`, custo
  provisório recalculado.
- Bloqueio: com OP aberta, polpa fora de `lotesParaVenda`; pedido e ajuste
  recusados; mover de local aceito; etiqueta 409. Depois de encerrar,
  venda aceita.
- Encerrar: recusado sem consumo ou sem produção; com "Verificar",
  recusado sem confirmação e aceito com ela.
- Reabrir: aceito sem saída (custos limpos, polpa bloqueada); recusado
  depois de venda ou ajuste. Cancelar: estorna tudo; recusado depois de
  venda. OP encerrada ou cancelada recusa operações de linha.
- Concorrência: encerrar e adicionar linha em paralelo não deixam linha
  ativa fora do custo gravado; duas OPs simultâneas recebem números
  distintos.
- Permissões: VENDAS e CONSULTA não lançam; PRODUCAO lança mas não libera
  vencido.
- Recepção: cancelar recepção de lote consumido em OP é recusado.

Caracterização: a planilha não tem OP lançada (D-01), então o cenário usa
os exemplos do doc 3 (RN-10, RN-11, RN-13) e confere rendimento, balanço e
custo/kg.

Navegador: OP completa no desktop e a 390 px, polpa bloqueada no pedido,
encerrar com "Verificar", reabrir, cancelar, etiqueta por embalagem,
exportações, perfil PRODUCAO.

## 8. Migrations

Uma migration `fase_7e_processamento`: enum `StatusOrdemProducao`;
`TipoMovimentoEstoque` += `CONSUMO_OP`, `ESTORNO_CONSUMO_OP`,
`PRODUCAO_OP`, `ESTORNO_PRODUCAO_OP`; tabelas `ordens_producao`,
`consumos_op`, `producoes_op`, `insumos_op`; colunas `consumoOpId` e
`producaoOpId` em `movimentos_estoque`; `textoEtiqueta` em `produtos`;
`enderecoEtiqueta` em `configuracoes_producao`. Só cria; nada existente
muda de dado.
