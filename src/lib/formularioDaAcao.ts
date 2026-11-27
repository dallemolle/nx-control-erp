/**
 * Depois do envio, o formulário só é limpo se o servidor não devolveu erro: com erro, a pessoa corrige o campo
 * apontado sem redigitar os outros (item 65 do backlog).
 */
export function deveLimparFormulario(estado: unknown): boolean {
  if (typeof estado !== "object" || estado === null || !("erro" in estado)) return true;
  return !estado.erro;
}
