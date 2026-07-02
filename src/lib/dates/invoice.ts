type InvoiceInput = {
  purchaseDate: string | Date;
  closingDay: number;
  dueDay: number;
  installmentOffset?: number;
};

function clampDay(year: number, monthIndex: number, day: number) {
  return Math.min(day, new Date(year, monthIndex + 1, 0).getDate());
}

function toDate(value: string | Date) {
  if (value instanceof Date) return value;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getInvoiceDueDate({
  purchaseDate,
  closingDay,
  dueDay,
  installmentOffset = 0,
}: InvoiceInput) {
  const purchase = toDate(purchaseDate);
  const baseMonthOffset = purchase.getDate() <= closingDay ? 1 : 2;
  const dueBase = new Date(
    purchase.getFullYear(),
    purchase.getMonth() + baseMonthOffset + installmentOffset,
    1,
  );
  const dueYear = dueBase.getFullYear();
  const dueMonth = dueBase.getMonth();
  return new Date(dueYear, dueMonth, clampDay(dueYear, dueMonth, dueDay));
}
