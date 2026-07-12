"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { Banknote, CheckCircle2, CreditCard, Receipt, ScrollText, XCircle } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { ConfigNotice } from "@/components/layout/ConfigNotice";
import { createCardPurchase, createEntry, createExpense, createPayable, fetchCards, fetchCashAccounts } from "@/features/finance/api";
import { expenseCategories } from "@/lib/finance/categories";
import { formatDateBr, monthLabel } from "@/lib/dates/format";
import { getInvoiceDueDate, toIsoDate } from "@/lib/dates/invoice";
import { formatCurrency, toNumber } from "@/lib/money/format";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import type { Card, CashAccountWithBalance } from "@/types/finance";

const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const todayBr = () => {
  const [year, month, day] = today().split("-");
  return `${day}/${month}/${year}`;
};
const maskDateBr = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};
const dateBrToIso = (value: string) => {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return null;
  const [day, month, year] = value.split("/");
  return `${year}-${month}-${day}`;
};

const money = z.string().min(1, "Informe o valor").transform(toNumber).pipe(z.number().positive("Informe um valor maior que zero"));
const optionalText = z.string().optional().transform((value) => value?.trim() || null);
const dateBr = z
  .string()
  .min(1, "Informe a data")
  .regex(/^\d{2}\/\d{2}\/\d{4}$/, "Use o formato dd/mm/aaaa")
  .transform((value, ctx) => {
    const [day, month, year] = value.split("/").map(Number);
    const date = new Date(year, month - 1, day);
    const isValid =
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day;

    if (!isValid) {
      ctx.addIssue({
        code: "custom",
        message: "Informe uma data valida",
      });
      return z.NEVER;
    }

    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  });

const entrySchema = z.object({
  description: z.string().min(1, "Informe a descricao"),
  amount: money,
  date: dateBr,
  cash_account_id: z.string().min(1, "Escolha a conta de destino"),
  notes: optionalText,
});

const expenseSchema = z.object({
  description: z.string().min(1, "Informe a descricao"),
  amount: money,
  due_date: dateBr,
  payment_method: z.enum(["pix", "cash", "debit", "boleto", "other"]),
  category: z.enum(["food", "housing", "transport", "subscriptions", "leisure", "health", "gifts", "personal", "education", "other"]),
  status: z.enum(["pending", "paid"]),
  notes: optionalText,
});

const payableSchema = z.object({
  description: z.string().min(1, "Informe a descricao"),
  amount: money,
  purchase_date: dateBr,
  due_date: dateBr,
  category: z.enum(["food", "housing", "transport", "subscriptions", "leisure", "health", "gifts", "personal", "education", "other"]),
  status: z.enum(["pending", "paid"]),
  installments_count: z.coerce.number().int().min(1, "Minimo 1 parcela"),
  notes: optionalText,
});

const purchaseSchema = z.object({
  description: z.string().min(1, "Informe a descricao"),
  card_id: z.string().min(1, "Escolha um cartao"),
  purchase_date: dateBr,
  category: z.enum(["food", "housing", "transport", "subscriptions", "leisure", "health", "gifts", "personal", "education", "other"]),
  installment_amount: money,
  installments_count: z.coerce.number().int().min(1, "Minimo 1 parcela"),
  is_ongoing: z.boolean(),
  is_recurring: z.boolean(),
  recurring_status: z.enum(["active", "inactive"]),
  start_installment: z.coerce.number().int().min(1, "Minimo 1"),
  notes: optionalText,
}).refine((data) => !data.is_ongoing || data.start_installment <= data.installments_count, {
  message: "A parcela inicial nao pode ser maior que o total",
  path: ["start_installment"],
});

type Mode = "entry" | "expense" | "payable" | "purchase";
type EntryInput = z.input<typeof entrySchema>;
type EntryForm = z.output<typeof entrySchema>;
type ExpenseInput = z.input<typeof expenseSchema>;
type ExpenseForm = z.output<typeof expenseSchema>;
type PayableInput = z.input<typeof payableSchema>;
type PayableForm = z.output<typeof payableSchema>;
type PurchaseInput = z.input<typeof purchaseSchema>;
type PurchaseForm = z.output<typeof purchaseSchema>;
type Feedback = {
  tone: "success" | "error";
  title: string;
  description?: string;
  href?: string;
  hrefLabel?: string;
};

