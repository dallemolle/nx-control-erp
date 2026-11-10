# Manual de uso — nx-control-erp

Sistema de gestão financeira e controladoria para o agronegócio.

## 1. Introdução

O nx-control-erp é um sistema de gestão financeira voltado para empresas do agronegócio, com controle de contas a pagar e a receber, conciliação bancária, fluxo de caixa, orçamento e relatórios gerenciais. O sistema organiza os dados em dois níveis: **Empresa** (a organização como um todo, dona do CNPJ raiz) e **Filial** (cada unidade operacional da empresa — uma fazenda, um escritório regional etc.). A maior parte do trabalho do dia a dia acontece dentro de uma filial específica; alguns relatórios (como o Dashboard executivo) consolidam automaticamente os dados de todas as filiais ativas da empresa.

O sistema também reconhece dimensões próprias do agronegócio, como **Safra** (um ciclo de produção, com data de início e fim próprias, podendo atravessar a virada do ano civil) e **Centro de custo/Centro de lucro**, permitindo analisar receitas e despesas por essas dimensões, além da categoria financeira tradicional.

### Como este manual está organizado

Os capítulos seguem a mesma organização do menu lateral do sistema: Financeiro, Controladoria, Cadastros, Administração e Gestão. Cada seção explica o que a tela faz, os principais campos e ações disponíveis, e qualquer regra de negócio relevante para o dia a dia.

## 2. Primeiros acessos

### 2.1. Login

O acesso ao sistema é feito por e-mail e senha, na tela inicial. Não há cadastro de usuário autoatendido: novos usuários são criados por um Administrador na tela Usuários (capítulo 6.3).

### 2.2. Seleção de empresa e filial

Um mesmo usuário pode ter acesso a mais de uma empresa (por exemplo, um contador que atende vários clientes) e, dentro de cada empresa, a mais de uma filial. Por isso, logo após o login o sistema pede para escolher a empresa e, em seguida, a filial com a qual você vai trabalhar nesta sessão. Se você só tem acesso a uma empresa e uma filial, essas telas aparecem mesmo assim — é só confirmar.

> O acesso a cada filial pode ser "Alteração" (o usuário pode cadastrar, editar e aprovar) ou "Somente leitura" (o usuário só consulta). Isso é configurado por um Administrador na tela Usuários.

### 2.3. Navegação

Depois de escolher a empresa e a filial, você chega à primeira tela liberada para o seu perfil. O menu à esquerda lista todas as telas que seu perfil pode acessar, agrupadas por módulo (Financeiro, Controladoria, Produção, Cadastros, Administração, Gestão). No topo da tela ficam sempre visíveis: a empresa e filial atuais, seu nome e perfil, os botões "Trocar empresa"/"Trocar filial" (para mudar de contexto sem precisar sair e entrar de novo) e "Sair".

### 2.4. Perfis de usuário e permissões

Cada vínculo de usuário com uma empresa tem um perfil, que determina o que a pessoa pode ver e fazer. Os oito perfis existentes:

| Perfil | O que pode fazer |
|---|---|
| Administrador | Acesso completo a tudo — cadastros, lançamentos, aprovações, relatórios, gestão de usuários/empresas/filiais e auditoria. |
| Financeiro | Cadastra e edita títulos a pagar/receber, registra baixas (pagamentos/recebimentos) e cadastros auxiliares. Não aprova baixas nem acessa auditoria. |
| Tesouraria | Aprova ou rejeita baixas registradas pelo Financeiro, e cuida da tesouraria (lançamentos manuais, transferências entre contas, saldo bancário). |
| Gestor | Acesso de leitura aos relatórios gerenciais — Dashboard executivo, auditoria — para acompanhar o negócio sem operar o dia a dia financeiro. |
| Auditor | Acesso de leitura à auditoria e ao dashboard executivo, para revisão e conformidade. |
| Consulta | Acesso de leitura às telas operacionais, sem poder cadastrar, editar ou aprovar nada. |
| Produção | Pessoal do galpão: cadastra frutas, produtos, insumos, talhões e locais de armazenamento, lança a recepção de fruto e os ajustes de estoque e imprime etiquetas. Nas próximas versões, também o processamento. Não acessa o financeiro (a conta a pagar da compra de fruto é criada pela própria recepção). |
| Vendas | Cadastra e edita clientes. Nas próximas versões, também lança pedidos e entregas. Não acessa o financeiro. |

