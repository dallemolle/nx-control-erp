import { z } from "zod";

/** Formato `nx-tema` v1 (docs/temas/README.md). Campos desconhecidos são recusados em todos os níveis. */

export const PAPEIS_OBRIGATORIOS = [
  "fundo",
  "texto",
  "primaria",
  "textoSobrePrimaria",
  "sidebar",
  "textoSobreSidebar",
] as const;

export const PAPEIS_OPCIONAIS = [
  "cartao",
  "apoio",
  "textoSobreApoio",
  "textoApagado",
  "destaque",
  "textoSobreDestaque",
  "borda",
  "foco",
  "erro",
  "cabecalho",
  "textoCabecalho",
] as const;

const cor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use uma cor no formato #RRGGBB")
  .toLowerCase();

const coresModo = z.strictObject({
  ...Object.fromEntries(PAPEIS_OBRIGATORIOS.map((papel) => [papel, cor])),
  ...Object.fromEntries(PAPEIS_OPCIONAIS.map((papel) => [papel, cor.optional()])),
  graficos: z.tuple([cor, cor, cor, cor, cor]).optional(),
} as {
  [P in (typeof PAPEIS_OBRIGATORIOS)[number]]: typeof cor;
} & {
  [P in (typeof PAPEIS_OPCIONAIS)[number]]: z.ZodOptional<typeof cor>;
} & { graficos: z.ZodOptional<z.ZodTuple<[typeof cor, typeof cor, typeof cor, typeof cor, typeof cor]>> });

const NOME_FONTE = /^[A-Za-z0-9 -]{1,40}$/;

/** Pilha CSS de fontes: só nomes (com ou sem aspas duplas) separados por vírgula. */
const pilha = z
  .string()
  .max(200, "Pilha de fontes com mais de 200 caracteres")
  .refine(
    (valor) =>
      valor.split(",").every((item) => {
        const nome = item.trim();
        const semAspas = nome.startsWith('"') && nome.endsWith('"') && nome.length > 2 ? nome.slice(1, -1) : nome;
        return NOME_FONTE.test(semAspas);
      }),
    "Use só nomes de fonte separados por vírgula (letras, números, espaços e hífen; aspas duplas opcionais)",
  );

const fonte = z.strictObject({
  pilha,
  google: z
    .array(z.string().regex(/^[A-Za-z0-9 ]{1,40}$/, "Nome de fonte do Google: só letras, números e espaços"))
    .max(2, "No máximo 2 fontes do Google por pilha")
    .optional(),
});

const raio = z
  .string()
  .regex(/^\d+(\.\d+)?(px|rem)$/, "Use px ou rem, ex.: 12px")
  .refine((valor) => {
    const numero = parseFloat(valor);
    return valor.endsWith("rem") ? numero <= 2 : numero <= 32;
  }, "Raio máximo de 32px (2rem)");

export const temaSchema = z.strictObject({
  formato: z.literal("nx-tema"),
  versao: z.literal(1),
  nome: z
    .string()
    .trim()
    .min(1, "Informe o nome do tema")
    .max(60, "Nome com mais de 60 caracteres")
    .regex(/^[^<>{}]*$/, "O nome não pode ter < > { }"),
  cores: z.strictObject({ claro: coresModo, escuro: coresModo.optional() }),
  fontes: z.strictObject({ texto: fonte.optional(), titulos: fonte.optional() }).optional(),
  raio: raio.optional(),
});

export type Tema = z.infer<typeof temaSchema>;
export type CoresModo = Tema["cores"]["claro"];
