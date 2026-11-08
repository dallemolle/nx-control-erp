# Fase 7a — Fundação de produção, estoque e vendas

Data: 2026-11-08 · Status: aguardando revisão

Primeiro sub-projeto da Fase 7 (ver
[plano de entrega](../../modulos/producao-estoque-vendas/09-plano-de-entrega.md)).
Prepara perfis, permissões, cadastros e configuração que as etapas seguintes
(recepção, estoque, vendas, processamento) usam. **Não cria lote, estoque
nem venda.**

Decisões aplicadas: D-02 (cliente sem documento), D-04 (custo-padrão do
fruto próprio), D-09 (perfis PRODUCAO e VENDAS), e duas tomadas neste
desenho:

- **Cadastros de produção** são editados por Administrador e Produção, com
  uma permissão própria, sem dar acesso aos cadastros financeiros.
- **Vendas pode criar e editar clientes**, e só clientes.

## 1. Perfis e permissões

### Perfis

`enum Perfil` ganha `PRODUCAO` e `VENDAS`. Atualizar `PERFIS` em
`src/lib/schemas/usuario.ts` e os rótulos/descrições exibidos em
`/usuarios`.

### Ações novas (`src/server/auth/permissions.ts`)

| Ação | Cobre | Usada a partir de |
|---|---|---|
| `cadastroProducao:escrever` | Criar, editar, ativar/inativar fruta, produto, talhão, local e insumo. | 7a |
| `cliente:escrever` | Criar, editar, ativar/inativar cliente. | 7a |
| `producao:configurar` | Configuração de produção da filial. | 7a |
| `producao:ler` | Recepções, OPs, estoque, ajustes, rastreabilidade, painel. | 7b |
| `producao:escrever` | Lançar recepção e OP; encerrar OP. | 7b |
| `estoque:ajustar` | Ajustes de estoque. | 7b |
| `venda:ler` | Pedidos, entregas, relatórios de venda. | 7c |
| `venda:escrever` | Criar pedido, atualizar entrega. | 7c |
| `venda:cancelar` | Cancelar pedido. | 7c |
| `venda:liberarVencido` | Vender lote vencido como exceção. | 7c |

Todas entram na matriz já na 7a, para a matriz de perfis ficar completa e
testada uma vez só.

### Matriz

ADMINISTRADOR continua com todas. Para os demais, o que **muda**:

| Perfil | Ganha |
|---|---|
| FINANCEIRO | `cliente:escrever`, `producao:ler`, `venda:ler`, `venda:escrever`, `venda:cancelar` |
| TESOURARIA | `cliente:escrever`, `producao:ler`, `venda:ler` |
| GESTOR | `producao:ler`, `venda:ler`, `venda:liberarVencido` |
| AUDITOR | `producao:ler`, `venda:ler` |
| CONSULTA | `producao:ler`, `venda:ler` |
| **PRODUCAO** (novo) | `cadastro:ler`, `cadastroProducao:escrever`, `producao:ler`, `producao:escrever`, `estoque:ajustar`, `venda:ler` |
| **VENDAS** (novo) | `cadastro:ler`, `cliente:escrever`, `producao:ler`, `venda:ler`, `venda:escrever` |

Produção e Vendas não recebem nenhuma ação do financeiro (`titulo:*`,
`lancamento:*`, `conciliacao:*`, `orcamento:*`).

### Cliente passa a usar `cliente:escrever`

`criarCliente`, `atualizarCliente` e `definirAtivoCliente` trocam
`cadastro:escrever` por `cliente:escrever`. FINANCEIRO e TESOURARIA, que
hoje editam clientes via `cadastro:escrever`, ganham `cliente:escrever`, então
nada muda para eles. Na tela, `podeEscreverCliente(perfil,
podeAlterarFilial)` substitui `podeAlterarFilialAtiva` em
`/cadastros/clientes`.

Helpers novos, no mesmo padrão dos existentes:
`podeEscreverCadastroProducao`, `podeEscreverCliente`,
`podeConfigurarProducao`.

`requireAlteracaoFilial` continua valendo em toda escrita.

## 2. Menu filtrado por permissão

**Problema.** `NavItem.permitido` é uma lista de perfis, e a maioria dos
itens não tem lista nenhuma. Um usuário PRODUCAO veria "Contas a pagar" e
cairia em erro de permissão ao abrir.

