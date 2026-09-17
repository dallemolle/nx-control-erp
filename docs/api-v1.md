# API REST v1 — guia de uso

API programática para automatizar lançamentos financeiros (contas a pagar/receber, movimentação bancária) sem passar pela tela do navegador — pensada para um agente de IA ou script externo.

Ver também: `docs/superpowers/specs/2026-09-15-api-rest-automacao-design.md` (desenho original) e `docs/backlog.md` (limitações conhecidas, ex.: sem idempotência).

## 1. Gerar uma chave de API

1. Logue na aplicação com um usuário **ADMINISTRADOR**.
2. Vá em **Administração → Usuários**.
3. Na linha do usuário que vai "ser" o agente (pode ser um usuário dedicado, ex. "Agente IA", ou um usuário existente), clique em **Chaves de API**.
4. Em "Nova chave", dê um nome (ex.: `Agente IA - lançamentos`) e clique em **Gerar**.
5. **Copie a chave agora** — ela é mostrada só essa vez (formato `sk_...`). Depois disso só o prefixo fica visível.

A chave herda o perfil e os vínculos de empresa/filial do usuário escolhido — se ele só tem acesso a uma filial, a chave só funciona ali.

## 2. Autenticação — headers obrigatórios em toda chamada

```
Authorization: Bearer <chave>
X-Filial-CnpjCpf: <CNPJ ou CPF da filial>
```

A empresa é derivada automaticamente da filial (cada filial pertence a uma única empresa) — por isso um único header basta, não precisa informar o ID da empresa separadamente. Pode enviar o CNPJ/CPF com ou sem pontuação (`12.345.678/0001-90` ou `12345678000190`), a API ignora formatação.

| Falta / erro | Status |
|---|---|
| `Authorization` ausente ou mal formado | 401 |
| Chave inválida, revogada, ou usuário inativo | 401 |
| `X-Filial-CnpjCpf` ausente | 400 |
| CNPJ/CPF não corresponde a nenhuma filial, ou usuário sem vínculo com ela | 403 |

**Como achar `X-Filial-CnpjCpf`:** é o mesmo CNPJ/CPF cadastrado na tela **Filiais**. Se não souber de cabeça, posso consultar pra você a qualquer momento. Exemplo real da sua base de dev (filial da empresa demo "Fazenda Modelo Agronegócio Ltda"):

```
X-Filial-CnpjCpf: 12.345.678/0001-90
```

## 3. Base URL

```
http://localhost:3000/api/v1
```
(troque a porta/domínio pelo ambiente que estiver rodando)

## 4. Formato de erro (todas as rotas)

```json
{ "erro": "mensagem legível", "campos": ["nomeDoCampo"] }
```
`campos` só aparece em erros `422` e lista os campos do **corpo que você enviou** que falharam.

| Situação | Status |
|---|---|
| Corpo não é JSON válido | 422 |
| Campo obrigatório faltando / identificador (CNPJ, código, nome) não encontrado | 422 |
| Perfil sem permissão pra ação | 403 |
| Recurso referenciado não existe (ex.: `parcelaId`) | 404 |
| Erro inesperado | 500 |

## 5. Regra geral: identificadores por CNPJ/código/nome, não por UUID interno

Em vez de IDs internos, os campos de fornecedor/cliente/categoria/etc. usam o que você já tem: **CNPJ/CPF** (fornecedor/cliente), **código** (centro de custo, centro de lucro, projeto — o mesmo código que aparece no cadastro), **nome** (categoria financeira, safra — comparação sem diferenciar maiúsc./minúsc.), **agência + conta** (conta bancária). Se não encontrar, a API devolve erro claro em vez de criar o cadastro sozinha. A única exceção é `parcelaId` na baixa (você pega esse ID chamando `GET /titulos` antes).

---

## 6. Rotas de escrita

### `POST /titulos` — criar conta a pagar/receber
Permissão: `titulo:escrever`.

```json
{
  "tipo": "PAGAR",
  "cnpjCpf": "11.222.333/0001-44",
  "documento": "NF-20456",
  "dataEmissao": "2026-09-10",
  "dataCompetencia": "2026-09-10",
  "categoriaFinanceira": "Insumos Agrícolas",
  "centroCusto": "CC-001",
  "centroLucro": "",
  "safra": "Safra 2025/2026",
  "projeto": "",
  "contaBancariaAgencia": "1234-5",
  "contaBancariaConta": "56789-0",
  "formaPagamento": "Boleto bancário",
  "parcelas": [
    { "dataVencimento": "2026-10-10", "valorOriginal": 12450.00 }
  ]
}
```
- `tipo`: `"PAGAR"` ou `"RECEBER"` (obrigatório).
- `cnpjCpf`: CNPJ do fornecedor (se `PAGAR`) ou CPF/CNPJ do cliente (se `RECEBER`).
- `centroCusto`, `centroLucro`, `safra`, `projeto`, `contaBancariaAgencia`/`contaBancariaConta`, `formaPagamento`: todos opcionais.
- `parcelas`: array, não precisa de `numero` (é atribuído automaticamente por ordem) — pode ter 1 ou várias.
- Resposta `201` com o título criado, incluindo `parcelas[].id` (guarde esse id se for dar baixa depois).