> Além do perfil, cada acesso a uma filial específica pode ser "somente leitura", independentemente do perfil — ou seja, mesmo um Financeiro pode ficar restrito a só consultar uma determinada filial, se assim for configurado.

## 3. Financeiro

### 3.1. Contas a pagar e Contas a receber

As telas Contas a pagar e Contas a receber funcionam de forma idêntica, mudando só o tipo de título e a contraparte (fornecedor de um lado, cliente do outro). Cada título pode ter uma ou mais parcelas, cada uma com seu próprio vencimento e valor. A lista mostra um título por linha; clicar na linha expande e mostra as parcelas dele, com as ações disponíveis para cada uma.

**Cadastrando um novo título**

O botão "Novo título a pagar"/"Novo título a receber" abre um formulário para o cabeçalho do título (fornecedor/cliente, documento, datas de emissão e competência, categoria financeira e, opcionalmente, centro de custo, centro de lucro, safra, projeto e conta bancária) e para as parcelas (número, vencimento e valor de cada uma).

**Filtros**

As duas telas têm uma barra de filtros combináveis por categoria, fornecedor/cliente, centro de custo, centro de lucro, safra, projeto, status da parcela e período de vencimento. Os filtros podem ser usados juntos (por exemplo: só parcelas vencidas da categoria "Insumos Agrícolas") e o botão "Limpar filtros" volta a lista ao estado sem filtro nenhum.

**Importação de títulos via CSV**

O botão "Importar CSV" permite cadastrar vários títulos de uma vez a partir de uma planilha exportada de outro sistema, sem precisar digitar cada um manualmente.

**Exportação**

Os links "Exportar CSV", "Exportar Excel" e "Exportar PDF", no topo da tela, geram um arquivo com uma linha por parcela (documento, contraparte, categoria, número da parcela, vencimento, valor atualizado e status). O arquivo exportado respeita os filtros que estiverem ativos na tela no momento — ou seja, se você filtrar por um fornecedor e exportar, o arquivo traz só as parcelas daquele fornecedor.

O PDF é pensado para imprimir ou enviar: sai em A4 deitado, com o nome da empresa e da filial, os filtros aplicados, quem gerou e o número de cada página. CSV e Excel são melhores para fazer contas na planilha. Os mesmos três formatos aparecem em todos os relatórios que têm exportação (fluxo de caixa, orçamento, conciliação, auditoria etc.).

**Ações sobre uma parcela**

- **Baixar**: registra o pagamento/recebimento da parcela (ver seção 3.2).
- **Alterar vencimento**: muda a data de vencimento de uma parcela em aberto.
- **Renegociar**: substitui uma parcela vencida por uma ou mais parcelas novas, com vencimentos e valores renegociados.
- **Cancelar**: encerra a parcela sem pagamento (uso para títulos que não serão mais cobrados/pagos).

> Renegociar e cancelar são operações finais: uma parcela renegociada ou cancelada não pode receber baixa nem ser renegociada de novo.

**Lançamentos fiscais e gerenciais**

Todo título é classificado como **Fiscal** (tem documento fiscal ou oficial: NF-e, NFS-e, nota do produtor, guia de tributo, tarifa bancária, contrato…) ou **Gerencial** (negociação sem nota, com pequenos clientes ou fornecedores, controlada só internamente — com recibo, pedido interno ou sem comprovante). A classificação aparece como uma etiqueta "Fiscal"/"Gerencial" ao lado do documento na lista.

