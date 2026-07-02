export const monthNames = [
  "Janeiro",
  "Fevereiro",
  "Marco",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function parseMonthValue(value: string) {
  const [year, month] = value.split("-").map(Number);
  return { year, month };
}

export function monthLabel(monthValue: string) {
  const { year, month } = parseMonthValue(monthValue);
  return `${monthNames[month - 1]} de ${year}`;
}

export function monthRange(monthValue: string) {
  const { year, month } = parseMonthValue(monthValue);
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(year, month, 0);
  const end = `${year}-${String(month).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;
  return { start, end, year, month };
}

export function formatDateBr(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}
