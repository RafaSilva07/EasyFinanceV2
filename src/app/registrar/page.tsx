"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Banknote, CreditCard, Receipt } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { ConfigNotice } from "@/components/layout/ConfigNotice";
import { createCardPurchase, createEntry, createExpense, fetchCards } from "@/features/finance/api";
import { formatCurrency, toNumber } from "@/lib/money/format";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import type { Card } from "@/types/finance";

const today = () => new Date().toISOString().slice(0, 10);

const money = z.string().min(1, "Informe o valor").transform(toNumber).pipe(z.number().positive("Informe um valor maior que zero"));
const optionalText = z.string().optional().transform((value) => value?.trim() || null);

const entrySchema = z.object({
  description: z.string().min(1, "Informe a descricao"),
  amount: money,
  date: z.string().min(1, "Informe a data"),
  notes: optionalText,
});

const expenseSchema = z.object({
  description: z.string().min(1, "Informe a descricao"),
  amount: money,
  due_date: z.string().min(1, "Informe a data"),
  payment_method: z.enum(["pix", "cash", "debit", "boleto", "other"]),
  status: z.enum(["pending", "paid"]),
  notes: optionalText,
});

const purchaseSchema = z.object({
  description: z.string().min(1, "Informe a descricao"),
  card_id: z.string().min(1, "Escolha um cartao"),
  purchase_date: z.string().min(1, "Informe a data"),
  installment_amount: money,
  installments_count: z.coerce.number().int().min(1, "Minimo 1 parcela"),
  start_installment: z.coerce.number().int().min(1, "Minimo 1"),
  notes: optionalText,
}).refine((data) => data.start_installment <= data.installments_count, {
  message: "A parcela inicial nao pode ser maior que o total",
  path: ["start_installment"],
});

type Mode = "entry" | "expense" | "purchase";
type EntryInput = z.input<typeof entrySchema>;
type EntryForm = z.output<typeof entrySchema>;
type ExpenseInput = z.input<typeof expenseSchema>;
type ExpenseForm = z.output<typeof expenseSchema>;
type PurchaseInput = z.input<typeof purchaseSchema>;
type PurchaseForm = z.output<typeof purchaseSchema>;

