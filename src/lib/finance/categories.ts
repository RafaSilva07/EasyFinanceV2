import type { ExpenseCategory } from "@/types/finance";

export const expenseCategories: {
  value: ExpenseCategory;
  label: string;
  initial: string;
  color: string;
  badgeClass: string;
  barClass: string;
}[] = [
  { value: "food", label: "Alimentacao", initial: "A", color: "#10B981", badgeClass: "bg-emerald-100 text-emerald-700", barClass: "bg-emerald-500" },
  { value: "housing", label: "Moradia", initial: "M", color: "#0EA5E9", badgeClass: "bg-sky-100 text-sky-700", barClass: "bg-sky-500" },
  { value: "transport", label: "Transporte", initial: "T", color: "#6366F1", badgeClass: "bg-indigo-100 text-indigo-700", barClass: "bg-indigo-500" },
  { value: "subscriptions", label: "Assinaturas", initial: "S", color: "#8B5CF6", badgeClass: "bg-violet-100 text-violet-700", barClass: "bg-violet-500" },
  { value: "leisure", label: "Lazer", initial: "L", color: "#F59E0B", badgeClass: "bg-amber-100 text-amber-700", barClass: "bg-amber-500" },
  { value: "health", label: "Saude", initial: "S", color: "#F43F5E", badgeClass: "bg-rose-100 text-rose-700", barClass: "bg-rose-500" },
  { value: "gifts", label: "Presentes", initial: "P", color: "#EC4899", badgeClass: "bg-pink-100 text-pink-700", barClass: "bg-pink-500" },
  { value: "personal", label: "Compras pessoais", initial: "C", color: "#14B8A6", badgeClass: "bg-teal-100 text-teal-700", barClass: "bg-teal-500" },
  { value: "education", label: "Educacao", initial: "E", color: "#3B82F6", badgeClass: "bg-blue-100 text-blue-700", barClass: "bg-blue-500" },
  { value: "other", label: "Outros", initial: "O", color: "#6B7280", badgeClass: "bg-gray-100 text-gray-700", barClass: "bg-gray-500" },
];

export function getCategoryMeta(category: ExpenseCategory | null | undefined) {
  return expenseCategories.find((item) => item.value === category) ?? expenseCategories[expenseCategories.length - 1];
}

export function getCategoryLabel(category: ExpenseCategory | null | undefined) {
  return getCategoryMeta(category).label;
}
