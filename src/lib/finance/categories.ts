import type { ExpenseCategory } from "@/types/finance";

export const expenseCategories: { value: ExpenseCategory; label: string }[] = [
  { value: "food", label: "Alimentacao" },
  { value: "housing", label: "Moradia" },
  { value: "transport", label: "Transporte" },
  { value: "subscriptions", label: "Assinaturas" },
  { value: "leisure", label: "Lazer" },
  { value: "health", label: "Saude" },
  { value: "gifts", label: "Presentes" },
  { value: "personal", label: "Compras pessoais" },
  { value: "education", label: "Educacao" },
  { value: "other", label: "Outros" },
];

export function getCategoryLabel(category: ExpenseCategory | null | undefined) {
  return expenseCategories.find((item) => item.value === category)?.label ?? "Outros";
}
