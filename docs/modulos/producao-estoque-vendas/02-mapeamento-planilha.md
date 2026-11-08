# 2. Mapeamento da planilha

Referência aba por aba. **D** = coluna digitada (cabeçalho verde). **C** =
calculada (cabeçalho cinza, fórmula). Fórmulas reescritas de forma legível;
`linha` = a própria linha. "Busca X em Y" = `INDEX/MATCH` (procura um valor
numa aba e devolve outra coluna da mesma linha). Todas as abas de lançamento
começam na linha 5 (linhas 1–4 são título, instrução e cabeçalho).

Regras de negócio derivadas estão numeradas no [doc 3](./03-regras-de-negocio.md)
e citadas aqui como RN-xx.

---

## Cadastros e parâmetros

### CONFIG

| Parâmetro | Valor atual | Uso |
|---|---|---|
| Nome da empresa | Hortitex | Títulos dos relatórios e etiqueta. |
| Registro ADEPARA nº | (vazio) | Etiqueta do lote. |
| Data de referência | `=HOJE()` | Base de "dias para vencer" e atraso de entrega. Pode ser fixada para conferir o estoque em outra data. |
| Alerta de vencimento – congelados | 30 dias | Lote congelado fica "Vencendo" a ≤ 30 dias. |
| Alerta de vencimento – resfriados e in natura | 1 dia | Idem para resfriado e fruto. |
| Branqueamento – temperatura mínima | 80 °C | Conferência da OP de açaí. |
| Branqueamento – tempo mínimo | 10 s | Idem. |
| Tolerância do balanço de massa | ±3% | Diferença aceitável entre entradas e saídas da OP. |

