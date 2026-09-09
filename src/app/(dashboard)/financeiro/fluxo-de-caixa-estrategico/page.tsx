import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission, podeExecutar } from "@/server/auth/permissions";
import { listarCenariosEstrategicos, listarProjecaoEstrategica, TIPOS_CENARIO } from "@/server/services/fluxoDeCaixaEstrategico";
import { PremissasForm } from "./premissas-form";

const LABEL_CENARIO: Record<(typeof TIPOS_CENARIO)[number], string> = {
  BASE: "Base",
  OTIMISTA: "Otimista",
  PESSIMISTA: "Pessimista",
};

export default async function FluxoDeCaixaEstrategicoPage() {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "planejamentoEstrategico:ler");

  const [cenarios, projecoes] = await Promise.all([
    listarCenariosEstrategicos(sessao),
    listarProjecaoEstrategica(sessao),
  ]);

  const somenteLeitura = !podeExecutar(sessao.perfil, "planejamentoEstrategico:escrever");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">Fluxo de caixa estratégico</h1>
        <p className="text-sm text-muted-foreground">
          Projeção de 5 anos por cenário, consolidando todas as filiais
          da empresa a partir do fluxo de caixa realizado dos últimos 12
          meses. Não considera prazo de recebimento/pagamento, capital
          de giro nem amortização de dívida (juros incidem sobre o saldo
          devedor acumulado, que nunca é amortizado).
        </p>
      </div>

      {TIPOS_CENARIO.map((tipo) => (
        <section key={tipo} className="space-y-4 rounded-lg border p-4">
          <h2 className="text-base font-semibold">Cenário {LABEL_CENARIO[tipo]}</h2>

          <PremissasForm tipo={tipo} premissas={cenarios[tipo]} somenteLeitura={somenteLeitura} />

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Métrica</TableHead>
                {projecoes[tipo].map((ano) => (
                  <TableHead key={ano.ano}>Ano {ano.ano}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Receita</TableCell>
                {projecoes[tipo].map((ano) => (
                  <TableCell key={ano.ano}>{ano.receita.toFixed(2)}</TableCell>
                ))}
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Custo operacional</TableCell>
                {projecoes[tipo].map((ano) => (
                  <TableCell key={ano.ano}>{ano.custoOperacional.toFixed(2)}</TableCell>
                ))}
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">CAPEX</TableCell>
                {projecoes[tipo].map((ano) => (
                  <TableCell key={ano.ano}>{ano.capex.toFixed(2)}</TableCell>
                ))}
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Juros</TableCell>
                {projecoes[tipo].map((ano) => (
                  <TableCell key={ano.ano}>{ano.jurosSobreDivida.toFixed(2)}</TableCell>
                ))}
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Geração líquida</TableCell>
                {projecoes[tipo].map((ano) => (
                  <TableCell key={ano.ano}>{ano.geracaoLiquida.toFixed(2)}</TableCell>
                ))}
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Saldo de caixa</TableCell>
                {projecoes[tipo].map((ano) => (
                  <TableCell key={ano.ano} className={ano.saldoCaixa < 0 ? "font-medium text-destructive" : undefined}>
                    {ano.saldoCaixa.toFixed(2)}
                  </TableCell>
                ))}
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Margem líquida</TableCell>
                {projecoes[tipo].map((ano) => (
                  <TableCell key={ano.ano}>{(ano.margemLiquida * 100).toFixed(1)}%</TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </section>
      ))}
    </div>
  );
}