- No formulário do título, a seção **Documento fiscal** tem a classificação, o tipo de comprovante (a lista muda conforme a classificação) e, para notas, número, série, data de emissão e chave de acesso. A chave de 44 dígitos pode ser colada do DANFE com espaços; o sistema confere o dígito verificador.
- Para quem nunca emite nota, configure no cadastro do fornecedor/cliente a **Classificação padrão dos títulos** = Gerencial: os títulos novos daquele parceiro já vêm marcados assim.
- O título fiscal pode ser salvo sem o número da nota (ela pode chegar depois). Enquanto faltar tipo de documento, número, chave ou anexo, ele aparece com um ícone de alerta na lista e na tela **Controladoria → Fiscal × gerencial**, em "Pendências fiscais".
- A mesma nota não pode ser lançada duas vezes na filial (mesma chave de acesso, ou mesmo parceiro + tipo + série + número).
- **Mudar a classificação** de um título já salvo pede um motivo, que fica registrado na auditoria. Os lançamentos bancários das baixas já aprovadas daquele título acompanham a mudança.
- Títulos cadastrados antes deste recurso foram marcados como Fiscal. Os que na verdade são gerenciais devem ser reclassificados pela edição do título.

A barra de filtros tem o filtro **Classificação** (Todas / Fiscal / Gerencial), que também vale para a exportação. Na importação via CSV, as colunas `classificacaoFiscal`, `tipoComprovante`, `numeroDocumentoFiscal`, `serieDocumentoFiscal` e `chaveAcesso` são opcionais — planilhas antigas continuam funcionando.

### 3.2. Aprovações pendentes

Quando alguém do perfil Financeiro registra uma baixa (pagamento ou recebimento) em uma parcela, ela não é efetivada na hora — fica pendente de aprovação. Esta tela lista todas as baixas aguardando aprovação da filial atual, com o valor pago, quem registrou, e os botões Aprovar/Rejeitar.

Aprovar uma baixa efetiva o pagamento: gera automaticamente um lançamento bancário (entrada ou saída, conforme o tipo do título) na conta bancária informada, e atualiza o status da parcela. Rejeitar exige informar um motivo (por exemplo, duplicidade de nota fiscal) e devolve a parcela para o estado anterior, sem gerar lançamento nenhum.

> Só os perfis Administrador e Tesouraria veem e podem agir nesta tela.

### 3.3. Tesouraria

A tela de Tesouraria mostra o saldo contábil de cada conta bancária da filial e permite três operações que não passam pelo fluxo de título/baixa: lançamento manual (uma entrada ou saída avulsa, como uma tarifa bancária ou uma venda de sucata), transferência entre contas da mesma filial, e informar o saldo bancário (para conferência com o extrato do banco).

O lançamento manual também é classificado como Fiscal (padrão) ou Gerencial, com o tipo e o número do comprovante. Transferências entre contas não têm classificação — não são receita nem despesa. A lista de lançamentos tem o filtro Todos / Fiscal / Gerencial.

**Dinheiro em espécie (conta Caixa).** Pagamentos e recebimentos em dinheiro vão para uma conta do tipo Caixa (cadastrada em Contas bancárias). Lançamentos manuais, transferências e baixas aprovadas numa conta Caixa já entram conciliados, porque dinheiro não tem extrato: aparecem na hora no fluxo de caixa, no dashboard e no orçamento. Um saque do banco para o caixa é uma transferência: o lado do caixa já entra conciliado, e o lado do banco espera o extrato, como sempre. Para conferir o caixa físico, conte o dinheiro e use "Informar saldo" na conta Caixa: a Tesouraria mostra a diferença entre o saldo contado e o saldo do sistema.

### 3.4. Conciliação bancária

A conciliação bancária cruza o extrato real do banco com os lançamentos já registrados no sistema, para confirmar que tudo que aconteceu na conta bancária tem um lançamento correspondente. O fluxo é: importar o extrato (arquivo OFX exportado do banco), o sistema tenta casar automaticamente cada linha do extrato com um lançamento existente (por valor e data), e o que não casar automaticamente fica disponível para revisão manual.

**Status de uma linha do extrato**

| Status | Significado |
|---|---|
| Conciliado | A linha já está vinculada a um lançamento bancário do sistema. |
| Sugestão | O sistema encontrou um lançamento provável, mas ainda não foi confirmado — a ação "Criar lançamento" ou a confirmação manual resolve isso. |
| Não conciliado | Nenhum lançamento correspondente foi encontrado; normalmente precisa criar um lançamento manual para essa linha. |

O botão "Reconciliar pendentes" reprocessa todas as linhas ainda não conciliadas da filial — útil quando um lançamento que faltava for cadastrado depois da importação do extrato. "Desconciliar" desfaz um vínculo já confirmado, caso tenha sido feito por engano.

