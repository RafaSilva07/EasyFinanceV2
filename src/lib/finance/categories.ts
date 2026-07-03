import type { ExpenseCategory } from "@/types/finance";

export const expenseCategories: {
  value: ExpenseCategory;
  label: string;
  initial: string;
  badgeClass: string;
  barClass: string;
}[] = [
  { value: "food", label: "Alimentacao", initial: "A", badgeClass: "bg-emerald-100 text-emerald-700", barClass: "bg-emerald-500" },
  { value: "housing", label: "Moradia", initial: "M", badgeClass: "bg-sky-100 text-sky-700", barClass: "bg-sky-500" },
  { value: "transport", label: "Transporte", initial: "T", badgeClass: "bg-indigo-100 text-indigo-700", barClass: "bg-indigo-500" },
  { value: "subscriptions", label: "Assinaturas", initial: "S", badgeClass: "bg-violet-100 text-violet-700", barClass: "bg-violet-500" },
  { value: "leisure", label: "Lazer", initial: "L", badgeClass: "bg-amber-100 text-amber-700", barClass: "bg-amber-500" },
  { value: "health", label: "Saude", initial: "S", badgeClass: "bg-rose-100 text-rose-700", barClass: "bg-rose-500" },
  { value: "gifts", label: "Presentes", initial: "P", badgeClass: "bg-pink-100 text-pink-700", barClass: "bg-pink-500" },
  { value: "personal", label: "Compras pessoais", initial: "C", badgeClass: "bg-teal-100 text-teal-700", barClass: "bg-teal-500" },
  { value: "education", label: "Educacao", initial: "E", badgeClass: "bg-blue-100 text-blue-700", barClass: "bg-blue-500" },
  { value: "other", label: "Outros", initial: "O", badgeClass: "bg-gray-100 text-gray-700", barClass: "bg-gray-500" },
];

export function getCategoryMeta(category: ExpenseCategory | null | undefined) {
  return expenseCategories.find((item) => item.value === category) ?? expenseCategories[expenseCategories.length - 1];
}

export function getCategoryLabel(category: ExpenseCategory | null | undefined) {
  return getCategoryMeta(category).label;
}
