"use client";

// Espelho de src/app/(dashboard)/usuarios/page.tsx, novo-usuario-dialog.tsx, acesso-filial-form.tsx e
// chaves-api-dialog.tsx. Mudou um rótulo, campo ou coluna lá? Ajuste aqui também.

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alvo, BotaoSimulado, CampoSimulado, JanelaSimulada, SelectSimulado } from "@/components/ajuda/campos-simulados";
import type { PropsCena, Valores } from "@/ajuda/tipos";
import { ROTULOS_PERFIL } from "@/lib/schemas/usuario";
import { cn } from "@/lib/utils";
import {
  CHAVE_ANTIGA,
  CHAVE_NOVA,
  FILIAL_ATIVA,
  JOANA,
  LUCIA,
  OUTRA_FILIAL,
  PERFIS_RESUMO,
  USUARIOS,
  VOCE,
  type UsuarioExemplo,
} from "./exemplo";

/** Os usuários no ponto do roteiro, em ordem de nome, como a tela lista. */
export function usuariosDoRoteiro(valores: Valores): (UsuarioExemplo & { ativo: boolean })[] {
  const linhas = USUARIOS.map((u) => {
    if (u.chave === "rita") {
      return {
        ...u,
        perfil: (valores["lista.perfil-rita"] as UsuarioExemplo["perfil"] | undefined) ?? u.perfil,
        igarape: {
          leitura: valores["acessos.rita-igarape"] === "sim",
          alteracao: valores["acessos.rita-igarape-alteracao"] === "sim",
        },
        ativo: true,
      };
    }
    return { ...u, ativo: u.chave !== "pedro" || valores["lista.pedro"] !== "Inativo" };
  });
  if (valores["lista.joana"] === "sim") linhas.push({ ...JOANA, ativo: true });
  if (valores["lista.lucia"] === "sim") linhas.push({ ...LUCIA, ativo: true });
  return linhas.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Envolve o conteúdo num alvo só quando há um. */
function Talvez({ alvo, children }: { alvo?: string; children: ReactNode }) {
  return alvo ? (
    <Alvo nome={alvo} className="inline-block px-1">
      {children}
    </Alvo>
  ) : (
    <>{children}</>
  );
}

function Caixinha({ marcada, desabilitada = false }: { marcada: boolean; desabilitada?: boolean }) {
  return (
    <span
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-sm border border-input text-[10px]",
        marcada && "border-primary bg-primary text-primary-foreground",
        desabilitada && "opacity-50",
      )}
    >
      {marcada ? "✓" : ""}
    </span>
  );
}

const ALVO_DO_NOME: Readonly<Record<string, string>> = { joana: "lista.joana", lucia: "lista.lucia", paulo: "lista.voce" };