### 3.5. Fluxo de caixa

Mostra, por período (dia, semana, mês ou ano), o saldo inicial, entradas, saídas, geração de caixa (entradas menos saídas) e saldo final — tudo a partir dos lançamentos bancários já conciliados. É o retrato do que já aconteceu na conta bancária, período a período, com navegação para períodos anteriores/seguintes.

O seletor **Todos / Fiscal / Gerencial** mostra só o movimento de uma classificação. Nessa visão as colunas de saldo viram **Acumulado** (começam em zero), porque o saldo do banco é um só e não se divide entre fiscal e gerencial; transferências entre contas também ficam de fora. O mesmo seletor existe no fluxo de caixa projetado, no fluxo estratégico, no orçamento, no fluxo por dimensão e na comparação entre safras (nesses dois últimos, o orçado não muda com o filtro).

### 3.6. Fluxo de caixa projetado

Complementa o fluxo de caixa realizado com uma projeção de 12 meses (ou por ano civil) baseada nos títulos a pagar e a receber já cadastrados e ainda em aberto — ou seja, mostra para onde o saldo em caixa tende a ir, não só onde já esteve. A projeção parte do saldo em caixa de hoje e soma/subtrai as parcelas previstas mês a mês. Um saldo final negativo em algum mês aparece destacado.

### 3.7. Fluxo de caixa estratégico

Projeta os próximos anos da empresa (consolidando todas as filiais) a partir de três cenários com premissas próprias: crescimento de receita, crescimento de custos, percentual de investimento (capex) sobre a receita, novo endividamento anual e taxa de juros. Os três cenários — base, otimista e pessimista — podem ser ajustados livremente, para enxergar o efeito de diferentes hipóteses de negócio nos próximos anos.

Com o seletor **Fiscal** ou **Gerencial**, a receita e os custos do ano-base passam a ser só daquela classificação e a linha de saldo vira **Acumulado de caixa**, partindo de zero: mostra quanto aquela parte do negócio gera de caixa nos próximos anos. As premissas dos cenários são as mesmas nas três visões.

> Esta é a única tela financeira que já mostra o dado consolidado de toda a empresa, não só da filial atual.

## 4. Controladoria

### 4.1. Orçamento

Permite definir, mês a mês, o valor orçado para cada categoria financeira do ano, e compara automaticamente com o realizado (o que já aconteceu, via lançamentos conciliados) e o projetado (o que ainda está previsto, via títulos em aberto), mostrando a variação absoluta e percentual entre orçado e o restante. Categorias de despesa que ultrapassarem o orçado aparecem destacadas como alerta de estouro.

### 4.2. Fluxo de caixa por dimensão

O mesmo tipo de relatório do fluxo de caixa, mas agrupado por uma dimensão analítica em vez de por período — centro de custo, centro de lucro, safra ou projeto, à escolha. Útil para responder perguntas como "quanto entrou e saiu na Lavoura A este mês" em vez de "quanto entrou e saiu na empresa toda".

### 4.3. Comparação entre safras

Permite orçar um valor único por safra (sem grade mensal, já que cada safra tem seu próprio período de início e fim) e comparar entre todas as safras cadastradas — planejadas, em andamento ou já encerradas — o orçado, o realizado e o projetado de cada uma.

### 4.4. Fiscal × gerencial

Mostra, para a filial atual e o ano escolhido, quanto do movimento tem documento fiscal e quanto é negociado sem nota: entradas e saídas realizadas por mês (com o percentual gerencial), o que está em aberto hoje a pagar e a receber em cada classificação, os parceiros com maior valor em títulos gerenciais e a lista de **pendências fiscais** — títulos fiscais ainda sem tipo de documento, número, chave de acesso ou anexo. Clicar no documento leva à lista de títulos já filtrada pelo parceiro. Os dois relatórios (comparativo mensal e pendências) podem ser exportados em CSV, Excel ou PDF.

## 5. Produção

O módulo de produção substitui a planilha de controle da agroindústria. Antes de começar, faça os cadastros de produção (seção 6.6) e, em Administração → Configuração de produção, escolha a **categoria de compra de fruto** e o **prazo de pagamento ao produtor**.

### 5.1. Recepção de fruto

