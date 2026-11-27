import Link from "next/link";
import { BotaoAjuda } from "@/components/ajuda/botao-ajuda";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { listarEmpresas } from "@/server/services/empresa";
import { EmpresaDialogForm } from "./empresa-dialog-form";
import { alternarAtivoEmpresaAction } from "./actions";
import { BotaoAlternarAtivo } from "../_shared/botao-alternar-ativo";

export default async function EmpresasPage() {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "empresa:gerenciar");

  const empresas = await listarEmpresas(sessao);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-1">
            <h1 className="text-lg font-semibold">Empresas</h1>
            <BotaoAjuda tela="empresas" />
          </div>
          <p className="text-sm text-muted-foreground">
            Empresas que você administra. Cada empresa é um contexto isolado de dados.
          </p>
        </div>
        <EmpresaDialogForm />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome fantasia</TableHead>
            <TableHead>Razão social</TableHead>
            <TableHead>CNPJ/CPF</TableHead>
            <TableHead>Moeda</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {empresas.map((empresa) => (
            <TableRow key={empresa.id}>
              <TableCell className="font-medium">{empresa.nomeFantasia}</TableCell>
              <TableCell>{empresa.razaoSocial}</TableCell>
              <TableCell>{empresa.cnpjCpf}</TableCell>
              <TableCell>{empresa.moedaPadrao}</TableCell>
              <TableCell>
                <Badge variant={empresa.ativo ? "default" : "secondary"}>
                  {empresa.ativo ? "Ativa" : "Inativa"}
                </Badge>
              </TableCell>
              <TableCell className="flex justify-end gap-2">
                <EmpresaDialogForm empresa={empresa} />
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={<Link href={`/empresas/${empresa.id}/tema`} />}
                >
                  Tema e marca
                </Button>
                {/* A empresa em que você está não se inativa daqui: o serviço recusa. */}
                {empresa.id === sessao.empresaId ? null : (
                  <BotaoAlternarAtivo id={empresa.id} ativo={empresa.ativo} action={alternarAtivoEmpresaAction} />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