### CAD_PRODUTOS
Colunas D: Código, Descrição, Categoria (Fruto/Polpa), Fruta (Açaí/Acerola),
Conservação (In natura/Resfriado/Congelado), Validade (dias), Preço ref.
(R$/kg), Armazenamento (texto livre de temperatura). Colunas C `idx fruto`
e `idx polpa` só numeram os produtos de cada categoria para montar as listas
suspensas. Catálogo atual no [doc 1](./01-visao-geral.md#catálogo-de-produtos-cad_produtos).

### CAD_FORNECEDORES
D: Nome, Tipo (**Próprio**/Terceiro), Município, Telefone, CPF/CNPJ, Obs.
A própria fazenda é cadastrada como fornecedor "Próprio".

### CAD_TALHOES
D: Talhão, Cultura (Açaí/Acerola), Área (ha), Ano de plantio, Espaçamento,
Obs. Usado na produtividade (t/ha) e para indicar a origem de fruto próprio.

### CAD_CLIENTES
D: Nome, **Canal**, Município, Endereço de entrega (ou "Retira direto na
propriedade"), Telefone, CPF/CNPJ (opcional), Obs. Existe um cliente
genérico "Clientes diversos" para venda de balcão.

### CAD_LOCAIS
D: Local, Tipo (Câmara fria/Freezer/Refrigerador/Recepção/Outro),
Temperatura, **Capacidade (kg)**, Obs. A capacidade alimenta a ocupação em
`REL_ESTOQUE`.

### CAD_INSUMOS
D: Insumo, Unidade, Custo unitário (R$), Obs. Exemplos: embalagem 1 kg
(un), embalagem 500 g (un), caixa de papelão (un), energia, mão de obra.

### LISTAS (oculta)
Valores das listas suspensas, ou seja, os **enums** do domínio:

| Lista | Valores |
|---|---|
| Fruta | Açaí, Acerola |
| Tipo fornecedor | Próprio, Terceiro |
| Qualidade (recepção) | A, B, C |
| Canal | Batedor / ponto de açaí, Atacado / distribuidor, Supermercado / varejo, Restaurante / lanchonete, Indústria, Consumidor final, Outro |
| Forma de pagamento | Pix, Dinheiro, Transferência, Boleto, Cartão, Prazo |
| Status de pagamento | Pago, A receber |
| Status de entrega | Pendente, Em rota, Entregue, Cancelada |
| Motivo de ajuste | Vencido, Avaria / quebra, Amostra (ADEPARA / laboratório), Inventário (+/−), Consumo interno, Outro |
| Categoria | Fruto, Polpa |
| Conservação | In natura, Resfriado, Congelado |
| Tipo de local | Câmara fria, Freezer, Refrigerador, Recepção, Outro |

As colunas K–O montam por fórmula as listas dinâmicas: códigos de fruto,
códigos de polpa, **lotes ativos** (saldo > 0) e **lotes de fruto ativos**,
que são os nomes definidos `LOTES_ATIVOS` e `LOTES_FRUTO_ATIVOS` usados
como validação nas abas de venda e de consumo da OP.

---

## Lançamentos

### ENTRADA_FRUTO — recepção (uma linha por carga)

| Col | Campo | Tipo | Regra |
|---|---|---|---|
| A | LOTE | C | `Lote manual` se preenchido; senão `<produto>-<AAMMDD da recepção>-<nº da carga desse produto no dia>` (RN-01). |
| B | Data recepção | D | |
| C | Produto (fruto) | D | Lista de códigos de fruto. |
| D | Origem / fornecedor | D | Lista de fornecedores. |
| E | Talhão (se próprio) | D | |
| F | Peso bruto (kg) | D | Na prática digitado como `=14*n` (n rasas de 14 kg, RN-03). |
| G | Descarte na triagem (kg) | D | |
| H | Preço / custo (R$/kg) | D | Ex.: `=60/14`. Para fruto próprio, normalmente 0 (ver doc 8, D-04). |
| I | Qualidade | D | A/B/C. Todas as 16 cargas lançadas são "A". |
| J | Romaneio / NF nº | D | |
| K | Obs. | D | |
| L | Lote manual | D | Congela um nº já impresso/comunicado. |
| M | Tipo origem | C | Busca o Tipo do fornecedor (Próprio/Terceiro). |
| N | Fruta | C | Busca a Fruta do produto. |
| O | Peso líquido (kg) | C | `bruto − descarte` (RN-04). |
| P | % descarte | C | `descarte ÷ bruto`. |
| Q | Valor (R$) | C | `líquido × preço` (RN-05). |
| R | idx | C | Nº sequencial do lote, usado por `ESTOQUE_LOTES`. |

### PROCESSAMENTO — ordem de processamento / OP (uma linha por batelada)

| Col | Campo | Tipo | Regra |
|---|---|---|---|
| A | Nº OP | C | `OP-<AAMMDD>-<nº da OP no dia>`. |
| B | Data | D | |
| C | Fruta | D | Açaí/Acerola. |
| D | Responsável | D | |
| E | Branqueamento (°C) | D | |
| F | Branqueamento (s) | D | |
| G | Água adicionada (L) | D | Tratada como kg no balanço (1 L = 1 kg). |
| H | Caroço / resíduo (kg) | D | |
| I | Perda no processo (kg) | D | |
| J | Obs. | D | |
| K | Fruto consumido (kg) | C | Soma de `PROC_CONSUMO` da OP. |
| L | Polpa produzida (kg) | C | Soma de `PROC_PRODUCAO` da OP. |
| M | Rendimento | C | `polpa ÷ fruto` (RN-10). |
| N | Balanço – diferença (kg) | C | `fruto + água − polpa − caroço − perda` (RN-11). |
| O | Balanço % | C | `diferença ÷ (fruto + água)`. |
| P | Status balanço | C | "OK" se `|%| ≤ tolerância` (3%), senão "Verificar". |
| Q | Branqueamento | C | Só açaí: "OK" se temperatura ≥ 80 °C **e** tempo ≥ 10 s; senão "Verificar". Acerola: "N/A" (RN-12). |
| R | Custo do fruto (R$) | C | Soma do custo dos lotes consumidos. |
| S | Custo insumos (R$) | C | Soma de `PROC_INSUMOS` da OP. |
| T | Custo total (R$) | C | `R + S`. |
| U | Custo (R$/kg polpa) | C | `custo total ÷ polpa produzida` (RN-13). |
| V | idx | C | Sequência das OPs (relatório "últimas 30 OPs"). |
| W | Nº lotes de fruto | C | Quantos lotes de fruto a OP consumiu. |

⚠️ **Defeito:** as colunas K–W não têm fórmula na linha 5, a primeira OP.
A primeira OP lançada sairia sem rendimento, balanço nem custo (doc 8, D-01).

### PROC_CONSUMO — lotes de fruto que entraram na OP

D: Nº OP, Lote de fruto (validação `LOTES_FRUTO_ATIVOS`), Kg consumidos, Obs.
C: data da OP, produto, origem e talhão do lote; **Custo (R$)** = `kg × preço
do lote na recepção`; **Confere fruta** = "OK" se a fruta do lote é a da OP,
senão "Fruta diferente" (RN-14); chaves `OP|n` e `lote|n` usadas na
rastreabilidade.

### PROC_PRODUCAO — polpa produzida (cada linha vira um lote de polpa)

D: Nº OP, Produto (polpa), Quantidade (kg), Nº de embalagens, Local de
armazenamento, Lote manual.
C: **LOTE POLPA** (`<produto>-<AAMMDD da OP>-<nº desse produto na data>`);
Data fabricação (data da OP); **Validade** = `fabricação + validade do
produto` (RN-07); fruta e descrição do produto; **Confere fruta** (polpa da
mesma fruta da OP).

### PROC_INSUMOS — insumos e custos da OP

D: Nº OP, Insumo, Quantidade, Obs. C: Unidade; **Custo total** =
`quantidade × custo unitário do cadastro` (busca o custo **atual**: ver
doc 8, D-05); data da OP. ⚠️ Mesmo defeito da linha 5 (fórmulas começam
na linha 6).

### VENDAS — uma linha por lote vendido

Um pedido com 3 lotes ocupa 3 linhas com o mesmo nº de pedido. Serve para
fruto in natura e polpa.

| Col | Campo | Tipo | Regra |
|---|---|---|---|
| A | Data | D | |
| B | Pedido nº | D | Próximo nº mostrado no PAINEL (`máximo + 1`). |
| C | Cliente | D | |
| D | Lote | D | Validação `LOTES_ATIVOS` (só lotes com saldo). |
| E | Quantidade (kg) | D | Também digitada como `=14*n` para fruto. |
| F | Preço (R$/kg) | D | Ex.: `=60/14`. |
| G | Forma de pagamento | D | |
| H | Status pagamento | D | Pago / A receber. |
| I | Data pagamento | D | |
| J | Obs. | D | Cancelamento: zerar a quantidade e explicar aqui. |
| K–N | Produto, descrição, categoria, fruta | C | Buscados pelo lote. |
| O | Valor (R$) | C | `kg × preço`. |
| P | Canal | C | Canal do cliente (RN-21). |
| Q | Custo (R$/kg) | C | Custo atual do lote em `ESTOQUE_LOTES` (doc 8, D-05). |
| R | Custo total (R$) | C | `kg × custo/kg`. |
| S | Margem bruta (R$) | C | `valor − custo total` (RN-22). |
| T | chave lote | C | `lote|n` (rastreabilidade). |
| U | Alerta | C | "Lote vencido na data" se a data da venda passa da validade; senão "Saldo negativo" se o lote ficou abaixo de zero (RN-20). |
| V | A receber (R$) | C | Valor, se status = "A receber". |

### ENTREGAS — uma linha por pedido

D: Pedido nº, Data prevista, Data realizada, Local/endereço,
Responsável/veículo, Status, Recebido por, Obs.
C: Cliente, kg e valor do pedido (somados de `VENDAS`); **Atraso (dias)** =
`realizada − prevista` se entregue, senão `data de referência − prevista`;
nunca negativo e em branco se cancelada (RN-24).

### AJUSTES — perdas e acertos

D: Data, Lote, Kg (+ entrada / − saída), Motivo, Obs. C: Produto do lote.

---

## Motor: ESTOQUE_LOTES (uma linha por lote, tudo calculado)

Junta os lotes de fruto (de `ENTRADA_FRUTO`) e, em seguida, os de polpa (de
`PROC_PRODUCAO`), numa lista única de até 2.000 lotes.

| Campo | Regra |
|---|---|
| LOTE, categoria, produto, descrição, fruta, conservação | Do lançamento de origem e do cadastro. |
| Data | Recepção (fruto) ou fabricação (polpa). |
| Validade | Fruto: `recepção + validade do produto`. Polpa: validade calculada na produção. |
| Local | Fruto: sempre "Recepção". Polpa: local informado na produção. |
| Origem / OP | Fornecedor (fruto) ou nº da OP (polpa). |
| Entrada (kg) | Peso líquido (fruto) ou kg produzidos (polpa). |
| Processado (kg) | Soma de `PROC_CONSUMO` do lote. |
| Vendido (kg) | Soma de `VENDAS` do lote. |
| Ajustes (kg) | Soma de `AJUSTES` do lote (com sinal). |
| **SALDO (kg)** | `entrada − processado − vendido + ajustes` (RN-15). |
| Dias p/ vencer | `validade − data de referência`. |
| **Status** | Zerado (saldo ≤ 0,001) → Vencido (dias < 0) → Vencendo (dias ≤ alerta da conservação) → OK (RN-16). |
| Custo (R$/kg) | Fruto: preço da recepção. Polpa: custo/kg da OP (RN-13). |
| Valor em estoque | `max(0, saldo) × custo/kg`. |
| Chaves auxiliares | Ordenação por validade (FEFO) e índices de lotes ativos para as listas suspensas. |

---

## Saídas

Resumidas aqui e detalhadas no [doc 7](./07-relatorios-indicadores.md).

| Aba | Conteúdo |
|---|---|
| `PAINEL` | Filtros globais (data inicial/final, ano), próximo nº de pedido e cerca de 30 indicadores em três blocos (recepção/processamento, vendas, estoque/alertas), mais estoque e vendas por produto. |
| `REL_MENSAL` | 12 meses × 22 métricas (recepção própria/terceiros por fruta, processado, polpa, rendimento, OPs, faturamento por tipo, kg, margem, custo/kg, fruto pago a terceiros), além de polpa por produto por mês. |
| `REL_VENDAS` | Top 10 clientes, vendas por cliente, por produto (preço e custo médio, margem), por canal e por forma de pagamento, e recebíveis. |
| `REL_ORIGEM` | Fruto por fornecedor (kg por fruta, valor, preço médio, descarte, nº de cargas), top 10 origens, produtividade dos talhões (t/ha no ano) e preço médio pago a terceiros por mês. |
| `REL_PROCESSAMENTO` | Resumo por fruta (OPs, kg, rendimento médio/mín./máx., custo/kg), balanço de massa, custo do processamento e as últimas 30 OPs. |
| `REL_ESTOQUE` | Saldo por produto × local, capacidade e ocupação, estoque por status de validade e lista dos próximos a vencer (ordem de validade). |
| `RASTREABILIDADE` | Para um lote: dados, OP e branqueamento, lotes de fruto usados (polpa) ou OPs/lotes de polpa gerados (fruto), clientes que receberam. |
| `ETIQUETA` | Etiqueta pronta para impressão (4 por folha): empresa, produto, lote, fabricação, validade, conservação, peso líquido (em branco), registro ADEPARA. |

### Limites fixos da planilha (somem no sistema)

- 1.000 linhas por aba de lançamento (2.000 em vendas) e 2.000 lotes.
- Rastreabilidade: até 3 lotes de polpa por OP, cerca de 17 lotes de fruto
  por OP e cerca de 40 vendas por lote.
- Recall indireto ausente: de um lote de **fruto** ela não chega aos
  clientes que compraram a **polpa** feita com ele.
- Relatórios com "Açaí" e "Acerola" fixos nas fórmulas: uma terceira fruta
  exigiria refazer os relatórios.
