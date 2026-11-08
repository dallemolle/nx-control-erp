# 1. Visão geral

## O negócio

Agroindústria de **açaí e acerola** no oeste do Pará. Recebe fruto de
produção própria (talhões da fazenda) e de produtores terceiros, vende parte
do fruto **in natura** e processa o resto em **polpa** — congelada (validade
de 1 ano) ou resfriada/fresca (validade de 2 dias). A polpa de açaí sai em
três qualidades (grosso/especial, médio/regular, fino/popular).

Duas exigências moldam o controle:

1. **Rastreabilidade sanitária (ADEPARA).** Todo lote de polpa precisa
   apontar de quais lotes de fruto veio, de qual OP, com qual
   branqueamento, e para quais clientes foi vendido — para recolhimento
   (recall) e fiscalização. A etiqueta do lote leva o nº de registro
   ADEPARA.
2. **Validade curta.** Fruto e polpa resfriada vencem em 1–2 dias. O
   estoque precisa avisar o que está vencendo e impedir (ou ao menos
   alertar) venda de lote vencido.

## Fluxo físico

```
 Colheita (talhão próprio)  ─┐
                             ├─► RECEPÇÃO ──► lote de FRUTO ──┬─► VENDA in natura ──► ENTREGA
 Compra de produtor terceiro ┘   (pesagem,                   │
                                  triagem)                   └─► PROCESSAMENTO (OP)
                                                                   │  consome lotes de fruto
                                                                   │  + água, insumos (embalagem,
                                                                   │    energia, mão de obra)
                                                                   │  − caroço/resíduo, perda
                                                                   ▼
                                                             lotes de POLPA (por produto,
                                                             local de armazenamento, validade)
                                                                   │
                                                                   └─► VENDA por lote ──► ENTREGA
 Em qualquer ponto: AJUSTE (vencido, avaria, amostra ADEPARA, consumo interno, inventário)
```

## Como a planilha representa isso

A planilha tem 26 abas em quatro grupos:

| Grupo | Abas | Papel |
|---|---|---|
| **Cadastros** | `CAD_PRODUTOS`, `CAD_FORNECEDORES`, `CAD_TALHOES`, `CAD_CLIENTES`, `CAD_LOCAIS`, `CAD_INSUMOS`, `CONFIG`, `LISTAS` (oculta) | Catálogo, parceiros, locais, custos de referência, parâmetros e listas suspensas. |
| **Lançamentos** (cabeçalho verde = digitar) | `ENTRADA_FRUTO`, `PROCESSAMENTO`, `PROC_CONSUMO`, `PROC_PRODUCAO`, `PROC_INSUMOS`, `VENDAS`, `ENTREGAS`, `AJUSTES` | Uma linha por evento. Colunas cinza são fórmulas. |
| **Motor** | `ESTOQUE_LOTES` | Uma linha por lote (fruto + polpa), montada por fórmula; calcula saldo, validade, status e custo. |
| **Saídas** | `PAINEL`, `REL_MENSAL`, `REL_VENDAS`, `REL_ORIGEM`, `REL_PROCESSAMENTO`, `REL_ESTOQUE`, `RASTREABILIDADE`, `ETIQUETA`, `INICIO` | Indicadores, relatórios com filtro de período, consulta de lote e etiqueta para impressão. |

Rotina semanal descrita na própria planilha (aba `INICIO`), a partir das
fichas de campo: recepção → OP → consumo → produção → insumos → vendas →
entregas/ajustes → conferir o PAINEL.

### Formato dos códigos

| Código | Formato | Exemplo | Regra |
|---|---|---|---|
| Lote de fruto | `<produto>-<AAMMDD>-<NN>` | `FA-260927-01` | Fruto de Açaí recebido em 27/09/2026, 1ª carga desse produto no dia. |
| Lote de polpa | `<produto>-<AAMMDD>-<NN>` | `AMC-260927-02` | Açaí Médio Congelado fabricado em 27/09/2026, 2º lote desse produto no dia. |
| OP | `OP-<AAMMDD>-<NN>` | `OP-260927-01` | 1ª OP do dia. |
| Pedido | número sequencial | `33` | Próximo = maior número já usado + 1. |

O `<NN>` é calculado **pela posição da linha** (`COUNTIFS` até a linha
atual). Por isso a planilha proíbe ordenar ou apagar linhas e oferece a
coluna "Lote manual" para congelar números já impressos. No sistema o
número é gerado uma vez, na gravação, e nunca muda (RN-01).

## O que já foi usado na planilha (até 02/11/2026)

| Aba | Linhas | Observação |
|---|---|---|
| `ENTRADA_FRUTO` | 16 | 10/09 a 26/10/2026. Pesos digitados como `=14*4` (rasas de 14 kg). |
| `VENDAS` | 29 | 10/09 a 27/10/2026. Só fruto in natura. Todas "Pago", 25 Pix e 4 dinheiro. |
| `PROCESSAMENTO`, `PROC_*` | 0 | Processamento em polpa ainda não começou na planilha. |
| `ENTREGAS`, `AJUSTES` | 0 | — |

Isso orienta a ordem de entrega (doc 9): **recepção + estoque + venda in
natura** primeiro, porque é o que já roda hoje; processamento depois.

## Catálogo de produtos (CAD_PRODUTOS)

| Código | Descrição | Categoria | Fruta | Conservação | Validade | Armazenamento |
|---|---|---|---|---|---|---|
| FA | Fruto de açaí | Fruto | Açaí | In natura | 1 dia | Sombra / ventilado |
| FC | Fruto de acerola | Fruto | Acerola | In natura | 2 dias | Sombra / refrigerado |
| AGC | Polpa de açaí grosso/especial – congelada | Polpa | Açaí | Congelado | 365 dias | −18 °C |
| AMC | Polpa de açaí médio/regular – congelada | Polpa | Açaí | Congelado | 365 dias | −18 °C |
| APC | Polpa de açaí fino/popular – congelada | Polpa | Açaí | Congelado | 365 dias | −18 °C |
| AGR | Açaí grosso/especial – resfriado (fresco) | Polpa | Açaí | Resfriado | 2 dias | 0 a 5 °C |
| AMR | Açaí médio/regular – resfriado (fresco) | Polpa | Açaí | Resfriado | 2 dias | 0 a 5 °C |
| APR | Açaí fino/popular – resfriado (fresco) | Polpa | Açaí | Resfriado | 2 dias | 0 a 5 °C |
| ACC | Polpa de acerola – congelada | Polpa | Acerola | Congelado | 365 dias | −18 °C |

Cada produto também tem um preço de referência (R$/kg), usado como sugestão
na venda. O do fruto de açaí é `=60/14`, ou seja, **R$ 60 por rasa de
14 kg**. A unidade "rasa" é uma convenção do negócio que a planilha não
modela; o sistema deve modelar (RN-03).
