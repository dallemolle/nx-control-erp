import { BotaoAjuda } from "@/components/ajuda/botao-ajuda";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { listarFiliais } from "@/server/services/filial";
import { FilialDialogForm } from "./filial-dialog-form";
import { alternarAtivoFilialAction } from "./actions";
import { BotaoAlternarAtivo } from "../_shared/botao-alternar-ativo";

export default async function FiliaisPage() {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "filial:gerenciar");

  const filiais = await listarFiliais(sessao.empresaId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-1">
            <h1 className="text-lg font-semibold">Filiais</h1>
            <BotaoAjuda tela="filiais" />
          </div>
          <p className="text-sm text-muted-foreground">
            Cadastro de filiais da empresa ativa. Cada filial é um contexto operacional dentro da empresa.
          </p>
        </div>
        <FilialDialogForm />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>CNPJ/CPF</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filiais.map((filial) => (
            <TableRow key={filial.id}>
              <TableCell className="font-medium">{filial.nome}</TableCell>
              <TableCell>{filial.cnpjCpf}</TableCell>
              <TableCell>
                <Badge variant={filial.ativo ? "default" : "secondary"}>
                  {filial.ativo ? "Ativa" : "Inativa"}
                </Badge>
              </TableCell>
              <TableCell className="flex justify-end gap-2">
                <FilialDialogForm filial={filial} />
                {/* A filial em que você está não se inativa daqui: o serviço recusa. */}
                {filial.id === sessao.filialId ? null : (
                  <BotaoAlternarAtivo id={filial.id} ativo={filial.ativo} action={alternarAtivoFilialAction} />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
