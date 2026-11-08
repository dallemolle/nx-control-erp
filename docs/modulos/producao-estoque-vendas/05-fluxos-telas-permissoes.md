# 5. Fluxos, telas e permissões

## Princípios de interface

- **Lançamento no galpão, pelo celular.** Hoje as fichas de campo são
  passadas para a planilha uma vez por semana. As telas de recepção, OP e
  venda devem funcionar bem num celular (o layout responsivo já existe
  desde a correção do menu em gaveta), para o lançamento acontecer na hora.
- **Formulário curto, o resto calculado.** Os campos digitados são os
  "verdes" da planilha. O que era "cinza" aparece como resumo ao lado:
  líquido, valor, validade e nº de lote previsto.
- **Rasa ou kg.** Para produto com unidade comercial (RN-03), um seletor
  "rasas / kg" na quantidade e no preço.
- **Lote por lista, nunca digitado.** A escolha de lote mostra só lotes com
  saldo, em ordem de validade (FEFO, RN-27), com saldo e dias para vencer
  ao lado.
- **Exportação.** Toda listagem e relatório usa o `ExportarLinks` (CSV,
  Excel e PDF) que já existe.

## Menu

Duas seções novas, além de itens na seção Cadastros:

| Seção | Itens |
|---|---|
| **Produção** | Recepção de fruto · Processamento (OPs) · Estoque · Ajustes de estoque · Rastreabilidade · Painel de produção |
| **Vendas** | Pedidos · Entregas · Relatório de vendas |
| **Cadastros** (existente) | + Produtos · Frutas · Talhões · Locais de armazenamento · Insumos |
| **Administração** (existente) | + Configuração de produção (por filial) |

## Fluxos

### F1 — Receber uma carga de fruto
1. Produção → Recepção → **Nova recepção**.
2. Informa data, produto (fruto), origem (**própria** → talhão;
   **terceiro** → fornecedor), peso bruto (kg ou rasas), descarte, preço
   (para terceiro), qualidade, romaneio/NF.
3. O resumo mostra peso líquido, % de descarte, valor, validade e o nº de
   lote que será gerado.
4. Ao salvar, o sistema numera o lote, dá a entrada no estoque no local de
   recepção e, se for de terceiro com valor, cria a conta a pagar (doc 6).
5. Botão **Imprimir etiqueta** (PDF) do lote recém-criado.

### F2 — Processar fruto em polpa (OP)
1. Produção → Processamento → **Nova OP**: data, fruta, responsável.
2. **Consumo:** adiciona lotes de fruto (só da mesma fruta, com saldo, em
   ordem de validade) e o kg de cada um.
3. **Produção:** adiciona as polpas geradas (produto da mesma fruta, kg,
   nº de embalagens, local). Cada linha cria um lote de polpa com
   validade.
4. **Insumos** (opcional): embalagens, energia, mão de obra, quantidades.
5. **Processo:** branqueamento (°C, s), água (L), caroço/resíduo (kg),
   perda (kg).
6. O resumo, ao vivo, mostra rendimento, balanço de massa (kg, %, OK ou
   Verificar), branqueamento (OK ou Verificar) e custo total e por kg.
7. **Encerrar OP**: grava os custos e o custo/kg nos lotes de polpa. Se o
   balanço ou o branqueamento estiver "Verificar", pede confirmação
   explícita, que fica registrada na auditoria.

### F3 — Vender (in natura ou polpa)
1. Vendas → Pedidos → **Novo pedido**: data, cliente (o canal vem do
   cadastro, editável), forma de pagamento, vencimento se for a prazo.
2. Itens: escolhe o lote (lista FEFO), kg (ou rasas) e preço (sugestão:
   preço de referência do produto). Mostra valor, custo e margem por item.
3. O sistema recusa kg acima do saldo (RN-19) e lote vencido (RN-18,
   salvo exceção com permissão).
4. Ao salvar, o sistema numera o pedido, baixa o estoque e cria o título a
   receber (doc 6). À vista e já pago (Pix/dinheiro): ver D-11.
5. Botões: entrega, recibo/romaneio em PDF.

### F4 — Entregar
Vendas → Entregas: lista de pedidos com entrega pendente ou em rota,
atraso em dias (RN-24). Atualiza status, data realizada e quem recebeu.

