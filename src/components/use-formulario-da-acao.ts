"use client";

import { startTransition, useActionState, useEffect, useRef, type FormEvent } from "react";
import { deveLimparFormulario } from "@/lib/formularioDaAcao";

/**
 * `useActionState` para formulário que não perde o digitado quando o servidor recusa (item 65 do backlog).
 *
 * Com `<form action={...}>`, o React 19 limpa o formulário ao fim de todo envio, inclusive com erro: o campo que a
 * pessoa mudou volta ao valor inicial sem ela perceber. Aqui o envio vai pelo `onSubmit` (use
 * `<form onSubmit={formAction}>`), e o formulário só é limpo quando não há `erro` no estado devolvido. A limpeza
 * espera o estado novo chegar à tela, junto com a página revalidada: assim volta aos valores já salvos, não aos de
 * antes. Mesma forma de retorno do `useActionState`.
 */
export function useFormularioDaAcao<S>(
  action: (anterior: Awaited<S>, dados: FormData) => S | Promise<S>,
  estadoInicial: Awaited<S>,
) {
  const formulario = useRef<HTMLFormElement | null>(null);
  const limparQuandoAtualizar = useRef(false);
  const [state, despachar, pendente] = useActionState<S, FormData>(async (anterior, dados) => {
    const resultado = await action(anterior, dados);
    limparQuandoAtualizar.current = deveLimparFormulario(resultado);
    return resultado;
  }, estadoInicial);

  useEffect(() => {
    if (!limparQuandoAtualizar.current) return;
    limparQuandoAtualizar.current = false;
    formulario.current?.reset();
  }, [state]);

  function formAction(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    formulario.current = evento.currentTarget;
    // O botão clicado vai junto, como no envio nativo (formulário com mais de um botão de enviar).
    const botao = (evento.nativeEvent as SubmitEvent).submitter;
    const dados = new FormData(evento.currentTarget, botao);
    startTransition(() => despachar(dados));
  }

  return [state, formAction, pendente] as const;
}
