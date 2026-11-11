"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SEM_VALOR } from "@/lib/schemas/enums";
import type { ConfiguracaoProducaoValores } from "@/server/services/configuracaoProducao";
import { salvarConfiguracaoProducaoAction, type FormState } from "./actions";

const ESTADO_INICIAL: FormState = {};

/** 0,03 → 3 (sem ruído de ponto flutuante como 7.000000000000001). */
function paraPercentual(fracao: number): number {
  return Math.round(fracao * 10000) / 100;
}

function Campo({
  id,
  rotulo,
  ajuda,
  ...props
}: { id: string; rotulo: string; ajuda?: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{rotulo}</Label>
      <Input id={id} name={id} {...props} />
      {ajuda ? <p className="text-xs text-muted-foreground">{ajuda}</p> : null}
    </div>
  );
}

function SelectConfiguracao({
  id,
  rotulo,
  valor,
  opcoes,
  ajuda,
}: {
  id: string;
  rotulo: string;
  valor: string | null;
  opcoes: { id: string; rotulo: string }[];
  ajuda?: string;
}) {
  const itens = [{ value: SEM_VALOR, label: "Nenhuma" }, ...opcoes.map((o) => ({ value: o.id, label: o.rotulo }))];
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{rotulo}</Label>
      <Select name={id} defaultValue={valor ?? SEM_VALOR}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {itens.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {ajuda ? <p className="text-xs text-muted-foreground">{ajuda}</p> : null}
    </div>
  );
}

export function ConfiguracaoForm({
  valores,
  somenteLeitura,
  categoriasDespesa,
  categoriasReceita,
  contas,
}: {
  valores: ConfiguracaoProducaoValores;
  somenteLeitura: boolean;
  categoriasDespesa: { id: string; nome: string }[];
  categoriasReceita: { id: string; nome: string }[];
  contas: { id: string; tipo: string; rotulo: string }[];
}) {
  const [state, formAction, pendente] = useActionState(salvarConfiguracaoProducaoAction, ESTADO_INICIAL);

  return (
    <form action={formAction} className="space-y-6">
      <fieldset disabled={somenteLeitura} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Registro</CardTitle>
          </CardHeader>
          <CardContent>
            <Campo
              id="registroAdepara"
              rotulo="Registro na ADEPARA"
              defaultValue={valores.registroAdepara ?? ""}
              ajuda="Aparece na etiqueta do lote."
            />
            <Campo
              id="enderecoEtiqueta"
              rotulo="Endereço na etiqueta"
              defaultValue={valores.enderecoEtiqueta ?? ""}
              ajuda="Endereço do estabelecimento, em uma linha. O CNPJ vem do cadastro da filial."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Alertas de vencimento</CardTitle>
            <CardDescription>Com quantos dias de antecedência o lote aparece como &ldquo;vencendo&rdquo;.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Campo
              id="alertaVencimentoCongeladoDias"
              rotulo="Congelado (dias)"
              type="number"
              min="0"
              step="1"
              defaultValue={valores.alertaVencimentoCongeladoDias}
              required
            />
            <Campo
              id="alertaVencimentoResfriadoDias"
              rotulo="In natura e resfriado (dias)"
              type="number"
              min="0"
              step="1"
              defaultValue={valores.alertaVencimentoResfriadoDias}
              required
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Branqueamento</CardTitle>
            <CardDescription>Mínimos para as frutas que exigem branqueamento (ex.: açaí).</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Campo
              id="branqueamentoTemperaturaMinC"
              rotulo="Temperatura mínima (°C)"
              type="number"
              min="0"
              max="150"
              step="0.1"
              defaultValue={valores.branqueamentoTemperaturaMinC}
              required
            />
            <Campo
              id="branqueamentoTempoMinS"
              rotulo="Tempo mínimo (segundos)"
              type="number"
              min="0"
              step="1"
              defaultValue={valores.branqueamentoTempoMinS}
              required
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Balanço de massa</CardTitle>
            <CardDescription>
              Diferença aceita entre o que entra (fruto + água) e o que sai (polpa + caroço + perda) numa ordem de
              produção.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Campo
              id="toleranciaBalancoMassaPercentual"
              rotulo="Tolerância (%)"
              type="number"
              min="0"
              max="100"
              step="0.01"
              defaultValue={paraPercentual(valores.toleranciaBalancoMassa)}
              required
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Compra de fruto</CardTitle>
            <CardDescription>
              Usado na conta a pagar gerada pela recepção de fruto de terceiros.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="categoriaCompraFrutoId">Categoria financeira</Label>
              <Select name="categoriaCompraFrutoId" defaultValue={valores.categoriaCompraFrutoId ?? SEM_VALOR}>
                <SelectTrigger id="categoriaCompraFrutoId" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_VALOR}>Nenhuma</SelectItem>
                  {categoriasDespesa.map((categoria) => (
                    <SelectItem key={categoria.id} value={categoria.id}>
                      {categoria.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Sem categoria, a recepção de terceiro com valor é recusada.
              </p>
            </div>
            <Campo
              id="prazoPagamentoProdutorDias"
              rotulo="Prazo de pagamento ao produtor (dias)"
              type="number"
              min="0"
              step="1"
              defaultValue={valores.prazoPagamentoProdutorDias}
              ajuda="Vencimento padrão da conta a pagar da compra de fruto. Pode ser mudado em cada recepção."
              required
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Vendas</CardTitle>
            <CardDescription>
              Usados pelo pedido de venda para criar a conta a receber e o recebimento à vista.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <SelectConfiguracao
              id="categoriaVendaId"
              rotulo="Categoria de venda"
              valor={valores.categoriaVendaId}
              opcoes={categoriasReceita.map((c) => ({ id: c.id, rotulo: c.nome }))}
              ajuda="Sem categoria, o pedido de venda é recusado."
            />
            <SelectConfiguracao
              id="contaRecebimentoPadraoId"
              rotulo="Conta de recebimento (Pix, transferência, cartão)"
              valor={valores.contaRecebimentoPadraoId}
              opcoes={contas.filter((c) => c.tipo !== "CAIXA")}
            />
            <SelectConfiguracao
              id="contaCaixaPadraoId"
              rotulo="Conta Caixa (dinheiro)"
              valor={valores.contaCaixaPadraoId}
              opcoes={contas.filter((c) => c.tipo === "CAIXA")}
              ajuda="Cadastre uma conta do tipo Caixa em Cadastros → Contas bancárias."
            />
          </CardContent>
        </Card>
      </fieldset>

      {state.erro ? <p className="text-sm text-destructive">{state.erro}</p> : null}
      {state.sucesso && !pendente ? <p className="text-sm text-muted-foreground">Configuração salva.</p> : null}
      {!somenteLeitura && (
        <Button type="submit" disabled={pendente}>
          {pendente ? "Salvando..." : "Salvar"}
        </Button>
      )}
    </form>
  );
}
