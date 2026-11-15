// Gera public/temas/nx-tema.schema.json a partir do temaSchema. Uso: npm run tema:schema
import { writeFileSync } from "node:fs";
import { schemaJsonDoTema } from "../src/lib/tema/schemaJson";

writeFileSync("public/temas/nx-tema.schema.json", schemaJsonDoTema());
console.log("public/temas/nx-tema.schema.json gerado");
