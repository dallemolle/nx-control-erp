"use client";

import { useActionState, useState } from "react";

/**
 * `useActionState` de um formulário em diálogo que fecha o diálogo a cada
 * salvamento bem-sucedido. O fechamento acontece dentro da própria action (em
 * vez de um `useEffect` observando `state.sucesso`), então também fecha no
 * segundo salvamento seguido — quando `sucesso` já era `true` e um efeito não
 * dispararia de novo.
 */
export function useAcaoDoDialogo<S extends { sucesso?: boolean }>(
  action: (anterior: S, dados: FormData) => Promise<S>,
  estadoInicial: S,
) {
  const [aberto, setAberto] = useState(false);
  // Os estados dos formulários são objetos simples (nunca Promise), então
  // `Awaited<S>` é o próprio `S` — o TS só não consegue provar isso para um genérico.
  const [state, formAction, pendente] = useActionState<S, FormData>(
    async (anterior, dados) => {
      const resultado = await action(anterior as S, dados);
      if (resultado.sucesso) setAberto(false);
      return resultado;
    },
    estadoInicial as Awaited<S>,
  );
  return { aberto, setAberto, state, formAction, pendente };
}