export function CenaLista({ valores }: PropsCena) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">Usuários</p>
          <p className="text-sm text-muted-foreground">Pessoas com acesso a esta empresa e o perfil de cada uma.</p>
        </div>
        <BotaoSimulado alvo="lista.novo">Novo usuário</BotaoSimulado>
      </div>
      <Alvo nome="lista.tabela" className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Perfil</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usuariosDoRoteiro(valores).map((u) => {
              const eVoce = u.chave === VOCE.chave;
              const status = <Badge variant={u.ativo ? "default" : "secondary"}>{u.ativo ? "Ativo" : "Inativo"}</Badge>;
              return (
                <TableRow key={u.chave}>
                  <TableCell className="font-medium">
                    <Talvez alvo={ALVO_DO_NOME[u.chave]}>
                      {u.nome}
                      {eVoce ? <span className="ml-1 text-xs font-normal text-muted-foreground">(você)</span> : null}
                    </Talvez>
                  </TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    {eVoce ? (
                      <span className="text-sm">{ROTULOS_PERFIL[u.perfil]}</span>
                    ) : (
                      <SelectSimulado
                        alvo={u.chave === "rita" ? "lista.perfil-rita" : undefined}
                        valor={ROTULOS_PERFIL[u.perfil]}
                        compacto
                        className="w-40"
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <Talvez alvo={u.chave === "pedro" ? "lista.pedro" : undefined}>{status}</Talvez>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <BotaoSimulado alvo={u.chave === "carlos" ? "lista.chaves-carlos" : undefined} variant="outline" size="sm">
                        Chaves de API
                      </BotaoSimulado>
                      {eVoce ? null : (
                        <BotaoSimulado
                          alvo={u.chave === "pedro" ? "lista.desativar-pedro" : undefined}
                          variant="outline"
                          size="sm"
                        >
                          {u.ativo ? "Desativar" : "Reativar"}
                        </BotaoSimulado>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Alvo>
    </div>
  );
}

export function CenaNovo({ valores }: PropsCena) {
  const encontrado = valores["form.encontrado"];
  const concede = valores["form.acesso"] !== "nao";
  return (
    <JanelaSimulada titulo="Novo usuário">
      <div className="space-y-2">
        <p className="text-sm font-medium">Email</p>
        <div className="flex gap-2">
          <CampoSimulado alvo="form.email" valor={valores["form.email"]} className="flex-1" />
          <BotaoSimulado alvo="form.verificar" variant="outline">
            Verificar
          </BotaoSimulado>
        </div>
        {encontrado ? (
          <Alvo nome="form.encontrado" className="px-1">
            <p className="text-sm text-muted-foreground">
              Encontramos: <span className="font-medium">{encontrado}</span>. Esta pessoa já está cadastrada no sistema
              — só vamos conceder acesso a esta empresa.
            </p>
          </Alvo>
        ) : null}
      </div>
      {encontrado ? null : (
        <>
          <CampoSimulado alvo="form.nome" rotulo="Nome" valor={valores["form.nome"]} />
          <CampoSimulado alvo="form.senha" rotulo="Senha" valor={valores["form.senha"] ? "••••••••••" : undefined} />
        </>
      )}
      <SelectSimulado
        alvo="form.perfil"
        rotulo="Perfil"
        valor={ROTULOS_PERFIL[(valores["form.perfil"] as UsuarioExemplo["perfil"] | undefined) ?? "CONSULTA"]}
      />
      <div className="space-y-2">
        <Alvo nome="form.acesso" className="flex items-center gap-2 px-1 text-sm">
          <Caixinha marcada={concede} />
          Conceder acesso a esta filial (ativa)
        </Alvo>
        <Alvo nome="form.alteracao" className="ml-6 flex items-center gap-2 px-1 text-sm">
          <Caixinha marcada={concede && valores["form.alteracao"] === "sim"} desabilitada={!concede} />
          Permitir alteração (não só leitura)
        </Alvo>
      </div>
      <BotaoSimulado alvo="form.salvar" largo>
        Salvar
      </BotaoSimulado>
    </JanelaSimulada>
  );
}

/** Não é uma tela do sistema: o resumo que a ajuda mostra para escolher o perfil. */
export function CenaPerfis() {
  const ALVO_DO_PERFIL: Readonly<Record<string, string>> = { PRODUCAO: "perfis.producao", AUDITOR: "perfis.auditor" };
  return (
    <div className="space-y-3">
      <div>
        <p className="text-lg font-semibold">O que cada perfil pode fazer</p>
        <p className="text-sm text-muted-foreground">
          Resumo da ajuda. O perfil vale para a empresa toda; o que a pessoa pode alterar em cada filial vem do acesso
          por filial.
        </p>
      </div>
      <Alvo nome="perfis.tabela" className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Perfil</TableHead>
              <TableHead>Pode</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {PERFIS_RESUMO.map((p) => (
              <TableRow key={p.perfil}>
                <TableCell className="font-medium">
                  <Talvez alvo={ALVO_DO_PERFIL[p.perfil]}>{ROTULOS_PERFIL[p.perfil]}</Talvez>
                </TableCell>
                <TableCell className="whitespace-normal text-sm">{p.faz}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Alvo>
    </div>
  );
}

export function CenaAcessos({ valores }: PropsCena) {
  return (
    <div className="space-y-4">
      <Alvo nome="acessos.secao" className="px-1">
        <p className="text-lg font-semibold">Acesso por filial</p>
        <p className="text-sm text-muted-foreground">Defina quais filiais cada usuário pode ler e alterar.</p>
      </Alvo>
      {usuariosDoRoteiro(valores).map((u) => {
        const cartao = (
          <div className="rounded-xl border p-4">
            <p className="font-medium">{u.nome}</p>
            <p className="mb-3 text-sm text-muted-foreground">{u.email}</p>
            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-6 gap-y-1">
              <div className="text-xs font-medium text-muted-foreground">Filial</div>
              <div className="text-xs font-medium text-muted-foreground">Leitura</div>
              <div className="text-xs font-medium text-muted-foreground">Alteração</div>
              {[
                { nome: OUTRA_FILIAL, acesso: u.igarape, filial: "igarape" },
                { nome: FILIAL_ATIVA, acesso: u.matriz, filial: "matriz" },
              ].map(({ nome, acesso, filial }) => {
                const ritaIgarape = u.chave === "rita" && filial === "igarape";
                const voceMatriz = u.chave === VOCE.chave && filial === "matriz";
                return (
                  <div key={filial} className="contents">
                    <div className="py-1.5 text-sm">{nome}</div>
                    <div className="py-1.5">
                      <Talvez alvo={ritaIgarape ? "acessos.rita-igarape" : voceMatriz ? "acessos.voce-matriz" : undefined}>
                        <Caixinha marcada={acesso.leitura} desabilitada={voceMatriz} />
                      </Talvez>
                    </div>
                    <div className="py-1.5">
                      <Talvez alvo={ritaIgarape ? "acessos.rita-igarape-alteracao" : undefined}>
                        <Caixinha marcada={acesso.alteracao} desabilitada={!acesso.leitura} />
                      </Talvez>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
        return u.chave === JOANA.chave ? (
          <Alvo key={u.chave} nome="acessos.joana">
            {cartao}
          </Alvo>
        ) : (
          <div key={u.chave}>{cartao}</div>
        );
      })}
    </div>
  );
}

function prefixo(chave: string) {
  return chave.slice(0, 11);
}

export function CenaChaves({ valores }: PropsCena) {
  const gerada = valores["chaves.nova"] === "sim";
  const antigaRevogada = valores["chaves.antiga"] === "Revogada";
  return (
    <JanelaSimulada titulo="Chaves de API" className="max-w-lg">
      {gerada ? (
        <Alvo nome="chaves.copiar" className="space-y-2 rounded-md border border-amber-500 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
          <p className="font-medium">Copie a chave agora — ela não será mostrada novamente:</p>
          <CampoSimulado valor={CHAVE_NOVA.completa} className="font-mono text-xs" />
        </Alvo>
      ) : null}
      <div className="space-y-2">
        {gerada ? (
          <Alvo nome="chaves.nova">
            <LinhaChave
              nome={CHAVE_NOVA.nome}
              prefixo={prefixo(CHAVE_NOVA.completa)}
              detalhe={`Criada em ${CHAVE_NOVA.criadaEm} — Último uso: Nunca — Expira em ${CHAVE_NOVA.expiraEm}`}
              revogavel
            />
          </Alvo>
        ) : null}
        <Alvo nome="chaves.antiga">
          <LinhaChave
            nome={CHAVE_ANTIGA.nome}
            prefixo={CHAVE_ANTIGA.prefixo}
            detalhe={`Criada em ${CHAVE_ANTIGA.criadaEm} — Último uso: ${CHAVE_ANTIGA.ultimoUso} — ${
              antigaRevogada ? "Revogada" : "Sem validade"
            }`}
            revogavel={!antigaRevogada}
            alvoRevogar="chaves.revogar"
          />
        </Alvo>
      </div>
      <div className="flex items-end gap-2 border-t pt-4">
        <CampoSimulado
          alvo="chaves.nome"
          rotulo="Nova chave"
          valor={gerada ? undefined : valores["chaves.nome"]}
          placeholder="Ex.: Agente IA - lançamentos"
          className="flex-1"
        />
        <SelectSimulado alvo="chaves.validade" rotulo="Validade" valor={gerada ? "Sem validade" : (valores["chaves.validade"] ?? "Sem validade")} />
        <BotaoSimulado alvo="chaves.gerar">Gerar</BotaoSimulado>
      </div>
    </JanelaSimulada>
  );
}

function LinhaChave({
  nome,
  prefixo,
  detalhe,
  revogavel,
  alvoRevogar,
}: {
  nome: string;
  prefixo: string;
  detalhe: string;
  revogavel: boolean;
  alvoRevogar?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
      <div>
        <div className="font-medium">
          {nome} <span className="font-mono text-xs text-muted-foreground">{prefixo}...</span>
        </div>
        <div className="text-xs text-muted-foreground">{detalhe}</div>
      </div>
      {revogavel ? (
        <BotaoSimulado alvo={alvoRevogar} variant="outline" size="sm">
          Revogar
        </BotaoSimulado>
      ) : null}
    </div>
  );
}