### F5 — Ajustar estoque
Produção → Ajustes → **Novo ajuste**: lote, kg (+/−), motivo, observação.
Saída maior que o saldo é recusada. Atalho na tela de estoque: **Baixar
vencidos**, que gera ajuste "Vencido" para os lotes selecionados.

### F6 — Rastrear um lote (recall / ADEPARA)
Produção → Rastreabilidade: busca pelo código do lote.
- **Lote de polpa:** dados, OP (branqueamento, rendimento, balanço), lotes
  de fruto de origem (fornecedor/talhão, data, qualidade) e clientes que
  receberam.
- **Lote de fruto:** dados, origem, OPs que o consumiram, lotes de polpa
  gerados e **todos os clientes** que receberam o fruto ou a polpa
  derivada (RN-28).

Exportação em PDF para entregar à fiscalização.

### F7 — Conferir o dia/semana
Produção → Painel: indicadores do período e alertas (doc 7). Cada alerta
leva à lista filtrada: lotes vencendo, OPs a verificar, entregas
atrasadas.

## Telas (resumo)

| Tela | Rota sugerida | Conteúdo |
|---|---|---|
| Recepções | `/producao/recepcao` | Lista (filtros: período, fruta, origem) + formulário. |
| OPs | `/producao/processamento`, `/producao/processamento/[id]` | Lista com rendimento, balanço e branqueamento; detalhe com as 4 abas (consumo, produção, insumos, processo). |
| Estoque | `/producao/estoque` | Saldo por lote (filtros: produto, local, status) e por produto × local, com ocupação. |
| Ajustes | `/producao/ajustes` | Lista + formulário. |
| Rastreabilidade | `/producao/rastreabilidade?lote=` | Árvore para trás e para frente. |
| Etiqueta | `/producao/lotes/[codigo]/etiqueta` | PDF (Route Handler, `pdf-lib`). |
| Painel de produção | `/producao/painel` | Indicadores e alertas. |
| Pedidos | `/vendas/pedidos`, `/vendas/pedidos/[numero]` | Lista + formulário com itens. |
| Entregas | `/vendas/entregas` | Lista de pendentes/atrasadas + atualização. |
| Relatórios | `/producao/relatorios/*`, `/vendas/relatorios` | Ver doc 7. |

## Permissões (RBAC)

Ações novas em `src/server/auth/permissions.ts`:

| Ação | Cobre |
|---|---|
| `producao:ler` | Ver recepções, OPs, estoque, ajustes, rastreabilidade e painel de produção. |
| `producao:escrever` | Lançar e editar recepção e OP; encerrar OP. |
| `estoque:ajustar` | Lançar ajustes (separado porque mexe em saldo sem venda). |
| `venda:ler` | Ver pedidos, entregas e relatórios de venda. |
| `venda:escrever` | Criar pedidos e atualizar entregas. |
| `venda:cancelar` | Cancelar pedido (estorna estoque e título). |
| `venda:liberarVencido` | Vender lote vencido como exceção (RN-18). |
| `producao:configurar` | Configuração de produção da filial (ADEPARA, alertas, branqueamento). |

Cadastros novos (produto, fruta, talhão, local, insumo) usam o
`cadastro:escrever` / `cadastro:ler` que já existe.

### Perfis (proposta; ver D-09)

Hoje os perfis são Administrador, Financeiro, Tesouraria, Gestor, Auditor e
Consulta, todos pensados para o financeiro. Proposta: **dois perfis
novos**.

| Ação | ADMIN | **PRODUCAO** (novo) | **VENDAS** (novo) | FINANCEIRO | GESTOR | AUDITOR | CONSULTA |
|---|---|---|---|---|---|---|---|
| producao:ler | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| producao:escrever | ✓ | ✓ | | | | | |
| estoque:ajustar | ✓ | ✓ | | | | | |
| venda:ler | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| venda:escrever | ✓ | | ✓ | ✓ | | | |
| venda:cancelar | ✓ | | | ✓ | | | |
| venda:liberarVencido | ✓ | | | | ✓ | | |
| producao:configurar | ✓ | | | | | | |
| cadastro:escrever | ✓ | | | ✓ | | | |

O perfil **VENDAS** cria pedidos, que geram título a receber, mas não tem
`titulo:escrever`. A venda chama a criação do título como parte do próprio
serviço de venda, com a permissão `venda:escrever`, e não exige que o
vendedor opere o financeiro (doc 6).

`podeAlterarFilial` (filial somente leitura) continua valendo para todas
as ações de escrita.
