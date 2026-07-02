export type PaymentStatus = "pending" | "paid";
export type PaymentMethod = "pix" | "cash" | "debit" | "boleto" | "other";
export type ExpenseCategory =
  | "food"
  | "housing"
  | "transport"
  | "subscriptions"
  | "leisure"
  | "health"
  | "gifts"
  | "personal"
  | "education"
  | "other";

export type Card = {
  id: string;
  user_id: string;
  name: string;
  issuer: string | null;
  color: string;
  closing_day: number;
  due_day: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Entry = {
  id: string;
  user_id: string;
  description: string;
  amount: number;
  date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Expense = {
  id: string;
  user_id: string;
  description: string;
  amount: number;
  due_date: string;
  payment_method: PaymentMethod;
  category: ExpenseCategory;
  status: PaymentStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CardPurchase = {
  id: string;
  user_id: string;
  card_id: string;
  description: string;
  purchase_date: string;
  category: ExpenseCategory;
  installment_amount: number;
  installments_count: number;
  start_installment: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CardInstallment = {
  id: string;
  user_id: string;
  card_purchase_id: string;
  card_id: string;
  description: string;
  installment_number: number;
  installments_count: number;
  amount: number;
  category: ExpenseCategory;
  invoice_month: number;
  invoice_year: number;
  due_date: string;
  status: PaymentStatus;
  created_at: string;
  updated_at: string;
};

export type InstallmentWithCard = CardInstallment & { cards?: Card | null };
