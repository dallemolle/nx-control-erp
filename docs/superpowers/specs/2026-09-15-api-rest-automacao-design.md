# API REST de automação de lançamentos — design

## Contexto

O usuário quer automatizar lançamentos financeiros (contas a pagar,
contas a receber e movimentação bancária) através de um agente de IA
externo que chama uma API. Hoje o `nx-control-erp` não tem nenhuma API
REST programática: existem apenas Server Actions do Next.js (chamadas
internas do próprio front-end, autenticadas por cookie de sessão de
navegador via NextAuth) e duas rotas de exportação somente-leitura
(`/financeiro/contas-a-pagar/export`, `/financeiro/contas-a-receber/export`),
também autenticadas por cookie.

Este documento desenha a primeira API REST do sistema: autenticação por
chave (sem depender de cookie/sessão de navegador), e um conjunto de
endpoints de escrita e leitura para títulos, lançamentos bancários,
baixas, importação de extrato e os cadastros de apoio dos quais esses
recursos dependem (fornecedor, cliente, categoria financeira, centro de
custo, centro de lucro, safra, projeto, conta bancária).

## Decisões já tomadas (não rediscutir)

1. **Autenticação**: chave de API tipo bearer token, vinculada a um
   usuário já existente no sistema (não um conceito de "conta de
   serviço" separado). As permissões e o vínculo empresa/filial da
   chamada seguem exatamente o mesmo `perfil`/vínculo que esse usuário já
   tem hoje — nenhuma tabela de permissão nova.
2. **Escopo de "movimentação bancária"**: três operações distintas —
   lançamento manual bancário, baixa de título (marcar parcela como
   paga/recebida) e importação de extrato bancário (OFX).
3. **Cadastros de apoio referenciados por identificador natural** (CNPJ/
   CPF, código, nome — não UUID interno), reaproveitando exatamente o
   mesmo mecanismo de resolução já implementado para a importação de CSV
   de títulos (`src/server/services/importacaoTitulo.ts`). Quando um
   identificador não resolve para um cadastro existente, a API devolve
   erro claro — **nunca cria o cadastro automaticamente**.
4. **Empresa/filial explícitos em cada chamada** (não fixos por chave),
   via headers `X-Empresa-Id`/`X-Filial-Id` — o usuário dono da chave
   pode ter vínculo com mais de uma empresa/filial, igual a um usuário
   humano trocando de empresa/filial na tela.
5. **Endpoints de leitura incluídos** nesta v1, tanto para os cadastros
   de apoio quanto para títulos/lançamentos já criados — o agente precisa
   poder consultar o que já existe antes de decidir o que lançar.
6. **Sem idempotência nesta v1** — decisão registrada em
   `docs/backlog.md` (seção "API REST de automação (lançamentos via
   agente)"), com o caminho de correção descrito lá caso vire problema
   real.
7. **Sem paginação nesta v1** — os endpoints de listagem espelham o
   comportamento das telas internas equivalentes, que também não paginam
   hoje.

## Modelo de dados

Novo model Prisma:

```prisma
model ApiKey {
  id          String    @id @default(uuid())
  usuarioId   String
  nome        String
  prefixo     String
  chaveHash   String    @unique
  ultimoUsoEm DateTime?
  revogadaEm  DateTime?
  criadoEm    DateTime  @default(now())

  usuario Usuario @relation(fields: [usuarioId], references: [id], onDelete: Cascade)

  @@index([usuarioId])
}
```

Adicionar a relação inversa `apiKeys ApiKey[]` no model `Usuario`.

### Formato da chave

- Chave completa: `sk_` + 32 bytes aleatórios (`crypto.randomBytes(32)`)
  codificados em base64url — ex.: `sk_5f3a...` (43 caracteres após o
  prefixo `sk_`).
- `prefixo` armazenado = os primeiros 11 caracteres da chave completa
  (ex.: `sk_5f3a91b2`) — suficiente para o usuário reconhecer qual chave
  é qual sem expor entropia relevante (mesmo padrão usado por Stripe/
  GitHub: um prefixo curto de um segredo de 256 bits não reduz o espaço
  de busca de forma prática).
- `chaveHash` armazenado = SHA-256 (`crypto.createHash("sha256")`, módulo
  nativo do Node, sem nova dependência) da chave completa, em hex,
  com `@unique` — permite buscar a chave por igualdade direta do hash
  (`prisma.apiKey.findUnique({ where: { chaveHash } })`), ao contrário de
  bcrypt, que exigiria comparar contra cada linha uma a uma. SHA-256 é
  apropriado aqui porque a chave já nasce com alta entropia (ao contrário
  de senha de usuário, que pode ser fraca e por isso usa bcrypt
  deliberadamente lento).
- A chave completa só é retornada uma vez, no momento da criação. Depois
  disso, só `prefixo` é recuperável.

## Autenticação e resolução de sessão por requisição

### Headers exigidos em toda chamada

```
Authorization: Bearer <chave completa>
X-Empresa-Id: <uuid da empresa>
X-Filial-Id: <uuid da filial>
```

### `src/server/api/sessaoApi.ts` (novo)

```ts
export class ApiAuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiAuthError";
  }
}

export async function requireSessaoApi(request: Request): Promise<SessaoAtiva> {
  // 1. Extrai "Authorization: Bearer <chave>". Ausente/mal formado -> ApiAuthError(401, "Chave de API ausente ou mal formada").
  // 2. hash = sha256(chave). Busca ApiKey por chaveHash (findUnique). Não encontrada -> ApiAuthError(401, "Chave de API inválida").
  // 3. apiKey.revogadaEm != null -> ApiAuthError(401, "Chave de API revogada").
  // 4. Atualiza apiKey.ultimoUsoEm = new Date() (fire-and-forget aceitável; não bloqueia a resposta).
  // 5. Extrai X-Empresa-Id / X-Filial-Id. Ausentes -> ApiAuthError(400, "Informe X-Empresa-Id e X-Filial-Id").
  // 6. perfil = await requireVinculoAtivo(apiKey.usuarioId, empresaId) — reaproveita a função já existente em
  //    src/server/services/usuarioEmpresa.ts. AcessoNegadoError -> ApiAuthError(403, "Usuário sem vínculo com a empresa informada").
  // 7. { podeAlterar } = await requireVinculoFilialAtivo(apiKey.usuarioId, empresaId, filialId) — reaproveita
  //    src/server/services/usuarioEmpresaFilial.ts. AcessoFilialNegadoError -> ApiAuthError(403, "Usuário sem vínculo com a filial informada").
  // 8. Retorna { usuarioId: apiKey.usuarioId, nome: <nome do usuário>, empresaId, perfil, filialId, podeAlterarFilial: podeAlterar }
  //    — o mesmo shape de SessaoAtiva usado em toda a aplicação hoje.
}
```

### `src/server/api/executarRotaApi.ts` (novo)

Wrapper único usado por toda rota, elimina try/catch repetido:

```ts
export async function executarRotaApi(
  request: Request,
  handler: (sessao: SessaoAtiva) => Promise<Response>,
): Promise<Response> {
  try {
    const sessao = await requireSessaoApi(request);
    return await handler(sessao);
  } catch (erro) {
    if (erro instanceof ApiAuthError) {
      return Response.json({ erro: erro.message }, { status: erro.status });
    }
    if (erro instanceof PermissionError || erro instanceof FilialSomenteLeituraError) {
      return Response.json({ erro: erro.message }, { status: 403 });
    }
    if (erro instanceof ErroRecursoNaoEncontrado) {  // novo tipo, ver seção "Erros de negócio" abaixo
      return Response.json({ erro: erro.message }, { status: 404 });
    }
    if (erro instanceof ErroValidacaoApi) {  // novo tipo, agrega erros de zod + resolução de cadastro
      return Response.json({ erro: erro.message, campos: erro.campos }, { status: 422 });
    }
    // erro inesperado — não vaza detalhes internos
    console.error(erro);
    return Response.json({ erro: "Erro interno" }, { status: 500 });
  }
}
```

Cada `route.ts` fica reduzido a montar o handler e delegar pro service
existente — nenhuma rota reimplementa checagem de permissão (ela já
acontece dentro dos services, como `criarTitulo` já faz com
`requirePermission(sessao.perfil, "titulo:escrever")`).

## Resolução de cadastros por identificador natural (extração compartilhada)

Hoje a lógica de resolução (CNPJ → fornecedor/cliente, nome → categoria/
safra, código → centro de custo/centro de lucro/projeto, agência+conta →
conta bancária) vive inteira dentro de
`src/server/services/importacaoTitulo.ts`, acoplada ao formato de linha
de CSV. Ela é extraída para um módulo novo e genérico:

`src/server/services/resolucaoCadastros.ts`:

```ts
export class ErroValidacaoApi extends Error {
  constructor(message: string, public campos: string[] = []) { super(message); }
}

export type ResolvedorCadastros = {
  // Campos obrigatórios: lançam ErroValidacaoApi se vazios ou se não encontrarem o cadastro.
  resolverContraparte(tipo: TipoTitulo, cnpjCpf: string): Promise<string>;
  resolverCategoriaFinanceira(nome: string): Promise<string>;
  // Campos opcionais: entrada vazia/omitida -> undefined (sem erro). Entrada não vazia que não
  // encontra o cadastro -> lança ErroValidacaoApi (mesma regra da importação de CSV hoje).
  resolverCentroCusto(codigo: string | undefined): Promise<string | undefined>;
  resolverCentroLucro(codigo: string | undefined): Promise<string | undefined>;
  resolverSafra(nome: string | undefined): Promise<string | undefined>;
  resolverProjeto(codigo: string | undefined): Promise<string | undefined>;
  // Ambos os campos vazios -> undefined. Só um preenchido -> lança ErroValidacaoApi
  // ("Informe agência e conta bancária juntas, ou deixe as duas em branco", igual ao CSV hoje).
  resolverContaBancaria(agencia: string | undefined, conta: string | undefined): Promise<string | undefined>;
};

export async function construirResolvedorCadastros(sessao: SessaoAtiva): Promise<ResolvedorCadastros>;
```

- `importacaoTitulo.ts` passa a importar e usar este módulo (em vez de
  duplicar a lógica) — a normalização (`normalizarDocumento`,
  `normalizarChave`) e as mensagens de erro continuam sendo exatamente as
  mesmas que já existem hoje, só movidas de lugar.
- As rotas novas (`POST /api/v1/titulos`, `/lancamentos-bancarios`,
  `/baixas`) usam o mesmo `ResolvedorCadastros` para converter os campos
  naturais do corpo da requisição nos IDs que os schemas/services já
  existentes (`tituloSchema`, `lancamentoManualSchema`, `baixaSchema`)
  esperam, antes de chamar `criarTitulo`/`criarLancamentoManual`/
  `registrarBaixa` sem nenhuma mudança nesses services.

## Endpoints

Todos sob `src/app/api/v1/` (fora do grupo de rotas `(dashboard)`, que é
exclusivo da UI autenticada por cookie). Toda rota passa por
`executarRotaApi`.

### `POST /api/v1/titulos`

Corpo (JSON):
```ts
{
  tipo: "PAGAR" | "RECEBER";
  cnpjCpf: string;
  documento: string;
  dataEmissao: string;       // "aaaa-mm-dd"
  dataCompetencia: string;   // "aaaa-mm-dd"
  categoriaFinanceira: string;
  centroCusto?: string;
  centroLucro?: string;
  safra?: string;
  projeto?: string;
  contaBancariaAgencia?: string;  // ambos juntos ou nenhum dos dois
  contaBancariaConta?: string;
  formaPagamento?: string;
  parcelas: { dataVencimento: string; valorOriginal: number }[];
}
```
Fluxo: `requirePermission` já embutido em `criarTitulo` → resolve os
campos via `ResolvedorCadastros` → monta `TituloFormValues` → chama
`criarTitulo(sessao, tipo, dados)`. Resposta `201` com o título criado
(incluindo `parcelas[].id`, necessário para depois dar baixa).

### `GET /api/v1/titulos?tipo=PAGAR|RECEBER`

Chama `listarTitulos(sessao.filialId, tipo, {})` (checagem de
`titulo:ler` dentro do handler, mesmo padrão da página
`contas-a-pagar/page.tsx`). Resposta `200` com o array de títulos e suas
parcelas (mesmo shape hoje consumido por `titulo-table.tsx`).

### `POST /api/v1/lancamentos-bancarios`

Corpo:
```ts
{
  contaBancariaAgencia: string;
  contaBancariaConta: string;
  data: string;
  tipo: "ENTRADA" | "SAIDA";
  valor: number;
  descricao: string;
  categoriaFinanceira?: string;
  centroCusto?: string;
  centroLucro?: string;
  safra?: string;
  projeto?: string;
}
```
Resolve `contaBancariaId` (obrigatório aqui, diferente de título) e os
demais campos opcionais via `ResolvedorCadastros`, monta
`LancamentoManualFormValues`, chama `criarLancamentoManual(sessao, dados)`.
Resposta `201`.

### `GET /api/v1/lancamentos-bancarios`

Chama `listarLancamentos(sessao.filialId)` (checagem `lancamento:ler`).
Resposta `200`.

### `POST /api/v1/baixas`

Corpo:
```ts
{
  parcelaId: string;   // único campo desta API que exige o ID interno — obtido via GET /api/v1/titulos
  data: string;
  valorPago: number;
  valorJuros?: number;
  valorMulta?: number;
  valorDesconto?: number;
  contaBancariaAgencia: string;
  contaBancariaConta: string;
}
```
Resolve `contaBancariaId`, monta `BaixaFormValues`, chama
`registrarBaixa(sessao, parcelaId, dados)`. `parcelaId` inexistente ou de
outra filial → `ErroRecursoNaoEncontrado` (`404`). Resposta `201`.

### `POST /api/v1/extratos/importar`

`multipart/form-data` (não JSON, pois envolve arquivo):
- campo `arquivo`: o arquivo OFX;
- campos `contaBancariaAgencia` / `contaBancariaConta`.

Resolve `contaBancariaId`, chama
`importarExtratoOfx(sessao, contaBancariaId, arquivo)` sem nenhuma
mudança nesse service. Resposta `201` com o resumo já devolvido pelo
service hoje (linhas importadas, conciliadas automaticamente).

### GETs de cadastro de apoio

Um `route.ts` por recurso, cada um só chamando a função `listar*` que já
existe, sem lógica nova:

| Rota | Service reaproveitado |
|---|---|
| `GET /api/v1/fornecedores` | `listarFornecedores(sessao.empresaId)` |
| `GET /api/v1/clientes` | `listarClientes(sessao.empresaId)` |
| `GET /api/v1/categorias-financeiras` | `listarCategoriasFinanceiras(sessao.filialId)` |
| `GET /api/v1/centros-de-custo` | `listarCentrosCusto(sessao.filialId)` |
| `GET /api/v1/centros-de-lucro` | `listarCentrosLucro(sessao.filialId)` |
| `GET /api/v1/safras` | `listarSafras(sessao.filialId)` |
| `GET /api/v1/projetos` | `listarProjetos(sessao.filialId)` |
| `GET /api/v1/contas-bancarias` | `listarContasBancarias(sessao.filialId)` |

Todos verificam `cadastro:ler` (mesma ação já usada pelas telas de
cadastro hoje).

## Erros — formato e mapeamento de status

Toda resposta de erro:
```json
{ "erro": "mensagem legível" }
```
(endpoints `422` acrescentam `"campos": ["categoriaFinanceira", ...]"`
quando aplicável, para o agente identificar programaticamente qual campo
falhou, além da mensagem legível).

| Situação | Status |
|---|---|
| Chave ausente, mal formada, inválida ou revogada | `401` |
| `X-Empresa-Id`/`X-Filial-Id` ausentes | `400` |
| Usuário sem vínculo com a empresa/filial informada | `403` |
| Perfil sem permissão para a ação (`PermissionError`) | `403` |
| Filial em modo somente-leitura (`FilialSomenteLeituraError`) | `403` |
| Identificador natural não encontrado, ou corpo inválido (zod) | `422` |
| Recurso referenciado não existe (ex.: `parcelaId`) | `404` |
| Erro inesperado | `500` (sem detalhes internos na resposta) |

Novo tipo de erro, `src/server/services/erros.ts`:
```ts
export class ErroRecursoNaoEncontrado extends Error {}
```
usado por `registrarBaixa`-equivalente da API quando `parcelaId` não
existe na filial da sessão (a função de service já existente pode já
lançar um erro genérico aqui — se lançar `Error` comum hoje, a rota da
API precisa diferenciar "não encontrado" de outros erros; avaliar na
implementação se vale ajustar o service para lançar
`ErroRecursoNaoEncontrado` especificamente, já que isso beneficia tanto a
API quanto qualquer chamador futuro).

## Gestão de chaves (UI)

Extensão da tela `/usuarios` existente (Administração → Usuários),
atrás da permissão `usuario:gerenciar` já existente (hoje só
`ADMINISTRADOR`) — nenhuma permissão nova.

- Cada linha de usuário ganha um botão "Chaves de API" (dialog).
- Dialog lista as chaves do usuário: nome, prefixo, criada em, último
  uso, botão "Revogar" (seta `revogadaEm`, não deleta a linha).
- Botão "Gerar nova chave": pede um `nome` (rótulo livre), gera a chave,
  mostra o valor completo uma única vez num campo copiável com aviso
  "essa chave não será mostrada novamente — copie agora".

Novo módulo de serviço `src/server/services/apiKey.ts`:
```ts
export async function gerarChave(sessao: SessaoAtiva, usuarioId: string, nome: string): Promise<{ chaveCompleta: string; id: string }>;
export async function revogarChave(sessao: SessaoAtiva, chaveId: string): Promise<void>;
export async function listarChaves(usuarioId: string): Promise<{ id: string; nome: string; prefixo: string; ultimoUsoEm: Date | null; revogadaEm: Date | null; criadoEm: Date }[]>;
```
`gerarChave`/`revogarChave` chamam `requirePermission(sessao.perfil, "usuario:gerenciar")` internamente, mesmo padrão de todos os outros services.

## Testes

- **`requireSessaoApi`**: chave válida resolve a sessão certa; chave
  ausente/inválida/revogada → `401`; header de empresa/filial ausente →
  `400`; sem vínculo com a empresa/filial informada → `403`;
  `ultimoUsoEm` é atualizado a cada chamada bem-sucedida.
- **`resolucaoCadastros.ts`**: cobertura equivalente à que já existe hoje
  em `importacaoTitulo.test.ts` (resolve por CNPJ/código/nome; erro claro
  quando não encontra; campos opcionais vazios não geram erro), agora
  testada como módulo próprio.
- **`importacaoTitulo.ts` após a extração**: os testes existentes
  continuam passando sem alteração de comportamento (mudança é só de
  onde a lógica mora).
- **Cada rota nova**: teste de integração chamando a função `POST`/`GET`
  exportada do `route.ts` diretamente com um `Request`/`FormData`
  construído manualmente — padrão novo neste projeto (as 2 rotas de
  export existentes não têm teste de rota próprio), necessário aqui por
  ser a primeira superfície com autenticação própria. Casos por rota:
  sucesso (`201`/`200`), permissão insuficiente (`403`), identificador
  natural não encontrado (`422`), recurso referenciado inexistente
  (`404` nas rotas que se aplica).
- **`apiKey.ts`**: gerar cria a chave e devolve o valor completo só na
  criação; a chave gerada autentica com sucesso em `requireSessaoApi`;
  revogar impede autenticação subsequente com aquela chave; usuário sem
  `usuario:gerenciar` não consegue gerar/revogar.

## Fora do escopo desta v1 (registrado)

- Idempotência de escrita (`docs/backlog.md`).
- Paginação nas listagens.
- Rate limiting.
- Expiração automática de chave (só revogação manual).
- Qualquer criação automática de cadastro de apoio quando o
  identificador natural não resolve.