export default function RegistrarPage() {
  const [mode, setMode] = useState<Mode>("expense");
  const [cards, setCards] = useState<Card[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadCards() {
    if (!hasSupabaseConfig()) return;
    setCards((await fetchCards(createClient())).filter((card) => card.is_active));
  }

  useEffect(() => {
    loadCards();
  }, []);

  return (
    <AuthGuard>
      <AppShell title="Registrar" subtitle="Entradas, gastos e compras">
        {!hasSupabaseConfig() ? <ConfigNotice /> : null}
        <div className="mb-5 grid grid-cols-3 gap-2">
          <ModeButton active={mode === "entry"} label="Entrada" icon={<Banknote size={19} />} onClick={() => setMode("entry")} />
          <ModeButton active={mode === "expense"} label="Gasto" icon={<Receipt size={19} />} onClick={() => setMode("expense")} />
          <ModeButton active={mode === "purchase"} label="Cartao" icon={<CreditCard size={19} />} onClick={() => setMode("purchase")} />
        </div>
        {message ? <p className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}
        {error ? <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        {mode === "entry" ? <EntryFormView onDone={setMessage} onError={setError} /> : null}
        {mode === "expense" ? <ExpenseFormView onDone={setMessage} onError={setError} /> : null}
        {mode === "purchase" ? <PurchaseFormView cards={cards} onDone={setMessage} onError={setError} /> : null}
      </AppShell>
    </AuthGuard>
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

function EntryFormView({ onDone, onError }: { onDone: (value: string) => void; onError: (value: string) => void }) {
  const form = useForm<EntryInput, unknown, EntryForm>({
    resolver: zodResolver(entrySchema),
    defaultValues: { date: today(), description: "", amount: "", notes: "" },
  });
  async function submit(values: EntryForm) {
    try {
      await createEntry(createClient(), values);
      form.reset({ date: today(), description: "", amount: "", notes: "" });
      onDone("Entrada registrada.");
      onError("");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Erro ao salvar entrada.");
    }
  }
  return (
    <FormCard onSubmit={form.handleSubmit(submit)} submitLabel="Salvar entrada">
      <TextInput label="Descricao" error={form.formState.errors.description?.message} {...form.register("description")} />
      <TextInput label="Valor" inputMode="decimal" placeholder="3000,00" error={form.formState.errors.amount?.message} {...form.register("amount")} />
      <TextInput label="Data" type="date" error={form.formState.errors.date?.message} {...form.register("date")} />
      <TextArea label="Observacao" {...form.register("notes")} />
    </FormCard>
  );
}

function ExpenseFormView({ onDone, onError }: { onDone: (value: string) => void; onError: (value: string) => void }) {
  const form = useForm<ExpenseInput, unknown, ExpenseForm>({
    resolver: zodResolver(expenseSchema),
    defaultValues: { due_date: today(), payment_method: "pix", status: "pending", description: "", amount: "", notes: "" },
  });
  async function submit(values: ExpenseForm) {
    try {
      await createExpense(createClient(), values);
      form.reset({ due_date: today(), payment_method: "pix", status: "pending", description: "", amount: "", notes: "" });
      onDone("Gasto registrado.");
      onError("");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Erro ao salvar gasto.");
    }
  }
  return (
    <FormCard onSubmit={form.handleSubmit(submit)} submitLabel="Salvar gasto">
      <TextInput label="Descricao" error={form.formState.errors.description?.message} {...form.register("description")} />
      <TextInput label="Valor" inputMode="decimal" placeholder="99,90" error={form.formState.errors.amount?.message} {...form.register("amount")} />
      <TextInput label="Data de vencimento ou pagamento" type="date" error={form.formState.errors.due_date?.message} {...form.register("due_date")} />
      <Select label="Forma de pagamento" {...form.register("payment_method")}>
        <option value="pix">Pix</option>
        <option value="cash">Dinheiro</option>
        <option value="debit">Debito</option>
        <option value="boleto">Boleto</option>
        <option value="other">Outro</option>
      </Select>
      <Select label="Status" {...form.register("status")}>
        <option value="pending">Pendente</option>
        <option value="paid">Pago</option>
      </Select>
      <TextArea label="Observacao" {...form.register("notes")} />
    </FormCard>
  );
}

function PurchaseFormView({ cards, onDone, onError }: { cards: Card[]; onDone: (value: string) => void; onError: (value: string) => void }) {
  const form = useForm<PurchaseInput, unknown, PurchaseForm>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: { purchase_date: today(), installments_count: 1, start_installment: 1, description: "", card_id: "", installment_amount: "", notes: "" },
  });
  const watchedAmount = useWatch({ control: form.control, name: "installment_amount" });
  const watchedCount = useWatch({ control: form.control, name: "installments_count" });
  const amount = toNumber(String(watchedAmount ?? ""));
  const count = Number(watchedCount ?? 1);
  const total = useMemo(() => amount * (Number.isFinite(count) ? count : 1), [amount, count]);

  async function submit(values: PurchaseForm) {
    const card = cards.find((item) => item.id === values.card_id);
    if (!card) {
      onError("Escolha um cartao valido.");
      return;
    }
    try {
      await createCardPurchase(createClient(), { ...values, card });
      form.reset({ purchase_date: today(), installments_count: 1, start_installment: 1, description: "", card_id: "", installment_amount: "", notes: "" });
      onDone("Compra no cartao registrada.");
      onError("");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Erro ao salvar compra.");
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
      <TextInput label="Data original da compra" type="date" error={form.formState.errors.purchase_date?.message} {...form.register("purchase_date")} />
      <TextInput label="Valor da parcela" inputMode="decimal" placeholder="120,00" error={form.formState.errors.installment_amount?.message} {...form.register("installment_amount")} />
      <TextInput label="Quantidade de parcelas" type="number" min="1" error={form.formState.errors.installments_count?.message} {...form.register("installments_count")} />
      <TextInput label="Parcela inicial no sistema" type="number" min="1" error={form.formState.errors.start_installment?.message} {...form.register("start_installment")} />
      <div className="rounded-lg bg-gray-100 p-4">
        <p className="text-sm text-gray-500">Total calculado</p>
        <p className="text-xl font-bold">{formatCurrency(total)}</p>
      </div>
      <TextArea label="Observacao" {...form.register("notes")} />
    </FormCard>
  );
}

function FormCard({ children, onSubmit, submitLabel }: { children: React.ReactNode; onSubmit: () => void; submitLabel: string }) {
  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      {children}
      <button type="submit" className="h-12 w-full rounded-lg bg-gray-950 font-bold text-white">{submitLabel}</button>
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

function Select({ label, error, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <select {...props} className="h-12 w-full rounded-lg border border-gray-300 bg-white px-3 outline-none focus:border-gray-900">{children}</select>
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : null}
    </label>
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
