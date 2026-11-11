# 3. Regras de negócio

Cada regra vem de uma fórmula da planilha (origem citada) e diz o que o
sistema deve fazer. Onde o sistema **muda** o comportamento da planilha, a
regra marca **Mudança** e o motivo. Os exemplos usam números ilustrativos.

Convenções: quantidades em **kg** com 3 casas decimais; valores em R$ com 2
casas; datas de calendário em UTC, como no resto do sistema.

---

## Identificação

**RN-01 — Número de lote.** *(ENTRADA_FRUTO!A, PROC_PRODUCAO!A)*
`<código do produto>-<AAMMDD>-<NN>`, em que a data é a da recepção (fruto)
ou da fabricação (polpa) e `NN` é a sequência daquele produto naquela data,
com 2 dígitos. Ex.: a 2ª carga de fruto de açaí de 27/09/2026 é
`FA-260927-02`.
**Mudança:** a planilha recalcula o `NN` pela posição da linha, então ele
muda se alguém ordenar ou apagar linhas. No sistema o número é **gerado uma
vez, na gravação, e nunca muda**: corrigir a data ou o produto de um lote já
numerado não renumera. O número é único por filial. O campo "lote manual"
continua existindo, para lotes já impressos ou comunicados à ADEPARA antes
da migração, e também precisa ser único.

**RN-02 — Número de OP e de pedido.** *(PROCESSAMENTO!A, PAINEL!F4)*
OP: `OP-<AAMMDD>-<NN>` (sequência no dia). Pedido: inteiro sequencial
(`maior número + 1`). **Mudança:** os dois são gerados pelo sistema, de
forma atômica (dois usuários ao mesmo tempo não recebem o mesmo número),
por filial.

## Recepção de fruto

**RN-03 — Rasa.** *(ENTRADA_FRUTO!F e VENDAS!E digitados como `=14*n`;
preços como `=60/14`)* O negócio compra e vende fruto em **rasas** (cesto
de ~14 kg). O sistema guarda tudo em kg, mas o produto pode ter uma
**unidade comercial** com fator de conversão (ex.: rasa = 14 kg). A tela
aceita a quantidade em rasas e o preço por rasa, e grava kg e R$/kg. Ex.:
4 rasas a R$ 60/rasa ⇒ 56 kg a R$ 4,2857/kg ⇒ R$ 240,00.

**RN-04 — Peso líquido.** *(ENTRADA_FRUTO!O, P)*
`líquido = bruto − descarte na triagem`; `% descarte = descarte ÷ bruto`.
O descarte não pode ser maior que o bruto. **O lote nasce com o peso
líquido.** Ex.: 56 kg brutos, 3 kg de descarte ⇒ 53 kg (5,4%).

**RN-05 — Valor da recepção.** *(ENTRADA_FRUTO!Q)*
`valor = líquido × preço/kg`. O preço da recepção é o **custo/kg do lote de
fruto**. Recepção de terceiro com valor > 0 gera conta a pagar (doc 6).

**RN-06 — Origem.** *(ENTRADA_FRUTO!D, E, M)*
Toda carga tem origem **própria** (talhão da fazenda) ou de **terceiro**
(fornecedor). **Mudança:** a planilha cadastra a própria fazenda como um
"fornecedor Próprio". No sistema, a origem própria aponta para o
**talhão** e a de terceiro para o **fornecedor** (cadastro que já existe).
O tipo deixa de ser texto copiado e passa a ser derivado.

**RN-07 — Validade.** *(ESTOQUE_LOTES!J, PROC_PRODUCAO!I)*
`validade = data do lote + dias de validade do produto`. Fruto conta da
recepção; polpa, da fabricação (data da OP). Ex.: fruto de açaí recebido em
27/09 com validade de 1 dia vence em 28/09. **Mudança:** a validade é
gravada no lote quando ele é criado. Mudar a validade do produto no
cadastro não altera lotes existentes.

**RN-08 — Local do fruto.** *(ESTOQUE_LOTES!K)* Lote de fruto nasce no
local de recepção da filial. Lote de polpa nasce no local informado na
produção.

## Processamento (OP)

