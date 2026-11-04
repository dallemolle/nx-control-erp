# API REST v1 — guia de uso

API programática para automatizar lançamentos financeiros (contas a pagar/receber, movimentação bancária) sem passar pela tela do navegador — pensada para um agente de IA ou script externo.

Ver também: `docs/superpowers/specs/2026-09-15-api-rest-automacao-design.md` (desenho original) e `docs/backlog.md` (limitações conhecidas).

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
| `Idempotency-Key` ainda em processamento (ver abaixo) | 409 |
| Erro inesperado | 500 |

## 5. Regra geral: identificadores por CNPJ/código/nome, não por UUID interno

Em vez de IDs internos, os campos de fornecedor/cliente/categoria/etc. usam o que você já tem: **CNPJ/CPF** (fornecedor/cliente), **código** (centro de custo, centro de lucro, projeto — o mesmo código que aparece no cadastro), **nome** (categoria financeira, safra — comparação sem diferenciar maiúsc./minúsc.), **agência + conta** (conta bancária). Se não encontrar, a API devolve erro claro em vez de criar o cadastro sozinha. A única exceção é `parcelaId` na baixa (você pega esse ID chamando `GET /titulos` antes).

---

### Reenvio seguro — `Idempotency-Key` (opcional, recomendado)

Todo `POST` aceita o header `Idempotency-Key` (1 a 255 caracteres; use um UUID gerado **por operação**, e repita o mesmo valor ao reenviar a mesma operação após timeout ou erro de rede):

```
Idempotency-Key: 6f1c2e8a-3b4d-4c5e-9f00-1a2b3c4d5e6f
```

| Situação | Resposta |
|---|---|
| Primeira vez | executa normalmente (`201`) |
| Reenvio depois de sucesso | **não executa de novo**: devolve a mesma resposta (mesmo status e corpo) com o header `Idempotent-Replayed: true` |
| Reenvio enquanto a original ainda está rodando | `409` — espere e reenvie |
| Mesma chave com outro corpo JSON | `422` — gere uma chave nova para uma operação diferente |
| A original falhou (`4xx`/`5xx`) | a chave é liberada: corrija e reenvie com a mesma chave |

A chave vale por usuário + filial + rota e não expira. Sem o header, cada `POST` cria um registro novo (comportamento anterior). Em `/extratos/importar` (multipart) a comparação de corpo não é feita, só a da chave.

Raro: se o servidor cair depois de gravar e antes de responder, a chave fica "em processamento" (`409`) para sempre — confira pelo `GET` se o registro foi criado antes de tentar com uma chave nova.

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

**Classificação fiscal × gerencial (todos opcionais).** Quem já integra sem esses campos continua funcionando: o título nasce com o padrão do fornecedor/cliente (cadastro → "Classificação padrão dos títulos") ou, sem padrão, `FISCAL`.

| Campo | Valores | Observação |
|---|---|---|
| `classificacaoFiscal` | `FISCAL` \| `GERENCIAL` | `FISCAL` = com documento fiscal/oficial; `GERENCIAL` = negociação sem nota |
| `tipoComprovante` | fiscais: `NFE`, `NFCE`, `NFSE`, `CTE`, `NF_PRODUTOR`, `NF_ENTRADA`, `GUIA_TRIBUTO`, `FOLHA_PAGAMENTO`, `TARIFA_BANCARIA`, `CONTRATO`, `OUTRO_FISCAL` · gerenciais: `RECIBO`, `PEDIDO_INTERNO`, `SEM_COMPROVANTE` | Precisa ser do mesmo grupo da classificação |
| `numeroDocumentoFiscal`, `serieDocumentoFiscal` | texto | Só em `FISCAL`; número exige `tipoComprovante` |
| `chaveAcesso` | 44 dígitos (pontuação é ignorada) | Só para `NFE`/`NFCE`/`CTE`; o dígito verificador é conferido |
| `dataEmissaoDocumentoFiscal` | `AAAA-MM-DD` | Data da nota |
| `motivoSemDocumento` | texto | Só em `GERENCIAL` (ex.: "produtor não emite nota") |

```json
{
  "...": "campos do exemplo acima",
  "classificacaoFiscal": "FISCAL",
  "tipoComprovante": "NFE",
  "numeroDocumentoFiscal": "20456",
  "serieDocumentoFiscal": "1",
  "chaveAcesso": "3524 0312 3456 7800 0195 5500 1000 0012 3411 2345 6782"
}
```

Erros `422` (com `campos`): classificação/tipo inválidos, tipo de comprovante do grupo errado, chave inválida, ou **nota já lançada** na filial (mesma chave de acesso, ou mesmo fornecedor/cliente + tipo + série + número).

### `GET /titulos?tipo=PAGAR` (ou `RECEBER`)
Permissão: `titulo:ler`. Sem corpo. `?tipo=` é obrigatório.
- `?classificacao=FISCAL` ou `?classificacao=GERENCIAL` (opcional): filtra pela classificação. Sem o parâmetro, devolve todos. Valor diferente desses dois → `422`.
- Cada título traz `classificacaoFiscal`, `tipoComprovante`, `numeroDocumentoFiscal`, `serieDocumentoFiscal`, `chaveAcesso`, `dataEmissaoDocumentoFiscal`, `motivoSemDocumento`.

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
- `classificacaoFiscal` (`FISCAL` \| `GERENCIAL`, padrão `FISCAL`), `tipoComprovante` (mesmos valores e regra de grupo do título) e `numeroComprovante` (texto livre): opcionais.

### `GET /lancamentos-bancarios`
Permissão: `lancamento:ler`. Sem corpo.
- `?classificacao=FISCAL` ou `?classificacao=GERENCIAL` (opcional). Transferências entre contas não têm classificação (`classificacaoFiscal: null`) e só aparecem sem o filtro.

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

`GET /fornecedores` e `GET /clientes` trazem também `classificacaoFiscalPadrao` (`FISCAL`, `GERENCIAL` ou `null`): é a classificação que um título novo daquele parceiro recebe quando o corpo não informa `classificacaoFiscal`.

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