Cada carga de fruto recebida vira um **lote**. Em Produção → Recepção de fruto → **Nova recepção**, informe:

- data e produto (só fruto);
- **origem**: *comprado de terceiro* (escolha o fornecedor) ou *colhido nos talhões próprios* (escolha o talhão, que precisa ser da mesma fruta);
- peso bruto e descarte da triagem, em **kg ou na unidade comercial** do produto (para o açaí, rasa de 14 kg), e o preço (por kg ou por rasa) quando for compra;
- local, qualidade (A, B, C), romaneio/NF, safra e observação, se quiser.

O quadro de resumo mostra na hora o peso líquido, o % de descarte, o preço por kg, o valor e a validade. O **número do lote** (ex.: FA-261109-01: código do produto, data e sequência do dia) é gerado ao salvar e nunca muda. Depois de salvar aparece o link **Imprimir etiqueta**.

- **Compra de terceiro** com valor maior que zero cria automaticamente uma **conta a pagar** ao fornecedor, com vencimento na data + prazo configurado (pode ser mudado na recepção). Se o produtor emitiu nota, escolha *Fiscal* e informe o número da nota; sem nota, a conta fica *Gerencial* com recibo. O pagamento continua sendo registrado pelo financeiro.
- **Fruto próprio** entra com o custo-padrão da fruta (cadastro de Frutas) e não gera conta a pagar.

**Corrigir uma recepção:** qualidade, documento e observação podem ser editados a qualquer momento. Para corrigir peso, preço, produto ou origem, use **Excluir** e lance de novo. A exclusão só é possível enquanto o lote não teve saída (ajuste, venda ou processamento) e a conta a pagar não foi paga. O lote excluído fica zerado e o número dele não é reaproveitado.

### 5.2. Estoque

Mostra os lotes com saldo, em ordem de validade (o que vence primeiro aparece primeiro). Cada lote tem um status:

| Status | Quando |
|---|---|
| OK | Dentro da validade. |
| Vencendo | Faltam poucos dias: até 30 para congelado e até 1 para in natura e resfriado (ajustável na configuração). |
| Vencido | Passou da validade. |
| Zerado | Sem saldo. |

Filtre por produto, local e status, ou mude a **data de referência** para ver como estava (ou estará) o estoque em outro dia. A aba **Por produto e local** soma o saldo e o valor a custo, e mostra a ocupação de cada local que tem capacidade cadastrada. O botão **Mover** troca o local do lote inteiro.

### 5.3. Ajustes de estoque

Use para tudo que sai ou entra no estoque sem ser recepção ou venda: lote vencido, avaria/quebra, amostra para a ADEPARA ou laboratório, consumo interno ou acerto de inventário. Escolha o lote (a lista vem em ordem de validade, com o saldo de cada um), se é saída ou entrada, a quantidade em kg e o motivo. Uma saída maior que o saldo do lote é recusada. Só o Administrador e o perfil Produção lançam ajustes.

### 5.4. Etiqueta do lote

Em PDF de 100 × 70 mm, pronta para imprimir: empresa, produto, lote, data de recepção ou fabricação, validade, peso líquido, conservação e o registro ADEPARA da filial. Abre pelo botão **Etiqueta** na recepção e no estoque.

## 6. Cadastros

Os cadastros auxiliares alimentam os formulários de título e lançamento em todo o sistema. Clientes, Fornecedores, Frutas, Produtos e Insumos pertencem à empresa (são compartilhados entre todas as filiais); os demais cadastros desta seção pertencem à filial atual.

### 6.1. Clientes e Fornecedores

Cadastro de nome, CNPJ/CPF, contato e, opcionalmente, dados bancários para pagamento (PIX ou depósito bancário). São usados como contraparte dos títulos a receber (clientes) e a pagar (fornecedores). A **Classificação padrão dos títulos** (Nenhuma, Fiscal ou Gerencial) pré-preenche a classificação dos títulos novos daquele parceiro — use Gerencial para quem não emite nota.

No cliente, o **CNPJ/CPF é opcional**: deixe em branco para consumidor final ou "Clientes diversos" (quando preenchido, não pode repetir). A seção **Vendas** do cliente guarda o canal de venda, o município, o endereço de entrega e se o cliente **retira na propriedade** (nesse caso o pedido não gera entrega). Além do Administrador, Financeiro e Tesouraria, o perfil Vendas também pode cadastrar e editar clientes.