**RN-09 — Consumo de fruto.** *(PROC_CONSUMO; validação
`LOTES_FRUTO_ATIVOS`)* Uma OP consome um ou mais lotes de fruto, próprios
ou de terceiros. Só lotes de fruto com saldo podem ser escolhidos, e o kg
consumido não pode passar do saldo do lote (RN-19). O custo do consumo é
`kg × custo/kg do lote`.

**RN-10 — Rendimento.** *(PROCESSAMENTO!M)*
`rendimento = polpa produzida ÷ fruto consumido`. Ex.: 120 kg de polpa
de 200 kg de fruto ⇒ 0,60.

**RN-11 — Balanço de massa.** *(PROCESSAMENTO!N, O, P)*
`diferença = fruto + água − polpa − caroço/resíduo − perda` (1 L de água =
1 kg); `% = diferença ÷ (fruto + água)`; status "OK" se `|%| ≤ tolerância`
(padrão 3%), senão "Verificar". Ex.: 200 + 40 − 120 − 105 − 10 = 5 kg ⇒
2,1% ⇒ OK.

**RN-12 — Branqueamento.** *(PROCESSAMENTO!Q)*
Só para açaí: "OK" se temperatura ≥ mínimo (80 °C) **e** tempo ≥ mínimo
(10 s), senão "Verificar". Outras frutas: "Não se aplica". Os mínimos são
configuráveis, e a regra de "qual fruta exige branqueamento" fica no
cadastro da fruta, não fixa em código (D-08).

**RN-13 — Custo da OP e da polpa.** *(PROCESSAMENTO!R–U, ESTOQUE_LOTES!T)*
`custo total = custo do fruto consumido + custo dos insumos`;
`custo/kg da polpa = custo total ÷ polpa produzida`. **Todos os lotes de
polpa da OP recebem o mesmo custo/kg**, seja grosso, médio ou fino (D-06).
**Mudança:** o custo é calculado e gravado quando a OP é encerrada, e o
custo dos insumos usa o preço do insumo **naquele momento** (a planilha
busca o preço atual do cadastro e reescreve o passado: D-05).

**RN-14 — Fruta coerente.** *(PROC_CONSUMO!J, PROC_PRODUCAO!N)*
Os lotes consumidos e as polpas produzidas precisam ser da mesma fruta da
OP. **Mudança:** a planilha só mostra "Fruta diferente"; o sistema
**bloqueia**.

## Estoque

**RN-15 — Saldo do lote.** *(ESTOQUE_LOTES!Q)*
`saldo = entrada − consumido em OP − vendido ± ajustes`. **Mudança:** o
sistema registra cada movimento (entrada, consumo, venda, ajuste) e o saldo
é a soma deles. Nada é "recalculado por fórmula" sobre dados que podem ter
sido editados.

**RN-16 — Status de validade.** *(ESTOQUE_LOTES!R, S)*
`dias = validade − hoje`. Status, em ordem: **Zerado** (saldo ≤ 0) →
**Vencido** (dias < 0) → **Vencendo** (dias ≤ alerta: 30 para congelado,
1 para resfriado e in natura) → **OK**. O status é calculado na consulta,
não gravado. A data de referência é hoje, com opção de consultar em outra
data (substitui `CONFIG!B6`).

**RN-17 — Valor em estoque.** *(ESTOQUE_LOTES!U)*
`max(0, saldo) × custo/kg do lote`.

**RN-18 — Venda de lote vencido.** *(VENDAS!U, "Lote vencido na data")*
A planilha permite e só alerta. **Proposta:** bloquear venda de lote
vencido na data da venda, com exceção registrada para quem tiver
permissão (D-03).

**RN-19 — Saldo nunca negativo.** *(VENDAS!U, "Saldo negativo")*
**Mudança:** a planilha permite e só alerta. O sistema **recusa** consumo,
venda ou ajuste negativo que deixe o lote abaixo de zero. A checagem e a
gravação acontecem na mesma transação, para que dois usuários não vendam
o mesmo saldo.