**Mudança.** `NavItem` troca `permitido?: Perfil[]` por `acao?: Acao`: a
ação que a página exige no `requirePermission`. O menu mostra o item se
`podeExecutar(perfil, acao)`. Item sem `acao` (Ajuda) aparece para todos.

| Item | `acao` |
|---|---|
| Contas a pagar / a receber, Fluxo de caixa projetado, Fiscal × gerencial, Fluxo por dimensão | `titulo:ler` |
| Aprovações pendentes | `titulo:aprovar` |
| Tesouraria, Fluxo de caixa | `lancamento:ler` |
| Conciliação | `conciliacao:ler` |
| Fluxo de caixa estratégico | `planejamentoEstrategico:ler` |
| Orçamento, Comparação entre safras | `orcamento:ler` |
| Cadastros (todos) | `cadastro:ler` |
| Empresas / Filiais / Usuários | `empresa:gerenciar` / `filial:gerenciar` / `usuario:gerenciar` |
| Auditoria | `auditoria:ler` |
| Dashboard executivo | `dashboardExecutivo:ler` |
| Configuração de produção (novo) | `producao:configurar` |

O filtro sai do `sidebar.tsx` para uma função pura
`secoesVisiveis(perfil)` em `nav-items.ts`, testada.

Para os 6 perfis atuais, o menu fica igual ao de hoje, com uma correção:
**Fluxo de caixa estratégico** deixa de aparecer para FINANCEIRO,
TESOURARIA e CONSULTA. Hoje o item aparece para eles, mas a página recusa o
acesso, porque eles não têm `planejamentoEstrategico:ler`. O teste compara
o menu de cada perfil atual com o esperado.

Produção e Vendas veem a seção Cadastros inteira em modo leitura (têm
`cadastro:ler`), e editam só o que suas permissões cobrem.

## 3. Cadastros novos

### Modelo

Convenções do projeto: uuid, `criadoEm`/`atualizadoEm`, `@@map` em
snake_case no plural, `onDelete: Cascade` na empresa/filial. Kg em
`Decimal(18,3)`, R$/kg em `Decimal(18,4)`.

```prisma
enum CategoriaProduto       { FRUTO POLPA }
enum Conservacao            { IN_NATURA RESFRIADO CONGELADO }
enum TipoLocalArmazenamento { CAMARA_FRIA FREEZER REFRIGERADOR RECEPCAO OUTRO }

model Fruta {                       // por empresa
  id                 String  @id @default(uuid())
  empresaId          String
  nome               String
  custoPadraoKg      Decimal @default(0) @db.Decimal(18, 4) // D-04
  exigeBranqueamento Boolean @default(false)                // D-08
  ativo              Boolean @default(true)
  @@unique([empresaId, nome])
  @@map("frutas")
}

model Produto {                     // por empresa
  id                String           @id @default(uuid())
  empresaId         String
  codigo            String           // prefixo do nº de lote (RN-01)
  descricao         String
  categoria         CategoriaProduto
  frutaId           String
  conservacao       Conservacao
  validadeDias      Int
  precoReferenciaKg Decimal?         @db.Decimal(18, 4)
  armazenamento     String?          // texto da etiqueta: "-18 °C"
  unidadeComercial  String?          // "rasa"
  fatorUnidadeKg    Decimal?         @db.Decimal(18, 3) // 14
  ativo             Boolean          @default(true)
  @@unique([empresaId, codigo])
  @@map("produtos")
}

model Insumo {                      // por empresa
  id            String  @id @default(uuid())
  empresaId     String
  nome          String
  unidade       String           // un, kWh, h
  custoUnitario Decimal @db.Decimal(18, 4)
  ativo         Boolean @default(true)
  @@unique([empresaId, nome])
  @@map("insumos")
}

model Talhao {                      // por filial
  id          String  @id @default(uuid())
  filialId    String
  nome        String
  frutaId     String
  areaHa      Decimal @db.Decimal(10, 2)
  anoPlantio  Int?
  espacamento String?
  observacao  String?
  ativo       Boolean @default(true)
  @@unique([filialId, nome])
  @@map("talhoes")
}

model LocalArmazenamento {          // por filial
  id           String                 @id @default(uuid())
  filialId     String
  nome         String
  tipo         TipoLocalArmazenamento
  temperatura  String?
  capacidadeKg Decimal?               @db.Decimal(18, 3)
  ativo        Boolean                @default(true)
  @@unique([filialId, nome])
  @@map("locais_armazenamento")
}
```

