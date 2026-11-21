/**
 * Alvos que cada cena desenha. Os roteiros só podem apontar para estes (ver `construtorDeRoteiros`).
 * Alguns guardam estado: `lista.joana` e `lista.lucia` = "sim" depois de salvas; `lista.perfil-rita` = o perfil da
 * Rita; `lista.pedro` = o status do Pedro (Ativo ou Inativo); `acessos.rita-igarape` e `acessos.rita-igarape-alteracao`
 * = "sim" quando marcados; `chaves.nova` = "sim" depois de gerar; `chaves.antiga` = "Revogada" depois de revogar.
 */
export const ALVOS = {
  lista: [
    "lista.novo",
    "lista.tabela",
    "lista.joana",
    "lista.lucia",
    "lista.perfil-rita",
    "lista.voce",
    "lista.pedro",
    "lista.desativar-pedro",
    "lista.chaves-carlos",
  ],
  novo: [
    "form.email",
    "form.verificar",
    "form.encontrado",
    "form.nome",
    "form.senha",
    "form.perfil",
    "form.acesso",
    "form.alteracao",
    "form.salvar",
  ],
  perfis: ["perfis.tabela", "perfis.producao", "perfis.auditor"],
  acessos: [
    "acessos.secao",
    "acessos.rita-igarape",
    "acessos.rita-igarape-alteracao",
    "acessos.voce-matriz",
    "acessos.joana",
  ],
  chaves: [
    "chaves.nome",
    "chaves.validade",
    "chaves.gerar",
    "chaves.copiar",
    "chaves.nova",
    "chaves.antiga",
    "chaves.revogar",
  ],
} as const;