### 6.2. Categorias financeiras

Classificam cada título/lançamento como Receita ou Despesa, com hierarquia opcional (uma categoria pode ter uma categoria "pai", para agrupar categorias relacionadas em relatórios).

### 6.3. Centros de custo e Centros de lucro

Dimensões analíticas opcionais para títulos e lançamentos, usadas nos relatórios de fluxo de caixa por dimensão e no dashboard executivo. Centro de custo tem hierarquia própria (pode agrupar sub-centros); centro de lucro não.

### 6.4. Safras e Projetos

Safra representa um ciclo de produção, com data de início e fim próprias (podendo atravessar a virada do ano civil) e status (Planejado, Em andamento, Encerrado). Projeto é uma dimensão livre para acompanhar iniciativas específicas (por exemplo, uma obra de irrigação), com código e status próprios.

### 6.5. Bancos e Contas bancárias

Bancos é uma lista de referência (código e nome do banco). Contas bancárias pertencem à filial e trazem agência, conta, tipo (corrente, aplicação, investimento, empréstimo/financiamento ou caixa), moeda e saldo inicial — é a partir daqui que as baixas, lançamentos e conciliação bancária operam.

O tipo **Caixa (dinheiro em espécie)** é para o dinheiro guardado na empresa. Ele não pede banco nem agência: basta uma identificação (por exemplo, "Escritório" ou "Fazenda"), e dá para ter mais de um caixa. Uma conta Caixa não aparece na importação de extrato. Uma conta só pode mudar de ou para o tipo Caixa enquanto não tiver lançamentos.

### 6.6. Cadastros de produção

Base para a recepção de fruto, o processamento e as vendas por lote, que chegam nas próximas versões. Podem ser editados pelo Administrador e pelo perfil Produção. Cadastre nesta ordem:

1. **Frutas** (da empresa): nome, **custo-padrão do fruto próprio** (R$/kg, usado no custo e na margem do fruto colhido nos talhões; deixe 0 se ainda não souber) e se a fruta **exige branqueamento** no processamento (o açaí exige).
2. **Produtos** (da empresa): código, descrição, fruta, categoria (fruto ou polpa), conservação (in natura, resfriado ou congelado), validade em dias, preço de referência e texto de armazenamento da etiqueta. O **código** (ex.: FA, AGC) vira o início do número de lote (FA-260927-01). A **unidade comercial** é opcional: para o açaí, "rasa = 14 kg" permite lançar quantidade e preço por rasa.
3. **Talhões** (da filial): áreas de cultivo próprias, com cultura, área (ha) e ano de plantio. São a origem do fruto colhido.
4. **Locais de armazenamento** (da filial): câmaras, freezers e áreas de recepção, com temperatura e capacidade (opcional, usada para mostrar a ocupação no estoque).
5. **Insumos** (da empresa): embalagens, energia e mão de obra, com unidade e custo unitário de referência.

## 7. Administração

### 7.1. Empresas

Cadastro das empresas atendidas pelo sistema. Ao criar uma empresa, o sistema já cria automaticamente uma filial "Matriz" e vincula quem criou como Administrador dela.

### 7.2. Filiais

Cadastro das filiais (unidades operacionais) de cada empresa. Cada filial tem seu próprio conjunto de cadastros (categorias, centros de custo/lucro, safras, projetos, contas bancárias) e seus próprios títulos e lançamentos.

### 7.3. Usuários

Um Administrador cadastra aqui os usuários da empresa, define o perfil de cada um (seção 2.4) e concede ou remove o acesso a cada filial individualmente, incluindo se o acesso é de alteração ou somente leitura.

**Chaves de API**

Cada usuário também pode ter uma ou mais chaves de API, usadas para autenticar chamadas na API REST do sistema — útil para automações e integrações externas. Ao gerar uma chave, o Administrador escolhe um nome para identificá-la; a chave completa só é mostrada uma única vez, no momento da criação, e depois disso só o prefixo fica visível, junto com a data de criação e a do último uso. Uma chave pode ser revogada a qualquer momento, e chaves de usuários inativos param de funcionar automaticamente.