`Fruta` relaciona com `Produto` e `Talhao` com `onDelete: Restrict`: fruta
em uso não é apagada (o sistema só inativa, como nos cadastros atuais).

### Validação (Zod, em `src/lib/schemas/`)

- **Fruta:** nome ≥ 2; custo-padrão ≥ 0.
- **Produto:**
  - código: 1 a 6 letras maiúsculas ou dígitos, guardado em maiúsculas
    (vira prefixo do lote: `FA-260927-01`);
  - validade em dias ≥ 1;
  - preço de referência ≥ 0 quando informado;
  - `unidadeComercial` e `fatorUnidadeKg` vão juntos: os dois ou nenhum,
    fator > 0;
  - fruta da mesma empresa e ativa.
- **Insumo:** nome ≥ 2, unidade obrigatória, custo ≥ 0.
- **Talhão:** nome ≥ 2, área > 0, ano de plantio entre 1950 e o ano
  atual; fruta da mesma empresa e ativa.
- **Local:** nome ≥ 2, capacidade > 0 quando informada.

Nome e código duplicados retornam mensagem de campo ("Já existe um produto
com este código"), não erro genérico do banco.

**Código do produto é editável na 7a.** A 7b, que cria os lotes, passa a
recusar a troca de código de produto que já tenha lote.

### Serviços e telas

Um serviço por cadastro (`fruta.ts`, `produto.ts`, `insumo.ts`, `talhao.ts`,
`localArmazenamento.ts`) no padrão de `safra.ts`:

- `listar…`, `criar…`, `atualizar…`, `definirAtivo…`;
- escrita exige `cadastroProducao:escrever` + `requireAlteracaoFilial`;
- escopo: `empresaId` (fruta, produto, insumo) ou `filialId` (talhão,
  local) da sessão, também no `where` de update e ativação;
- auditoria em toda escrita (`registrarAuditoria`, com anterior e novo).

Telas no padrão de `/cadastros/safras` (página com tabela + diálogo de
formulário + `actions.ts`), leitura com `cadastro:ler`:

| Rota | Colunas da lista |
|---|---|
| `/cadastros/frutas` | Nome, custo-padrão R$/kg, exige branqueamento, status |
| `/cadastros/produtos` | Código, descrição, fruta, categoria, conservação, validade (dias), preço ref. R$/kg, unidade comercial, status |
| `/cadastros/insumos` | Nome, unidade, custo unitário, status |
| `/cadastros/talhoes` | Nome, fruta, área (ha), ano de plantio, status |
| `/cadastros/locais-armazenamento` | Nome, tipo, temperatura, capacidade (kg), status |

Sem exportação, como os cadastros atuais. Exportação entra nas listagens
operacionais (recepção, estoque, pedidos).

No formulário de produto, a unidade comercial é um campo opcional com
ajuda: "Ex.: rasa = 14 kg. Permite lançar quantidade e preço por rasa."

Rótulos dos enums em `src/lib/schemas/enums.ts` (`ROTULOS_CATEGORIA_PRODUTO`,
`ROTULOS_CONSERVACAO`, `ROTULOS_TIPO_LOCAL`, `ROTULOS_CANAL_VENDA`).

Menu, seção Cadastros, depois de Projetos: Frutas · Produtos · Insumos ·
Talhões · Locais de armazenamento.

## 4. Configuração de produção

```prisma
model ConfiguracaoProducao {        // 1 por filial
  filialId                      String   @id
  registroAdepara               String?
  alertaVencimentoCongeladoDias Int      @default(30)
  alertaVencimentoResfriadoDias Int      @default(1)
  branqueamentoTemperaturaMinC  Decimal  @default(80) @db.Decimal(5, 1)
  branqueamentoTempoMinS        Int      @default(10)
  toleranciaBalancoMassa        Decimal  @default(0.03) @db.Decimal(5, 4)
  criadoEm                      DateTime @default(now())
  atualizadoEm                  DateTime @updatedAt
  @@map("configuracoes_producao")
}
```

- `obterConfiguracaoProducao(filialId)` devolve a gravada ou os padrões
  acima, sem gravar. As etapas seguintes leem por ela.
- `salvarConfiguracaoProducao(sessao, dados)`: `upsert`, exige
  `producao:configurar` + `requireAlteracaoFilial`, auditada.
- Tela `/configuracao-producao`, em Administração: um formulário só. A
  tolerância é digitada em % (3) e gravada como fração (0,03).
- Validação: dias ≥ 0; temperatura entre 0 e 150; tempo ≥ 0; tolerância
  entre 0 e 100%.

Campos ligados ao financeiro (categoria de venda, categoria de compra de
fruto, conta de recebimento, prazo ao produtor) **ficam para 7b e 7c**,
que os usam.

## 5. Cliente e Fornecedor

### Cliente

```prisma
enum CanalVenda { BATEDOR ATACADO VAREJO RESTAURANTE INDUSTRIA CONSUMIDOR_FINAL OUTRO }

model Cliente {
  cnpjCpf             String?       // era obrigatório (D-02)
  canalVenda          CanalVenda?
  municipio           String?
  enderecoEntrega     String?
  retiraNaPropriedade Boolean       @default(false)
  // demais campos e @@unique([empresaId, cnpjCpf]) sem mudança
}
```

- No Postgres, o `@@unique([empresaId, cnpjCpf])` aceita vários `NULL`:
  dois clientes sem documento coexistem, e documento repetido continua
  recusado.
- Schema: `cnpjCpfOpcionalSchema` em `src/lib/cnpjCpf.ts`. Vazio vira
  `null`; preenchido passa pela mesma validação de 11/14 dígitos.
- Lista de clientes mostra "—" sem documento; ganha a coluna Canal.
- Formulário: os 4 campos novos, numa seção "Vendas".

**Busca por documento.** `carregarCadastrosParaResolucao` (importação CSV
de títulos e API v1) passa a ignorar contrapartes sem documento ao montar
o mapa. Cliente sem CPF/CNPJ não é encontrado por documento, o que é o
esperado: a importação continua exigindo documento na linha.

### Fornecedor

`municipio String?`, no formulário e sem coluna nova na lista.
`cnpjCpf` do fornecedor continua obrigatório.

## 6. Seed e ajuda

- `prisma/seed.ts`, para a Empresa Demonstração:
  - frutas Açaí (exige branqueamento) e Acerola;
  - os 9 produtos do catálogo do
    [doc 1](../../modulos/producao-estoque-vendas/01-visao-geral.md), com
    rasa de 14 kg no fruto de açaí;
  - na Matriz, um talhão por fruta e os locais "Recepção" e "Câmara fria
    01".
  - Idempotente (`upsert`), como o resto do seed. **Sem dados reais da
    Hortitex**: o catálogo real entra pela importação (7d).
- `content/ajuda/passo-a-passo.md`: seção "Produção — cadastros iniciais"
  (o que cadastrar, em que ordem, o que é a rasa) e os perfis novos.

## 7. Testes

**Unitários**

- Matriz de permissões: cada perfil × cada ação nova, mais as regras de
  fronteira (Vendas cria cliente e não cria fornecedor; Produção edita
  produto e não edita categoria financeira; nenhum dos dois lê título).
- `secoesVisiveis`: para os 6 perfis atuais, o mesmo menu de hoje; para
  Produção e Vendas, sem Financeiro e Controladoria.
- Schemas: código de produto, par unidade/fator, tolerância em %,
  documento opcional do cliente.

**Integração (Postgres real)**

- Cada serviço de cadastro: cria, atualiza, inativa; recusa outra
  empresa/filial; recusa duplicado com mensagem; grava auditoria; recusa
  filial somente leitura.
- Produto e talhão recusam fruta de outra empresa ou inativa.
- Cliente: dois sem documento coexistem; documento repetido recusado;
  Vendas cria cliente; Consulta não.
- Resolução de cadastros: cliente sem documento não quebra o mapa e
  cliente com documento continua resolvido.
- Configuração: padrões sem registro; `upsert`; só `producao:configurar`.

**Navegador:** cada tela nova no desktop e a 390px; login com um usuário
Produção e um Vendas, conferindo menu e acesso negado ao financeiro.

`npm test`, `npm run lint` e `npm run build` limpos.

## 8. Migração

Duas migrations:

- enums novos, 6 tabelas novas, `clientes.cnpjCpf` sem `NOT NULL` e
  colunas novas em `clientes` e `fornecedores`;
- `Perfil` + 2 valores, numa migration separada, porque um valor novo de
  enum não pode ser usado na mesma transação em que é criado. Nenhum dado existente muda de valor. Rollback: as tabelas
novas ficam vazias em produção até alguém cadastrar.
