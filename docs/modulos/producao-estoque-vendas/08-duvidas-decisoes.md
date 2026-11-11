# 8. Dúvidas e decisões

Cada item tem uma **recomendação**. Os marcados **🔴 Bloqueia** precisam de
resposta antes do sub-projeto indicado. Os demais seguem a recomendação, a
menos que o usuário decida diferente. Respostas devem ser registradas aqui
(coluna "Decisão"), com data.

## Defeitos encontrados na planilha

Afetam a planilha **hoje**, enquanto o sistema não substitui.

| # | Defeito | Efeito | O que fazer na planilha |
|---|---|---|---|
| D-01 | `PROCESSAMENTO` K–W e `PROC_INSUMOS` E–G **sem fórmula na linha 5** (as fórmulas começam na linha 6). | A primeira OP e o primeiro insumo lançados ficam sem fruto consumido, polpa, rendimento, balanço, custo e unidade. Sem efeito por enquanto, porque não há OP lançada. | Copiar as fórmulas da linha 6 para a linha 5 nas duas abas antes de lançar a primeira OP. |
| D-01b | Margem bruta de outubro aparece como **93%**. | O fruto próprio entra com custo zero, então a margem do in natura fica inflada (ver D-04). | Nenhuma correção de fórmula. É uma decisão de custo. |

## Decisões de negócio