### 7.4. Auditoria

Registra automaticamente toda alteração relevante feita no sistema — quem fez, quando, em qual filial, o que mudou (valor anterior e valor novo). A tela permite filtrar por entidade (o tipo de registro alterado — Título, Baixa, Conciliação etc.), ação (Criar, Atualizar, Aprovar, Rejeitar etc.), usuário, filial e período, com paginação para navegar entre muitos registros.

> Só os perfis Administrador, Gestor e Auditor têm acesso a esta tela.

### 7.5. Configuração de produção

Parâmetros da filial atual usados pela produção: registro na ADEPARA (vai para a etiqueta do lote), com quantos dias de antecedência um lote congelado ou resfriado aparece como "vencendo", temperatura e tempo mínimos do branqueamento, e a tolerância do balanço de massa (em %). Enquanto nada for salvo, valem os padrões: 30 dias (congelado), 1 dia (in natura e resfriado), 80 °C, 10 segundos e 3%. Só o Administrador altera esta tela.

## 8. Gestão

### 8.1. Dashboard executivo

Visão consolidada das filiais ativas da empresa, pensada para quem acompanha o negócio como um todo (Administrador, Gestor, Auditor). Reúne os principais indicadores financeiros (caixa disponível, contas a pagar/receber em aberto, inadimplência, geração de caixa do mês, obrigações dos próximos 7/30 dias, recebimentos esperados e saldo projetado), um bloco **Fiscal × gerencial** do mês (entradas fiscais e gerenciais, percentual gerencial e número de pendências fiscais) e três gráficos: entradas x saídas dos últimos 6 meses, evolução do saldo, e aging (distribuição por faixa de atraso/vencimento) das contas a pagar e a receber.

Filiais desativadas não entram nesses números (nem no Fluxo de caixa estratégico). Se alguma delas ainda tiver parcelas em aberto ou saldo em caixa, um aviso no topo da tela mostra quais e quanto — para tratar essas pendências, um administrador pode reativar a filial em Administração → Filiais.

## 9. Glossário

| Termo | Significado |
|---|---|
| Empresa | A organização como um todo, dona do CNPJ raiz. Pode ter várias filiais. |
| Filial | Unidade operacional de uma empresa. A maior parte dos cadastros e lançamentos pertence a uma filial específica. |
| Título | Um documento a pagar ou a receber (uma nota fiscal, por exemplo), composto por uma ou mais parcelas. |
| Parcela | Uma cobrança individual dentro de um título, com vencimento e valor próprios. |
| Baixa | O registro de um pagamento ou recebimento de uma parcela — precisa ser aprovada para gerar o lançamento bancário. |
| Lançamento bancário | Um movimento de entrada ou saída em uma conta bancária — pode vir de uma baixa aprovada, ser lançado manualmente, ou vir de uma transferência. |
| Rasa | Unidade comercial do açaí: 1 rasa = 14 kg. O sistema converte para kg sozinho. |
| Lote | Uma quantidade de fruto ou polpa com número próprio, validade e saldo. Cada recepção cria um lote. |
| FEFO | "Primeiro que vence, primeiro que sai": as listas de lotes vêm em ordem de validade. |
| Conciliação | O processo de casar as linhas do extrato bancário real com os lançamentos já registrados no sistema. |
| Safra | Um ciclo de produção agrícola, com período próprio de início e fim. |
| Centro de custo / Centro de lucro | Dimensões analíticas para agrupar receitas e despesas além da categoria financeira. |
| Aging | Distribuição de valores em aberto por faixa de dias de atraso (ou a vencer). |
| Fiscal / Gerencial | Classificação de títulos e lançamentos: Fiscal tem documento fiscal ou oficial; Gerencial é negociação sem nota, controlada só internamente. |
| Pendência fiscal | Título fiscal ainda sem tipo de documento, número da nota, chave de acesso ou anexo. Não bloqueia nada — é um lembrete para completar o cadastro. |
| Chave de acesso | Código de 44 dígitos que identifica uma NF-e, NFC-e ou CT-e, impresso no DANFE. |
| Auditoria (AuditLog) | Registro automático de quem alterou o quê e quando, em todo o sistema. |
