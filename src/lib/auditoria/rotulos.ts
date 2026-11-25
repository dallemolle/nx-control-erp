/**
 * Rótulos da Auditoria: o banco guarda a entidade e a ação como código (`CategoriaFinanceira`, `CONCILIAR_GRUPO`), e
 * a tela, os filtros e o export mostram o nome em português. Código sem rótulo aparece como está, para não sumir
 * nada. Registrou uma entidade ou ação nova em `registrarAuditoria`? Ponha o rótulo aqui; o teste confere.
 */

export const ROTULOS_ENTIDADE_AUDITORIA: Readonly<Record<string, string>> = {
  AjusteEstoque: "Ajuste de estoque",
  Anexo: "Anexo",
  ApiKey: "Chave de API",
  Baixa: "Baixa",
  Banco: "Banco",
  CategoriaFinanceira: "Categoria financeira",
  CenarioEstrategico: "Cenário estratégico",
  CentroCusto: "Centro de custo",
  CentroLucro: "Centro de lucro",
  Cliente: "Cliente",
  Conciliacao: "Conciliação",
  ConfiguracaoProducao: "Configuração de produção",
  ContaBancaria: "Conta bancária",
  Empresa: "Empresa",
  Entrega: "Entrega",
  ExtratoImportado: "Extrato importado",
  Filial: "Filial",
  Fornecedor: "Fornecedor",
  Fruta: "Fruta",
  GrupoConciliacao: "Conciliação em grupo",
  Insumo: "Insumo",
  LancamentoBancario: "Lançamento bancário",
  LocalArmazenamento: "Local de armazenamento",
  Lote: "Lote",
  OperadoraCartao: "Operadora de cartão",
  Orcamento: "Orçamento",
  OrcamentoSafra: "Orçamento da safra",
  OrdemProducao: "Ordem de produção",
  Parcela: "Parcela",
  PedidoVenda: "Pedido de venda",
  Produto: "Produto",
  Projeto: "Projeto",
  RecepcaoFruto: "Recepção de fruto",
  Safra: "Safra",
  SaldoBancarioInformado: "Saldo bancário informado",
  Talhao: "Talhão",
  Titulo: "Título",
  UsuarioEmpresa: "Usuário",
  UsuarioEmpresaFilial: "Acesso à filial",
};

export const ROTULOS_ACAO_AUDITORIA: Readonly<Record<string, string>> = {
  ADICIONAR_CONSUMO: "Adicionar consumo",
  ADICIONAR_INSUMO: "Adicionar insumo",
  ADICIONAR_PRODUCAO: "Adicionar produção",
  APROVAR: "Aprovar",
  ATUALIZAR: "Atualizar",
  ATUALIZAR_MARCA: "Atualizar tema e marca",
  CANCELAR: "Cancelar",
  CONCILIAR: "Conciliar",
  CONCILIAR_AUTOMATICO: "Conciliar automaticamente",
  CONCILIAR_GRUPO: "Conciliar em grupo",
  CONFIRMAR_REPASSE: "Confirmar repasse",
  CRIAR: "Criar",
  CRIAR_LANCAMENTO_E_CONCILIAR: "Criar lançamento e conciliar",
  DESCONCILIAR: "Desconciliar",
  DESFAZER_REPASSE: "Desfazer repasse",
  DISPENSAR_REJEICAO: "Dispensar rejeição",
  ENCERRAR: "Encerrar",
  ESTORNAR: "Estornar",
  IMPORTAR: "Importar",
  IMPORTAR_TEMA: "Importar tema",
  INATIVAR: "Inativar",
  LIBERAR_VENCIDO: "Liberar vencido",
  MOVER: "Mover de local",
  REABRIR: "Reabrir",
  REATIVAR: "Reativar",
  RECLASSIFICAR: "Reclassificar",
  REJEITAR: "Rejeitar",
  REMOVER: "Remover",
  REMOVER_CONSUMO: "Remover consumo",
  REMOVER_INSUMO: "Remover insumo",
  REMOVER_PRODUCAO: "Remover produção",
  RENEGOCIAR: "Renegociar",
  RESTAURAR_TEMA: "Restaurar tema padrão",
  REVOGAR: "Revogar",
  REVOGAR_LIBERACAO: "Revogar liberação",
  TRANSFERIR: "Transferir",
};

export function rotuloEntidadeAuditoria(codigo: string): string {
  return Object.hasOwn(ROTULOS_ENTIDADE_AUDITORIA, codigo) ? ROTULOS_ENTIDADE_AUDITORIA[codigo] : codigo;
}

export function rotuloAcaoAuditoria(codigo: string): string {
  return Object.hasOwn(ROTULOS_ACAO_AUDITORIA, codigo) ? ROTULOS_ACAO_AUDITORIA[codigo] : codigo;
}