export default function RegistrarPage() {
  const [mode, setMode] = useState<Mode>("expense");
  const [cards, setCards] = useState<Card[]>([]);
  const [cashAccounts, setCashAccounts] = useState<CashAccountWithBalance[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  async function loadOptions() {
    if (!hasSupabaseConfig()) return;
    const [nextCards, nextCashAccounts] = await Promise.all([
      fetchCards(createClient()),
      fetchCashAccounts(createClient()),
    ]);
    setCards(nextCards.filter((card) => card.is_active));
    setCashAccounts(nextCashAccounts.filter((account) => account.is_active));
  }

  useEffect(() => {
    loadOptions();
  }, []);

  useEffect(() => {
    if (!feedback) return;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [feedback]);

  return (
    <AuthGuard>
      <AppShell title="Registrar" subtitle="Entradas, gastos e compras">
        {!hasSupabaseConfig() ? <ConfigNotice /> : null}
        <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <ModeButton active={mode === "entry"} label="Entrada" icon={<Banknote size={19} />} onClick={() => setMode("entry")} />
          <ModeButton active={mode === "expense"} label="Gasto" icon={<Receipt size={19} />} onClick={() => setMode("expense")} />
          <ModeButton active={mode === "payable"} label="A pagar" icon={<ScrollText size={19} />} onClick={() => setMode("payable")} />
          <ModeButton active={mode === "purchase"} label="Cartao" icon={<CreditCard size={19} />} onClick={() => setMode("purchase")} />
        </div>
        {feedback ? <ActionFeedback feedback={feedback} onClose={() => setFeedback(null)} /> : null}
        {mode === "entry" ? <EntryFormView cashAccounts={cashAccounts} onFeedback={setFeedback} /> : null}
        {mode === "expense" ? <ExpenseFormView onFeedback={setFeedback} /> : null}
        {mode === "payable" ? <PayableFormView onFeedback={setFeedback} /> : null}
        {mode === "purchase" ? <PurchaseFormView cards={cards} onFeedback={setFeedback} /> : null}
      </AppShell>
    </AuthGuard>
  );
}

function ActionFeedback({ feedback, onClose }: { feedback: Feedback; onClose: () => void }) {
  const isSuccess = feedback.tone === "success";
  const Icon = isSuccess ? CheckCircle2 : XCircle;
  return (
    <div
      className={`mb-4 rounded-lg border p-4 shadow-sm ${
        isSuccess ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"
      }`}
    >
      <div className="flex gap-3">
        <Icon className="mt-0.5 shrink-0" size={22} />
        <div className="min-w-0 flex-1">
          <p className="font-bold">{feedback.title}</p>
          {feedback.description ? <p className="mt-1 text-sm leading-5">{feedback.description}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {feedback.href && feedback.hrefLabel ? (
              <Link href={feedback.href} className="rounded-lg bg-gray-950 px-3 py-2 text-sm font-bold text-white">
                {feedback.hrefLabel}
              </Link>
            ) : null}
            <button type="button" onClick={onClose} className="rounded-lg border border-current/20 px-3 py-2 text-sm font-bold">
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModeButton({ active, label, icon, onClick }: { active: boolean; label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`flex min-h-14 items-center justify-center gap-2 rounded-lg border text-sm font-bold ${active ? "border-gray-950 bg-gray-950 text-white" : "border-gray-200 bg-white text-gray-700"}`}>
      {icon}
      {label}
    </button>
  );
}

function EntryFormView({ cashAccounts, onFeedback }: { cashAccounts: CashAccountWithBalance[]; onFeedback: (value: Feedback) => void }) {
  const form = useForm<EntryInput, unknown, EntryForm>({
    resolver: zodResolver(entrySchema),
    defaultValues: { date: todayBr(), description: "", amount: "", cash_account_id: "", notes: "" },
  });
  const dateValue = useWatch({ control: form.control, name: "date" }) ?? "";
  async function submit(values: EntryForm) {
    try {
      await createEntry(createClient(), values);
      const account = cashAccounts.find((candidate) => candidate.id === values.cash_account_id);
      form.reset({ date: todayBr(), description: "", amount: "", cash_account_id: values.cash_account_id, notes: "" });
      onFeedback({
        tone: "success",
        title: "Entrada registrada",
        description: `O valor foi adicionado ao saldo de ${account?.name ?? "sua conta"}.`,
        href: "/caixa",
        hrefLabel: "Ver no Caixa",
      });
    } catch (err) {
      onFeedback({ tone: "error", title: "Nao foi possivel salvar a entrada", description: err instanceof Error ? err.message : "Tente novamente." });
    }
  }
  return (
    <FormCard onSubmit={form.handleSubmit(submit)} submitLabel="Salvar entrada" disabled={cashAccounts.length === 0}>
      {cashAccounts.length === 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-bold">Crie uma conta antes de registrar entradas.</p>
          <p className="mt-1">Toda entrada precisa aumentar o saldo de uma conta do caixa.</p>
          <Link href="/caixa" className="mt-3 inline-flex rounded-lg bg-gray-950 px-3 py-2 font-bold text-white">
            Criar conta no Caixa
          </Link>
        </div>
      ) : null}
      <TextInput label="Descricao" error={form.formState.errors.description?.message} {...form.register("description")} />
      <TextInput label="Valor" inputMode="decimal" placeholder="3000,00" error={form.formState.errors.amount?.message} {...form.register("amount")} />
      <Select label="Conta de destino" error={form.formState.errors.cash_account_id?.message} {...form.register("cash_account_id")}>
        <option value="">Escolha uma conta</option>
        {cashAccounts.map((account) => (
          <option key={account.id} value={account.id}>{account.name} - {formatCurrency(account.balance)}</option>
        ))}
      </Select>
      <DateInput
        label="Data"
        error={form.formState.errors.date?.message}
        value={dateValue}
        onChange={(value) => form.setValue("date", value, { shouldDirty: true, shouldValidate: false })}
        onBlur={() => form.trigger("date")}
      />
      <TextArea label="Observacao" {...form.register("notes")} />
    </FormCard>
  );
}

function ExpenseFormView({ onFeedback }: { onFeedback: (value: Feedback) => void }) {
  const form = useForm<ExpenseInput, unknown, ExpenseForm>({
    resolver: zodResolver(expenseSchema),
    defaultValues: { due_date: todayBr(), payment_method: "pix", category: "other", status: "pending", description: "", amount: "", notes: "" },
  });
  const dueDateValue = useWatch({ control: form.control, name: "due_date" }) ?? "";
  async function submit(values: ExpenseForm) {
    try {
      await createExpense(createClient(), values);
      form.reset({ due_date: todayBr(), payment_method: "pix", category: "other", status: "pending", description: "", amount: "", notes: "" });
      const monthValue = values.due_date.slice(0, 7);
      onFeedback({
        tone: "success",
        title: "Gasto registrado",
        description: `Ele ja aparece em ${monthLabel(monthValue)} como ${values.status === "paid" ? "pago" : "pendente"}.`,
        href: `/inicio?mes=${monthValue}`,
        hrefLabel: "Ver no Inicio",
      });
    } catch (err) {
      onFeedback({ tone: "error", title: "Nao foi possivel salvar o gasto", description: err instanceof Error ? err.message : "Tente novamente." });
    }
  }
  return (
    <FormCard onSubmit={form.handleSubmit(submit)} submitLabel="Salvar gasto">
      <TextInput label="Descricao" error={form.formState.errors.description?.message} {...form.register("description")} />
      <TextInput label="Valor" inputMode="decimal" placeholder="99,90" error={form.formState.errors.amount?.message} {...form.register("amount")} />
      <DateInput
        label="Data de vencimento ou pagamento"
        error={form.formState.errors.due_date?.message}
        value={dueDateValue}
        onChange={(value) => form.setValue("due_date", value, { shouldDirty: true, shouldValidate: false })}
        onBlur={() => form.trigger("due_date")}
      />
      <Select label="Forma de pagamento" {...form.register("payment_method")}>
        <option value="pix">Pix</option>
        <option value="cash">Dinheiro</option>
        <option value="debit">Debito</option>
        <option value="boleto">Boleto</option>
        <option value="other">Outro</option>
      </Select>
      <CategorySelect {...form.register("category")} />
      <Select label="Status" {...form.register("status")}>
        <option value="pending">Pendente</option>
        <option value="paid">Pago</option>
      </Select>
      <TextArea label="Observacao" {...form.register("notes")} />
    </FormCard>
  );
}

function PayableFormView({ onFeedback }: { onFeedback: (value: Feedback) => void }) {
  const [amountMode, setAmountMode] = useState<"total" | "installment">("total");
  const form = useForm<PayableInput, unknown, PayableForm>({
    resolver: zodResolver(payableSchema),
    defaultValues: { purchase_date: todayBr(), due_date: todayBr(), category: "other", status: "pending", installments_count: 1, description: "", amount: "", notes: "" },
  });
  const purchaseDateValue = useWatch({ control: form.control, name: "purchase_date" }) ?? "";
  const dueDateValue = useWatch({ control: form.control, name: "due_date" }) ?? "";
  const watchedAmount = useWatch({ control: form.control, name: "amount" });
  const watchedInstallments = useWatch({ control: form.control, name: "installments_count" });
  const enteredAmount = toNumber(String(watchedAmount ?? ""));
  const installmentsCount = Math.max(1, Number(watchedInstallments ?? 1));
  const totalAmount = Number.isFinite(enteredAmount) && enteredAmount > 0
    ? amountMode === "installment" ? enteredAmount * installmentsCount : enteredAmount
    : 0;
  const installmentAmount = totalAmount > 0 ? totalAmount / installmentsCount : 0;
  async function submit(values: PayableForm) {
    try {
      await createPayable(createClient(), {
        ...values,
        amount: amountMode === "installment" ? values.amount * Number(values.installments_count) : values.amount,
      });
      form.reset({ purchase_date: todayBr(), due_date: todayBr(), category: "other", status: "pending", installments_count: 1, description: "", amount: "", notes: "" });
      setAmountMode("total");
      const monthValue = values.due_date.slice(0, 7);
      const count = Number(values.installments_count);
      onFeedback({
        tone: "success",
        title: "Conta a pagar registrada",
        description: count === 1
          ? `Ela ja aparece em ${monthLabel(monthValue)} como ${values.status === "paid" ? "paga" : "pendente"}.`
          : `${count} parcelas foram criadas a partir de ${monthLabel(monthValue)}.`,
        href: `/inicio?mes=${monthValue}`,
        hrefLabel: "Ver no Inicio",
      });
    } catch (err) {
      onFeedback({ tone: "error", title: "Nao foi possivel salvar a conta", description: err instanceof Error ? err.message : "Tente novamente." });
    }
  }
  return (
    <FormCard onSubmit={form.handleSubmit(submit)} submitLabel="Salvar conta a pagar">
      <TextInput label="Descricao" error={form.formState.errors.description?.message} {...form.register("description")} />
      <div className="grid grid-cols-2 rounded-lg border border-gray-200 bg-white p-1">
        <button
          type="button"
          onClick={() => setAmountMode("total")}
          className={`h-10 rounded-md text-sm font-bold ${amountMode === "total" ? "bg-gray-950 text-white" : "text-gray-600"}`}
        >
          Valor total
        </button>
        <button
          type="button"
          onClick={() => setAmountMode("installment")}
          className={`h-10 rounded-md text-sm font-bold ${amountMode === "installment" ? "bg-gray-950 text-white" : "text-gray-600"}`}
        >
          Por parcela
        </button>
      </div>
      <TextInput label={amountMode === "total" ? "Valor total" : "Valor da parcela"} inputMode="decimal" placeholder={amountMode === "total" ? "250,00" : "49,90"} error={form.formState.errors.amount?.message} {...form.register("amount")} />
      <DateInput
        label="Data da compra"
        error={form.formState.errors.purchase_date?.message}
        value={purchaseDateValue}
        onChange={(value) => form.setValue("purchase_date", value, { shouldDirty: true, shouldValidate: false })}
        onBlur={() => form.trigger("purchase_date")}
      />
      <DateInput
        label="Data de vencimento"
        error={form.formState.errors.due_date?.message}
        value={dueDateValue}
        onChange={(value) => form.setValue("due_date", value, { shouldDirty: true, shouldValidate: false })}
        onBlur={() => form.trigger("due_date")}
      />
      <CategorySelect {...form.register("category")} />
      <TextInput label="Quantidade de parcelas" type="number" min="1" error={form.formState.errors.installments_count?.message} {...form.register("installments_count")} />
      {totalAmount > 0 ? (
        <div className="rounded-lg bg-gray-100 p-4">
          <p className="text-sm text-gray-500">{amountMode === "total" ? "Valor aproximado da parcela" : "Valor total calculado"}</p>
          <p className="text-xl font-bold">{formatCurrency(amountMode === "total" ? installmentAmount : totalAmount)}</p>
        </div>
      ) : null}
      <Select label="Status" {...form.register("status")}>
        <option value="pending">Pendente</option>
        <option value="paid">Pago</option>
      </Select>
      <TextArea label="Observacao" {...form.register("notes")} />
    </FormCard>
  );
}

function PurchaseFormView({ cards, onFeedback }: { cards: Card[]; onFeedback: (value: Feedback) => void }) {
  const [amountMode, setAmountMode] = useState<"installment" | "total">("installment");
  const form = useForm<PurchaseInput, unknown, PurchaseForm>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: { purchase_date: todayBr(), category: "other", installments_count: 1, is_ongoing: false, is_recurring: false, recurring_status: "inactive", start_installment: 1, description: "", card_id: "", installment_amount: "", notes: "" },
  });
  const purchaseDateValue = useWatch({ control: form.control, name: "purchase_date" }) ?? "";
  const watchedAmount = useWatch({ control: form.control, name: "installment_amount" });
  const watchedCount = useWatch({ control: form.control, name: "installments_count" });
  const watchedCategory = useWatch({ control: form.control, name: "category" });
  const isOngoing = useWatch({ control: form.control, name: "is_ongoing" });
  const isRecurring = useWatch({ control: form.control, name: "is_recurring" });
  const watchedStartInstallment = useWatch({ control: form.control, name: "start_installment" });
  const watchedCardId = useWatch({ control: form.control, name: "card_id" });
  const enteredAmount = toNumber(String(watchedAmount ?? ""));
  const count = Number(watchedCount ?? 1);
  const effectiveCount = isRecurring ? 12 : Number.isFinite(count) ? count : 1;
  const total = useMemo(
    () => amountMode === "total" ? enteredAmount : enteredAmount * effectiveCount,
    [amountMode, effectiveCount, enteredAmount],
  );
  const previewInstallmentAmount = effectiveCount > 0 ? total / effectiveCount : 0;
  const selectedCard = cards.find((card) => card.id === watchedCardId);
  const invoicePreview = useMemo(() => {
    const isoDate = dateBrToIso(purchaseDateValue);
    const startInstallment = isOngoing ? Number(watchedStartInstallment ?? 1) : 1;
    if (!selectedCard || !isoDate || !Number.isFinite(startInstallment) || startInstallment < 1) return null;
    const dueDate = getInvoiceDueDate({
      purchaseDate: isoDate,
      closingDay: selectedCard.closing_day,
      dueDay: selectedCard.due_day,
      installmentOffset: startInstallment - 1,
    });
    const monthValue = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, "0")}`;
    return {
      dueDate: toIsoDate(dueDate),
      monthValue,
    };
  }, [isOngoing, purchaseDateValue, selectedCard, watchedStartInstallment]);

  useEffect(() => {
    if (isRecurring) {
      form.setValue("installments_count", 12, { shouldDirty: true, shouldValidate: false });
      form.setValue("recurring_status", "active", { shouldDirty: true, shouldValidate: false });
    }
    if (watchedCategory !== "subscriptions") {
      form.setValue("is_recurring", false, { shouldDirty: true, shouldValidate: false });
      form.setValue("recurring_status", "inactive", { shouldDirty: true, shouldValidate: false });
    }
  }, [form, isRecurring, watchedCategory]);

  async function submit(values: PurchaseForm) {
    const card = cards.find((item) => item.id === values.card_id);
    if (!card) {
      onFeedback({ tone: "error", title: "Escolha um cartao valido" });
      return;
    }
    try {
      const effectiveInstallmentsCount = values.is_recurring && values.recurring_status === "active" ? 12 : values.installments_count;
      const normalizedValues = {
        description: values.description,
        card_id: values.card_id,
        purchase_date: values.purchase_date,
        category: values.category,
        installment_amount: amountMode === "total" ? values.installment_amount / effectiveInstallmentsCount : values.installment_amount,
        installments_count: effectiveInstallmentsCount,
        start_installment: values.is_ongoing ? values.start_installment : 1,
        is_recurring: values.is_recurring,
        recurring_status: values.is_recurring ? values.recurring_status : "inactive",
        notes: values.notes,
      };
      const result = await createCardPurchase(createClient(), { ...normalizedValues, card });
      const firstInstallment = result.installments[0];
      const lastInstallment = result.installments.at(-1);
      const monthValue = `${firstInstallment.invoice_year}-${String(firstInstallment.invoice_month).padStart(2, "0")}`;
      const createdCount = result.installments.length;
      form.reset({ purchase_date: todayBr(), category: "other", installments_count: 1, is_ongoing: false, is_recurring: false, recurring_status: "inactive", start_installment: 1, description: "", card_id: "", installment_amount: "", notes: "" });
      setAmountMode("installment");
      onFeedback({
        tone: "success",
        title: "Compra no cartao registrada",
        description:
          createdCount === 1
            ? `A parcela vence em ${formatDateBr(firstInstallment.due_date)} e aparece em ${monthLabel(monthValue)}.`
            : `${createdCount} parcelas foram criadas. A primeira aparece em ${monthLabel(monthValue)} e a ultima vence em ${formatDateBr(lastInstallment?.due_date ?? firstInstallment.due_date)}.`,
        href: `/inicio?mes=${monthValue}`,
        hrefLabel: `Ver ${monthLabel(monthValue)}`,
      });
    } catch (err) {
      onFeedback({ tone: "error", title: "Nao foi possivel salvar a compra", description: err instanceof Error ? err.message : "Tente novamente." });
    }
  }
  return (
    <FormCard onSubmit={form.handleSubmit(submit)} submitLabel="Salvar compra">
      {cards.length === 0 ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Cadastre um cartao ativo antes de registrar compras.</p> : null}
      <TextInput label="Descricao" error={form.formState.errors.description?.message} {...form.register("description")} />
      <Select label="Cartao" error={form.formState.errors.card_id?.message} {...form.register("card_id")}>
        <option value="">Escolha</option>
        {cards.map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}
      </Select>
      <DateInput
        label="Data original da compra"
        error={form.formState.errors.purchase_date?.message}
        value={purchaseDateValue}
        onChange={(value) => form.setValue("purchase_date", value, { shouldDirty: true, shouldValidate: false })}
        onBlur={() => form.trigger("purchase_date")}
      />
      <CategorySelect {...form.register("category")} />
      {watchedCategory === "subscriptions" ? (
        <>
          <label className="flex min-h-12 items-center justify-between rounded-lg border border-gray-200 px-3">
            <span className="text-sm font-medium text-gray-700">Assinatura recorrente</span>
            <input type="checkbox" {...form.register("is_recurring")} className="size-5 accent-gray-950" />
          </label>
          {isRecurring ? (
            <Select label="Status da assinatura" {...form.register("recurring_status")}>
              <option value="active">Ativa</option>
              <option value="inactive">Inativa</option>
            </Select>
          ) : null}
        </>
      ) : null}
      <div className="grid grid-cols-2 rounded-lg border border-gray-200 bg-white p-1">
        <button
          type="button"
          onClick={() => setAmountMode("installment")}
          className={`h-10 rounded-md text-sm font-bold ${amountMode === "installment" ? "bg-gray-950 text-white" : "text-gray-600"}`}
        >
          Por parcela
        </button>
        <button
          type="button"
          onClick={() => setAmountMode("total")}
          className={`h-10 rounded-md text-sm font-bold ${amountMode === "total" ? "bg-gray-950 text-white" : "text-gray-600"}`}
        >
          Valor total
        </button>
      </div>
      <TextInput
        label={amountMode === "installment" ? "Valor da parcela" : "Valor total"}
        inputMode="decimal"
        placeholder={amountMode === "installment" ? "120,00" : "1200,00"}
        error={form.formState.errors.installment_amount?.message}
        {...form.register("installment_amount")}
      />
      <TextInput
        label={isRecurring ? "Meses gerados" : "Quantidade de parcelas"}
        type="number"
        min="1"
        disabled={isRecurring}
        error={form.formState.errors.installments_count?.message}
        {...form.register("installments_count")}
      />
      <label className="flex min-h-12 items-center justify-between rounded-lg border border-gray-200 px-3">
        <span className="text-sm font-medium text-gray-700">Compra antiga em andamento</span>
        <input type="checkbox" {...form.register("is_ongoing")} className="size-5 accent-gray-950" />
      </label>
      {isOngoing ? (
        <TextInput label="Parcela inicial no sistema" type="number" min="1" error={form.formState.errors.start_installment?.message} {...form.register("start_installment")} />
      ) : null}
      <div className="rounded-lg bg-gray-100 p-4">
        <p className="text-sm text-gray-500">{amountMode === "installment" ? "Total calculado" : "Valor por parcela"}</p>
        <p className="text-xl font-bold">{formatCurrency(amountMode === "installment" ? total : previewInstallmentAmount)}</p>
      </div>
      {invoicePreview ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-bold">Previa da fatura</p>
          <p className="mt-1">
            A primeira parcela criada aparece em <strong>{monthLabel(invoicePreview.monthValue)}</strong> e vence em{" "}
            <strong>{formatDateBr(invoicePreview.dueDate)}</strong>.
          </p>
          {selectedCard ? (
            <p className="mt-2 text-xs">
              Cartao: fecha dia {selectedCard.closing_day}, vence dia {selectedCard.due_day}. Parcela inicial usada: {isOngoing ? Number(watchedStartInstallment ?? 1) : 1}.
            </p>
          ) : null}
        </div>
      ) : null}
      <TextArea label="Observacao" {...form.register("notes")} />
    </FormCard>
  );
}

function FormCard({ children, onSubmit, submitLabel, disabled = false }: { children: React.ReactNode; onSubmit: () => void; submitLabel: string; disabled?: boolean }) {
  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      {children}
      <button type="submit" disabled={disabled} className="h-12 w-full rounded-lg bg-gray-950 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{submitLabel}</button>
    </form>
  );
}

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string };

function TextInput({ label, error, ...props }: FieldProps) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <input {...props} className="h-12 w-full rounded-lg border border-gray-300 px-3 outline-none focus:border-gray-900" />
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : null}
    </label>
  );
}

function DateInput({
  label,
  error,
  value,
  onChange,
  onBlur,
}: {
  label: string;
  error?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceOnNextInputRef = useRef(false);

  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <input
        ref={inputRef}
        value={value}
        onFocus={() => {
          replaceOnNextInputRef.current = true;
          requestAnimationFrame(() => inputRef.current?.select());
        }}
        onChange={(event) => {
          const currentDigits = value.replace(/\D/g, "");
          const typedDigits = event.target.value.replace(/\D/g, "");
          const nextDigits =
            replaceOnNextInputRef.current && typedDigits.includes(currentDigits)
              ? typedDigits.replace(currentDigits, "")
              : typedDigits;

          replaceOnNextInputRef.current = false;
          onChange(maskDateBr(nextDigits));
        }}
        onBlur={() => {
          replaceOnNextInputRef.current = false;
          onBlur();
        }}
        inputMode="numeric"
        placeholder="dd/mm/aaaa"
        maxLength={10}
        className="h-12 w-full rounded-lg border border-gray-300 px-3 outline-none focus:border-gray-900"
      />
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : null}
    </label>
  );
}

function Select({ label, error, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <select {...props} className="h-12 w-full rounded-lg border border-gray-300 bg-white px-3 outline-none focus:border-gray-900">{children}</select>
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : null}
    </label>
  );
}

function CategorySelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Select label="Categoria" {...props}>
      {expenseCategories.map((category) => (
        <option key={category.value} value={category.value}>
          {category.label}
        </option>
      ))}
    </Select>
  );
}

function TextArea({ label, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <textarea {...props} rows={3} className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-gray-900" />
    </label>
  );
}
