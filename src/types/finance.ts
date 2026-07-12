export type PaymentStatus = "pending" | "paid";
export type PurchaseStatus = "active" | "canceled";
export type RecurringStatus = "active" | "inactive";
export type PaymentMethod = "pix" | "cash" | "debit" | "boleto" | "other";
export type CashTransactionType = "income" | "expense" | "transfer_in" | "transfer_out" | "reversal";
export type CashSourceType = "manual" | "entry" | "expense" | "payable" | "card_invoice" | "transfer" | "reversal";
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
  cash_transaction_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type EntryWithCashAccount = Entry & {
  cash_transactions?: {
    account_id: string;
    cash_accounts?: Pick<CashAccount, "id" | "name" | "color"> | null;
  } | null;
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
  cash_transaction_id: string | null;
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
  status: PurchaseStatus;
  is_recurring: boolean;
  recurring_status: RecurringStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CardInvoice = {
  id: string;
  user_id: string;
  card_id: string;
  invoice_month: number;
  invoice_year: number;
  due_date: string;
  status: PaymentStatus;
  cash_transaction_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CardInstallment = {
  id: string;
  user_id: string;
  card_purchase_id: string;
  invoice_id: string | null;
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
export type CardInvoiceWithCard = CardInvoice & { cards?: Card | null };
export type CardPurchaseWithCard = CardPurchase & { cards?: Card | null };
export type CardPurchaseWithProgress = CardPurchaseWithCard & {
  paid_installments: number;
  active_installments: number;
  installments_in_range?: CardInstallment[];
  open_installments_in_range?: CardInstallment[];
  next_due_date: string | null;
  has_paid_invoice: boolean;
};

export type Payable = {
  id: string;
  user_id: string;
  description: string;
  amount: number;
  purchase_date: string;
  due_date: string;
  category: ExpenseCategory;
  status: PaymentStatus;
  payable_group_id: string;
  installment_number: number;
  installments_count: number;
  cash_transaction_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CashAccount = {
  id: string;
  user_id: string;
  name: string;
  color: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CashTransaction = {
  id: string;
  user_id: string;
  account_id: string;
  type: CashTransactionType;
  amount: number;
  date: string;
  description: string;
  source_type: CashSourceType | null;
  source_id: string | null;
  notes: string | null;
  created_at: string;
};

export type CashAccountWithBalance = CashAccount & {
  balance: number;
};