### `GET /titulos?tipo=PAGAR` (ou `RECEBER`)
Permissão: `titulo:ler`. Sem corpo. `?tipo=` é obrigatório.

### `POST /lancamentos-bancarios` — lançamento manual
Permissão: `lancamento:escrever`.

```json
{
  "contaBancariaAgencia": "1234-5",
  "contaBancariaConta": "56789-0",
  "data": "2026-09-15",
  "tipo": "SAIDA",
  "valor": 850.00,
  "descricao": "Combustível para colheitadeira",
  "categoriaFinanceira": "Combustíveis e Lubrificantes",
  "centroCusto": "CC-002",
  "centroLucro": "",
  "safra": "",
  "projeto": ""
}
```
- `contaBancariaAgencia`/`contaBancariaConta`: **obrigatórios** aqui (diferente de título).
- `tipo`: `"ENTRADA"` ou `"SAIDA"`.
- `categoriaFinanceira`, `centroCusto`, `centroLucro`, `safra`, `projeto`: opcionais.

### `GET /lancamentos-bancarios`
Permissão: `lancamento:ler`. Sem corpo, sem filtro de query.

### `POST /baixas` — dar baixa numa parcela (marcar como paga/recebida)
Permissão: `titulo:baixar`.

```json
{
  "parcelaId": "<id vindo de GET /titulos>",
  "data": "2026-10-10",
  "valorPago": 12450.00,
  "valorJuros": 0,
  "valorMulta": 0,
  "valorDesconto": 0,
  "contaBancariaAgencia": "1234-5",
  "contaBancariaConta": "56789-0"
}
```
- `parcelaId` é o **único** campo desta API que exige o ID interno — obtenha via `GET /titulos?tipo=...` (cada título vem com `parcelas[].id`).
- `valorJuros`/`valorMulta`/`valorDesconto`: opcionais, default `0`.
- `parcelaId` inexistente → `404`.

### `POST /extratos/importar` — importar extrato bancário (OFX)
Permissão: `conciliacao:escrever`. **`multipart/form-data`**, não JSON.

Campos do form-data:
- `arquivo`: o arquivo `.ofx` (file).
- `contaBancariaAgencia`: texto.
- `contaBancariaConta`: texto.

Resposta `201` com o resumo: `{ totalLinhas, linhasNovas, linhasIgnoradas, totalProcessadas, conciliadasAutomaticamente, ... }`.

---

## 7. Rotas de leitura dos cadastros de apoio

Todas: permissão `cadastro:ler`, `GET`, sem corpo, devolvem um array `200`.

| Rota | Escopo |
|---|---|
| `GET /fornecedores` | empresa |
| `GET /clientes` | empresa |
| `GET /categorias-financeiras` | filial |
| `GET /centros-de-custo` | filial |
| `GET /centros-de-lucro` | filial |
| `GET /safras` | filial |
| `GET /projetos` | filial |
| `GET /contas-bancarias` | filial |

Use essas rotas pra conferir o nome/código/CNPJ exato antes de montar o corpo de uma rota de escrita.

---

## 8. Testando no Postman — passo a passo

1. Crie um **Environment** no Postman com as variáveis:
   - `base_url` = `http://localhost:3000/api/v1`
   - `api_key` = a chave `sk_...` que você gerou
   - `filial_cnpjcpf` = `12.345.678/0001-90` (ou o CNPJ/CPF da sua filial)
2. Crie uma **Collection** e, na aba **Authorization** da Collection (não de cada request), escolha **Bearer Token** com valor `{{api_key}}` — assim todas as requests dentro herdam.
3. Ainda na Collection, aba **Headers**, adicione (vale pra todas as requests da collection):
   - `X-Filial-CnpjCpf: {{filial_cnpjcpf}}`
4. Primeira request pra testar (mais simples, só leitura): `GET {{base_url}}/fornecedores` — deve devolver `200` com a lista.
5. Depois teste um `POST {{base_url}}/titulos` com o corpo do exemplo da seção 6 (Body → raw → JSON).
6. Pegue o `parcelas[0].id` da resposta e use num `POST {{base_url}}/baixas`.
7. Pra `POST /extratos/importar`: na aba Body escolha **form-data** (não raw/JSON), adicione a chave `arquivo` como tipo **File** e selecione um `.ofx`, mais as chaves `contaBancariaAgencia`/`contaBancariaConta` como texto.

Se algo voltar `422`, o campo `campos` na resposta te diz exatamente o que revisar.