| # | Tema | Pergunta | Recomendação | Bloqueia | Decisão |
|---|---|---|---|---|---|
| D-02 | Cliente sem documento | `Cliente.cnpjCpf` é obrigatório no sistema, mas a planilha tem consumidor final e "Clientes diversos" sem CPF/CNPJ. Tornar opcional? | **Sim, opcional**, mantendo a unicidade quando preenchido. Verificar o impacto na API v1 (resolve contraparte por documento) e na importação CSV. | 🔴 7c Vendas | **Sim, opcional** (2026-11-08). |
| D-03 | Lote vencido | A planilha só alerta "Lote vencido na data". Bloquear? | **Bloquear**, com exceção registrada para quem tem `venda:liberarVencido` (ex.: venda para descarte/ração com desconto). | 7c | **Bloquear, com exceção** por item e com motivo obrigatório (2026-11-10). |
| D-04 | Custo do fruto próprio | Fruto colhido nos talhões entra com custo zero, o que infla margem e custo da polpa. | **Custo-padrão por fruta** (R$/kg), configurável e gravado na recepção própria. Mais tarde, custo real agrícola (despesas da fazenda por centro de custo ÷ kg colhido) pode substituí-lo. Alternativa: manter zero e mostrar "margem sobre fruto comprado". | 🔴 7b Recepção | **Custo-padrão por fruta** (2026-11-08). |
| D-05 | Custo histórico | A planilha recalcula o passado: insumo e custo do lote buscam o valor **atual** do cadastro, então mudar o preço de uma embalagem muda o custo de OPs e vendas antigas. | **Congelar o custo** no lançamento (insumo na OP, custo/kg no item de venda). Já refletido em RN-13 e RN-22. Confirmar. | — | **Congelar:** custo/kg no item de venda (7c) e custo do insumo no lançamento da linha da OP (2026-11-10, spec da 7e). |
| D-06 | Rateio do custo da OP | Uma OP de açaí gera grosso, médio e fino com o **mesmo R$/kg**, mas o grosso usa mais fruto por kg e vale mais. | **v1: igual à planilha** (mesmo R$/kg). Registrar no backlog um rateio por fator de equivalência (ex.: proporcional ao preço de referência) para quando a margem por qualidade importar. | — | **Mesmo R$/kg** na v1; rateio no backlog (2026-11-10, spec da 7e). |
| D-07 | Polpa antes de encerrar a OP | O custo/kg só fica definido ao encerrar a OP. A polpa pode ser vendida antes? | **Não:** lotes de polpa só ficam disponíveis para venda e ajuste depois de a OP ser **encerrada**. OP é uma batelada do dia, e encerrar no mesmo dia é o natural (a polpa resfriada dura 2 dias). | 7e | **Não:** o lote de polpa nasce ao lançar a produção, mas fica bloqueado para venda e ajuste até a OP ser encerrada; OP encerrada pode ser reaberta se a polpa não saiu (2026-11-10). |
| D-08 | Branqueamento | Só açaí exige (fórmula fixa). Outras frutas futuras? | **Flag `exigeBranqueamento` no cadastro da fruta** (açaí = sim). | — | **Flag na fruta** (feito na 7a). |
| D-09 | Perfis novos | Criar perfis **PRODUCAO** (galpão: recepção, OP, ajuste) e **VENDAS** (pedido, entrega)? Matriz no doc 5. | **Sim, os dois.** Alternativa mínima: só PRODUCAO, e vendas fica com FINANCEIRO. | 🔴 7a | **Sim, PRODUCAO e VENDAS** (2026-11-08). |
| D-10 | Etiqueta | Os dizeres obrigatórios da etiqueta (ingredientes, peso, CNPJ, endereço, "manter congelado a −18 °C" etc.) não estão completos na planilha. | Levantar com a ADEPARA/APPCC a lista exigida antes do sub-projeto 7e. A v1 replica a planilha e deixa campos configuráveis. | 7e | **Configurável** até a lista chegar: CNPJ da filial, endereço na configuração de produção, texto livre por produto; uma etiqueta por embalagem (2026-11-10). |
| D-11 | Venda à vista paga | Criar título **e** baixa aprovada automaticamente (Pix/transferência/cartão, na conta padrão)? Dinheiro depende da conta Caixa (Fase B fiscal, ainda não implementada). | **Sim para Pix/transferência/cartão.** Implementar a **conta Caixa (Fase B)** antes ou junto de 7c, para cobrir dinheiro. Até lá, venda em dinheiro nasce em aberto. | 🔴 7c | **Sim**, e a conta Caixa (Fase B) é feita antes de 7c (2026-11-08). |
| D-12 | Venda a prazo | Uma parcela só ou parcelamento? | **v1: uma parcela** com vencimento informado. Parcelamento depois, se pedido. | — | **Uma parcela** (2026-11-10, spec da 7c). |
| D-13 | Pagamento ao produtor | Qual o prazo usual de pagamento da compra de fruto de terceiro (na hora, semanal, quinzenal)? | Prazo padrão configurável por filial (`prazoPagamentoProdutorDias`), com valor inicial 0 (à vista). | 7b | |
| D-14 | Estoque de insumos | Controlar estoque de embalagens/caixas (entrada por compra, saída por OP)? | **Fora da v1.** Insumo entra só como custo da OP. | — | |
| D-15 | Transferência entre locais | A planilha não tem: o lote fica para sempre no local da produção. Na prática, polpa muda de câmara? | **v1: permitir mudar o local do lote** (auditado). Transferência parcial (parte do lote em outro local) só se houver necessidade real. | — | |
| D-16 | Entrega | Todo pedido tem entrega? | **Não:** cliente com "retira na propriedade" não gera entrega. Os demais geram entrega pendente automaticamente. | 7c | **Depende do pedido:** campo "Retira na propriedade", com padrão do cliente (2026-11-10). |
| D-22 | Cancelar venda já paga | O financeiro não tem como desfazer uma baixa aprovada. O que o cancelamento de uma venda à vista faz? | **Desfazer o recebimento** criado pela própria venda (baixa e lançamento), recusando se o lançamento já foi conciliado com extrato ou se há outra baixa. | 7c | **Desfazer o recebimento** (2026-11-10). |
| D-23 | Corrigir pedido | Editar itens ou cancelar e refazer? | **Cancelar e refazer**, como na recepção (7b). Observação e entrega editáveis. | 7c | **Cancelar e refazer** (2026-11-10). |
| D-17 | Onde roda | Em qual empresa e filial do sistema a Hortitex vai operar (a "Empresa Demonstração" é de testes)? A agroindústria e a fazenda são a mesma filial? | Cadastrar a empresa real e **uma filial** para a agroindústria. Se a fazenda tiver CNPJ/IE próprio, uma segunda filial depois. | 🔴 7d Importação | **Depois do desenvolvimento:** a filial da Hortitex será cadastrada quando os módulos estiverem prontos, na implantação (2026-11-10). |
| D-18 | Numeração | Continuar a numeração da planilha (próximo pedido = 33; lotes `FA-26…`) ou recomeçar? | **Continuar.** Importar os lotes com o código atual (`codigoManual`) e iniciar o contador de pedidos após o último importado. | 7d | **Recomeçar:** pedidos a partir do nº 1 e lotes no padrão do sistema; nada a mudar no código (2026-11-10). |
| D-19 | Qualidade A/B/C | A qualidade da recepção influencia preço ou destino (in natura × polpa)? Hoje é só informativa. | Manter informativa na v1. | — | |
| D-20 | Água em litros | O balanço trata 1 L de água = 1 kg. | Manter. | — | |
| D-21 | Vendas antigas no financeiro | As 29 vendas da planilha (set–out/2026) já foram lançadas no financeiro do sistema (contas a receber, lançamentos bancários)? | Se **não**: importar com título já baixado. Se **sim**: importar só como histórico de venda e estoque, **sem gerar título**, para não duplicar receita. | 🔴 7d Importação | **Sem importação de dados antigos** por ora; se for preciso, resolver depois do desenvolvimento. A 7d fica adiada (2026-11-10). |

## Decisões técnicas já tomadas neste desenho

Revisar se algo não fizer sentido. O desenvolvimento parte delas.

1. **Produto, fruta e insumo por empresa; estoque, lote, OP e pedido por
   filial** (doc 4).
2. **Saldo por ledger** (`MovimentoEstoque`) com cache em `Lote.saldoKg`
   atualizado atomicamente; saldo negativo é impossível (RN-19).
3. **Número de lote, OP e pedido imutável**, gerado na gravação (RN-01,
   RN-02).
4. **Venda e compra de fruto viram títulos** do financeiro, criados na
   mesma transação (doc 6).
5. **Rastreabilidade completa para frente**, de fruto até os clientes da
   polpa (RN-28).
6. **Unidade comercial "rasa"** no produto, com conversão para kg (RN-03).
