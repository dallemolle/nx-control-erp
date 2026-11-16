# Segregação de funções na baixa

Data: 2026-11-16 · Status: implementada (2026-11-16)

Item do [backlog](../../backlog.md) ("Segregação de funções na baixa"), da
spec de [títulos](2026-08-31-financeiro-titulos-design.md) ("quem registrou a
baixa não pode aprová-la" — fora do escopo do MVP).

## Problema

Registrar baixa exige `titulo:baixar` (Financeiro, Tesouraria, Administrador;
a API v1 registra em nome do dono da chave). Aprovar exige `titulo:aprovar`
(Tesouraria, Administrador), e a aprovação já cria o `LancamentoBancario`
(`aprovarBaixa`, `src/server/services/baixa.ts`). Um usuário da Tesouraria ou
o Administrador registra e aprova a própria baixa sozinho: dinheiro entra ou
sai do caixa no sistema sem um segundo olhar. A tela de Aprovações mostra
"Registrado por", mas não impede.

## Decisões deste desenho

1. **Quem registrou a baixa não pode aprová-la** quando a empresa exige: a
   checagem é `baixa.usuarioId === sessao.usuarioId`. Vale para todos os
   perfis, inclusive o Administrador.
2. **Configuração por empresa** (decisão do usuário): campo
   `Empresa.exigirAprovacaoPorOutro`, **ligado por padrão**, também nas
   empresas existentes. Empresa com uma pessoa só no financeiro desmarca no
   cadastro da empresa (só Administrador); a mudança vai para a auditoria da
   empresa.
3. **Rejeitar a própria baixa continua permitido:** equivale a desistir dela,
   não mexe em dinheiro.
4. **Fora da regra:** a baixa automática da venda à vista (`efetivarBaixa`
   direto, já aprovada) e o registro pela API (só registra; a aprovação passa
   pela regra).

## Dados

- Migração aditiva: `Empresa.exigirAprovacaoPorOutro Boolean @default(true)`.
- `empresaSchema` ganha `exigirAprovacaoPorOutro: checkboxSchema`
  (`src/lib/schemas/campos.ts`: marcado → `true`, ausente → `false`).
- `criarEmpresa`/`atualizarEmpresa` gravam o campo; a auditoria de
  `ATUALIZAR` passa a incluir o valor anterior dele.

## Serviço (`baixa.ts`)

- `aprovarBaixa`: depois de `garantirBaixaPendente`, lê
  `empresa.exigirAprovacaoPorOutro` (`sessao.empresaId`) e, se ligado e
  `anterior.usuarioId === sessao.usuarioId`, lança
  `Error("Quem registrou a baixa não pode aprová-la. Peça a outra pessoa com permissão de aprovação.")`.
  A baixa continua `PENDENTE` e nenhum lançamento é criado.

## Tela

- **Aprovações** (`/financeiro/aprovacoes`): a página lê a configuração da
  empresa; numa baixa com `usuarioId` igual ao da sessão e regra ligada, o
  botão **Aprovar** fica desabilitado e a linha mostra "Registrada por você:
  outra pessoa precisa aprovar". **Rejeitar** continua disponível.
- **Cadastro da empresa** (`empresa-dialog-form.tsx`): caixa "Exigir que a
  baixa seja aprovada por outra pessoa" (marcada por padrão na criação), com
  a explicação "Quem registra uma baixa não pode aprová-la. Desmarque se a
  empresa tem uma pessoa só no financeiro."

## Testes

- Serviço (`baixa.test.ts` ou o arquivo de testes de baixa existente): com a
  regra ligada, a mesma pessoa não aprova (erro com a mensagem acima) e a
  baixa continua `PENDENTE` sem lançamento; outra pessoa aprova; com a regra
  desligada, a mesma pessoa aprova; rejeitar a própria funciona com a regra
  ligada.
- Schema da empresa: checkbox marcado → `true`, ausente → `false`.
- Empresa: `atualizarEmpresa` grava o campo e a auditoria registra antes e
  depois.
- A fixture financeira (`financeiroTestFixtures.ts`) cria a empresa com a
  regra **desligada**, para os testes existentes que registram e aprovam com
  o mesmo usuário; os testes da regra ligam o campo.

## Docs

- Ajuda: seção 3.2 (Aprovações pendentes) explica a regra e o botão
  desabilitado; seção 8.1 (Empresas) explica a opção.
- Backlog: remover o item. Spec de títulos: marcar o item do fora do escopo
  como **feito**.
- Efeito no deploy: com o padrão ligado, empresa com uma pessoa só no
  financeiro passa a ver o Aprovar desabilitado até o Administrador
  desmarcar a opção — dito na ajuda.

## Fora do escopo

- Exigir aprovação por perfil diferente (não só pessoa diferente) —
  **descartado:** pessoa diferente já é o controle; perfil diferente travaria
  a Tesouraria com mais de uma pessoa.
- Configuração por filial — **descartado:** o controle é da empresa.
- Alçada por valor (só acima de X exige outra pessoa) — **descartado:** sem
  pedido; a configuração liga/desliga basta.
