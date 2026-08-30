import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/server/db/client";
import { requireSessaoAtiva } from "@/server/auth/sessao";

export default async function DashboardPage() {
  const sessao = await requireSessaoAtiva();
  const { empresaId, filialId } = sessao;

  const [clientes, fornecedores, centrosCusto, centrosLucro, safras, contasBancarias, usuarios] =
    await Promise.all([
      prisma.cliente.count({ where: { empresaId, ativo: true } }),
      prisma.fornecedor.count({ where: { empresaId, ativo: true } }),
      prisma.centroCusto.count({ where: { filialId, ativo: true } }),
      prisma.centroLucro.count({ where: { filialId, ativo: true } }),
      prisma.safra.count({ where: { filialId, ativo: true } }),
      prisma.contaBancaria.count({ where: { filialId, ativo: true } }),
      prisma.usuarioEmpresa.count({ where: { empresaId, ativo: true } }),
    ]);

  const indicadores = [
    { label: "Clientes ativos", valor: clientes },
    { label: "Fornecedores ativos", valor: fornecedores },
    { label: "Centros de custo", valor: centrosCusto },
    { label: "Centros de lucro", valor: centrosLucro },
    { label: "Safras cadastradas", valor: safras },
    { label: "Contas bancárias", valor: contasBancarias },
    { label: "Usuários com acesso", valor: usuarios },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Visão geral</h1>
        <p className="text-sm text-muted-foreground">
          Fundação cadastral da empresa selecionada. Os módulos de contas a pagar/receber,
          conciliação e fluxo de caixa entram nas próximas fases.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {indicadores.map((indicador) => (
          <Card key={indicador.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {indicador.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{indicador.valor}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
