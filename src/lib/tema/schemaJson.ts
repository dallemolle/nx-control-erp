import { z } from "zod";
import { temaSchema } from "./schema";

/** Conteúdo de public/temas/nx-tema.schema.json, gerado do temaSchema (formato de entrada). */
export function schemaJsonDoTema(): string {
  const schema = z.toJSONSchema(temaSchema, { io: "input" });
  return `${JSON.stringify(
    { ...schema, title: "nx-tema v1", description: "Tema por empresa do NX Control (docs/temas/README.md)." },
    null,
    2,
  )}\n`;
}