**RN-25 — Ajuste.** *(AJUSTES)* Positivo = entrada, negativo = saída.
Motivos: vencido, avaria/quebra, amostra (ADEPARA/laboratório), inventário
(±), consumo interno, outro. Ajuste é auditado com o motivo.

**RN-27 — Ordem de saída (FEFO).** *(REL_ESTOQUE "próximos a vencer",
ESTOQUE_LOTES!V)* Listas de lotes para venda e consumo vêm ordenadas por
validade, a que vence primeiro no topo.

## Vendas e entregas

**RN-20 — Alertas da venda.** Ver RN-18 e RN-19. Com as duas regras
bloqueando, a coluna "Alerta" da planilha deixa de ser necessária.

**RN-21 — Canal.** *(VENDAS!P)* O canal da venda vem do cadastro do
cliente. **Mudança:** é gravado na venda (mudar o canal do cliente depois
não reescreve vendas antigas) e pode ser alterado no pedido.

**RN-22 — Valor, custo e margem.** *(VENDAS!O, Q, R, S)*
`valor = kg × preço/kg`; `custo = kg × custo/kg do lote`;
`margem = valor − custo`. **Mudança:** o custo/kg é gravado no item no
momento da venda.

**RN-23 — Pedido.** *(VENDAS: várias linhas com o mesmo nº)* Um pedido tem
cabeçalho (data, cliente, canal, forma de pagamento) e itens (lote, kg,
preço). **Cancelamento:** a planilha manda zerar a quantidade. O sistema
**cancela o pedido**: devolve o saldo aos lotes, cancela o título a
receber e registra o motivo na auditoria.

**RN-24 — Atraso de entrega.** *(ENTREGAS!L)*
Entregue: `realizada − prevista`. Não entregue: `hoje − prevista`. Nunca
negativo; não se aplica a entrega cancelada.

**RN-26 — Status de pagamento.** *(VENDAS!H, V)* **Mudança:** o sistema
não guarda "Pago/A receber" na venda; ele vem das parcelas do **título a
receber** gerado (doc 6). "A receber" = saldo em aberto das parcelas.

## Rastreabilidade e etiqueta

**RN-28 — Rastreabilidade.** *(RASTREABILIDADE)*
- **Para trás**, a partir de um lote de polpa: OP (data, responsável,
  branqueamento, rendimento, balanço) e os lotes de fruto consumidos, com
  origem, talhão, data e qualidade.
- **Para frente**, a partir de um lote de fruto: OPs que o usaram, lotes de
  polpa gerados por elas e **todos os clientes que receberam esses lotes**.

**Mudança:** a planilha não chega do lote de fruto aos clientes da polpa.
No recall, essa é justamente a pergunta "quem comprou algo feito com este
fruto?". Também não há limite de quantidade.

**Destino do lote:** a consulta também mostra para onde foi cada kg
(vendido, consumido em OP, ajustes por motivo, saldo), pelos movimentos de
estoque. **Lista conservadora (D-22):** para um fruto, entram todos os
clientes de qualquer polpa das OPs que o usaram, sem ratear kg.

**RN-29 — Etiqueta.** *(ETIQUETA)* Nome da empresa, descrição do produto,
lote, data de fabricação, validade, conservação/armazenamento, campo de
peso líquido e nº do registro ADEPARA. Gerada em PDF (já existe `gerarPdf`).
Os dizeres obrigatórios precisam ser conferidos com a ADEPARA (D-10).

## Indicadores

**RN-30 — Produtividade do talhão.** *(REL_ORIGEM!Q)*
`t/ha no ano = kg líquidos recebidos do talhão no ano ÷ 1000 ÷ área (ha)`.

**RN-31 — Período.** Indicadores por período usam a data do evento:
recepção, OP, venda.

**RN-32 — Pedidos e ticket médio.** *(PAINEL!F17, F18)*
`nº de pedidos` = pedidos distintos no período;
`ticket médio = faturamento ÷ nº de pedidos`;
`preço médio = faturamento ÷ kg vendidos`.

**RN-33 — Participação de terceiros.** *(PAINEL!C10)*
`% terceiros = kg líquidos de terceiros ÷ kg líquidos recebidos`, por fruta.
