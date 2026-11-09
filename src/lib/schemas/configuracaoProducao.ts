import { z } from "zod";
import { textoOpcional } from "./campos";

const dias = z.coerce.number().int("Use dias inteiros").min(0, "Não pode ser negativo");

/** Formulário da configuração: a tolerância é digitada em % e gravada como fração. */
export const configuracaoProducaoSchema = z
  .object({
    registroAdepara: textoOpcional,
    alertaVencimentoCongeladoDias: dias,
    alertaVencimentoResfriadoDias: dias,
    branqueamentoTemperaturaMinC: z.coerce.number().min(0, "Mínimo 0 °C").max(150, "Máximo 150 °C"),
    branqueamentoTempoMinS: z.coerce.number().int("Use segundos inteiros").min(0, "Não pode ser negativo"),
    toleranciaBalancoMassaPercentual: z.coerce.number().min(0, "Mínimo 0%").max(100, "Máximo 100%"),
  })
  .transform(({ toleranciaBalancoMassaPercentual, registroAdepara, ...resto }) => ({
    ...resto,
    registroAdepara: registroAdepara ?? null,
    toleranciaBalancoMassa: toleranciaBalancoMassaPercentual / 100,
  }));
