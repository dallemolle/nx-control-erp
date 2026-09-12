export function dataValida(valor: string | undefined): Date {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    return new Date();
  }
  const data = new Date(`${valor}T00:00:00Z`);
  return Number.isNaN(data.getTime()) ? new Date() : data;
}
