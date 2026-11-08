import { requireSessaoAtiva } from "@/server/auth/sessao";
import { lerConteudoMarkdown } from "@/lib/conteudoMarkdown";
import { interpretarChangelog, type VersaoNovidade } from "@/lib/changelog";
import { Badge } from "@/components/ui/badge";

/** Quantas versões ficam abertas; as mais antigas vão para "Versões anteriores". */
const VERSOES_VISIVEIS = 4;

const DATA_POR_EXTENSO = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function dataPorExtenso(data: string | null): string | null {
  return data ? DATA_POR_EXTENSO.format(new Date(`${data}T00:00:00Z`)) : null;
}

function Versao({ versao, atual }: { versao: VersaoNovidade; atual: boolean }) {
  const data = dataPorExtenso(versao.data);

  return (
    <section
      aria-labelledby={`versao-${versao.versao}`}
      className={atual ? "rounded-lg border bg-card p-5 shadow-xs" : "border-t pt-5"}
    >
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id={`versao-${versao.versao}`} className="text-base font-semibold">
          Versão {versao.versao}
        </h2>
        {data ? (
          <time dateTime={versao.data ?? undefined} className="text-sm text-muted-foreground">
            {data}
          </time>
        ) : null}
        {atual ? <Badge>Atual</Badge> : null}
      </header>

      {versao.secoes.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Ajustes internos, sem mudança visível no sistema.</p>
      ) : (
        <div className="mt-3 space-y-4">
          {versao.secoes.map((secao) => (
            <div key={secao.tipo}>
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{secao.titulo}</h3>
              <ul className="mt-1.5 space-y-1.5">
                {secao.itens.map((item) => (
                  <li key={`${item.modulo}|${item.texto}`} className="text-sm leading-relaxed">
                    {item.modulo ? <span className="font-semibold">{item.modulo}: </span> : null}
                    {item.texto}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default async function NovidadesPage() {
  await requireSessaoAtiva();

  const conteudo = lerConteudoMarkdown("CHANGELOG.md");
  const versoes = conteudo ? interpretarChangelog(conteudo) : [];
  const visiveis = versoes.slice(0, VERSOES_VISIVEIS);
  const anteriores = versoes.slice(VERSOES_VISIVEIS);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Novidades</h1>
        <p className="text-sm text-muted-foreground">O que mudou no sistema a cada atualização.</p>
      </div>

      {versoes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma atualização publicada ainda.</p>
      ) : (
        <div className="space-y-5">
          {visiveis.map((versao, indice) => (
            <Versao key={versao.versao} versao={versao} atual={indice === 0} />
          ))}

          {anteriores.length > 0 ? (
            <details className="border-t pt-5">
              <summary className="cursor-pointer text-sm font-medium text-primary underline-offset-4 hover:underline">
                Versões anteriores ({anteriores.length})
              </summary>
              <div className="mt-5 space-y-5">
                {anteriores.map((versao) => (
                  <Versao key={versao.versao} versao={versao} atual={false} />
                ))}
              </div>
            </details>
          ) : null}
        </div>
      )}
    </div>
  );
}
