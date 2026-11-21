## Como pedir ajuda numa tela

Toda tela tem um ícone **?** ao lado do título. Ele abre a ajuda da própria tela: escolha o que você quer fazer e um roteiro mostra a tela passo a passo, já preenchida com um exemplo. Nada do que você faz na ajuda é salvo.

## Como o sistema se organiza

O nx-control-erp é um sistema de gestão para empresas do agronegócio: financeiro, controladoria, produção, vendas e relatórios gerenciais. Os dados ficam em dois níveis:

- **Empresa**: a organização como um todo, dona do CNPJ raiz.
- **Filial**: cada unidade operacional da empresa (uma fazenda, um galpão, um escritório regional). A maior parte do trabalho do dia a dia acontece dentro de uma filial. Alguns relatórios, como o Dashboard executivo, juntam os dados de todas as filiais ativas da empresa.

Além da categoria financeira, receitas e despesas podem ser analisadas por dimensões próprias do agronegócio:

- **Safra**: um ciclo de produção, com início e fim próprios, que pode atravessar a virada do ano.
- **Centro de custo** e **Centro de lucro**: onde o dinheiro é gasto e de onde ele vem (a lavoura, a fábrica de polpa, a loja).

## Primeiros acessos

### Login

O acesso é feito por e-mail e senha, na tela inicial. Não há cadastro por conta própria: quem cria os usuários é um Administrador, na tela Administração → Usuários.

### Empresa e filial

Um mesmo usuário pode ter acesso a mais de uma empresa (um contador que atende vários clientes, por exemplo) e, em cada empresa, a mais de uma filial. Por isso, logo após o login o sistema pede a empresa e, em seguida, a filial com que você vai trabalhar. Se você só tem acesso a uma empresa e a uma filial, essas telas aparecem mesmo assim: é só confirmar.

O acesso a cada filial pode ser de **alteração** (cadastrar, editar e aprovar) ou **somente leitura** (só consultar), qualquer que seja o seu perfil. Quem configura é o Administrador, na tela Usuários.

### Navegação

Depois de escolher a empresa e a filial, você chega à primeira tela liberada para o seu perfil. O menu à esquerda lista só as telas que o seu perfil pode abrir, agrupadas por módulo: Financeiro, Controladoria, Produção, Vendas, Cadastros, Administração e Gestão.

No topo ficam sempre a empresa e a filial atuais, o seu nome e perfil, os botões **Trocar empresa** e **Trocar filial** (para mudar sem sair do sistema) e **Sair**.

### Perfis

Cada usuário tem um perfil em cada empresa (Administrador, Financeiro, Tesouraria, Gestor, Auditor, Consulta, Produção ou Vendas), que define o que ele vê e o que pode fazer. O resumo de cada perfil está na ajuda da tela Administração → Usuários.

## Glossário

- **Empresa**: A organização como um todo, dona do CNPJ raiz. Pode ter várias filiais.
- **Filial**: Unidade operacional de uma empresa. A maior parte dos cadastros e lançamentos pertence a uma filial específica.
- **Título**: Um documento a pagar ou a receber (uma nota fiscal, por exemplo), composto por uma ou mais parcelas.
- **Parcela**: Uma cobrança individual dentro de um título, com vencimento e valor próprios.
- **Baixa**: O registro de um pagamento ou recebimento de uma parcela. Precisa ser aprovada para gerar o lançamento bancário.
- **Lançamento bancário**: Um movimento de entrada ou saída em uma conta bancária. Pode vir de uma baixa aprovada, ser lançado manualmente ou vir de uma transferência.
- **Rasa**: Unidade comercial do açaí: 1 rasa = 14 kg. O sistema converte para kg sozinho.
- **Lote**: Uma quantidade de fruto ou polpa com número próprio, validade e saldo. Cada recepção cria um lote.
- **FEFO**: "Primeiro que vence, primeiro que sai": as listas de lotes vêm em ordem de validade.
- **Margem**: Valor da venda menos o custo dos lotes vendidos (custo do lote × kg). A margem % é a margem dividida pelo valor.
- **Retira na propriedade**: O cliente busca a mercadoria; o pedido não gera entrega.
- **Conciliação**: O processo de casar as linhas do extrato bancário com os lançamentos já registrados no sistema.
- **Safra**: Um ciclo de produção agrícola, com período próprio de início e fim.
- **Centro de custo / Centro de lucro**: Dimensões para agrupar despesas e receitas além da categoria financeira.
- **Aging**: Distribuição dos valores em aberto por faixa de dias de atraso (ou a vencer).
- **Fiscal / Gerencial**: Classificação de títulos e lançamentos: Fiscal tem documento fiscal ou oficial; Gerencial é negociação sem nota, controlada só internamente.
- **Pendência fiscal**: Título fiscal ainda sem tipo de documento, número da nota, chave de acesso ou anexo. Não bloqueia nada: é um lembrete para completar o cadastro.
- **Chave de acesso**: Código de 44 dígitos que identifica uma NF-e, NFC-e ou CT-e, impresso no DANFE.
- **Auditoria**: Registro automático de quem alterou o quê e quando, em todo o sistema.
