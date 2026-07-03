"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, Landmark, Plus } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { ConfigNotice } from "@/components/layout/ConfigNotice";
import { createCashTransaction, createCashTransfer, fetchCashData, saveCashAccount } from "@/features/finance/api";
import { formatDateBr } from "@/lib/dates/format";
import { formatCurrency } from "@/lib/money/format";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import type { CashAccountWithBalance, CashTransaction } from "@/types/finance";

const today = () => new Date().toISOString().slice(0, 10);
const parseMoney = (value: string) => Number(value.replace(/\./g, "").replace(",", "."));

export default function CaixaPage() {
  const [accounts, setAccounts] = useState<CashAccountWithBalance[]>([]);
  const [transactions, setTransactions] = useState<(CashTransaction & { cash_accounts?: { name: string; color: string } | null })[]>([]);
  const [accountName, setAccountName] = useState("");
  const [accountColor, setAccountColor] = useState("#111827");
  const [transactionAccountId, setTransactionAccountId] = useState("");
  const [transactionType, setTransactionType] = useState<"income" | "expense">("income");
  const [transactionAmount, setTransactionAmount] = useState("");
  const [transactionDate, setTransactionDate] = useState(today());
  const [transactionDescription, setTransactionDescription] = useState("");
  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferDate, setTransferDate] = useState(today());
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!hasSupabaseConfig()) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchCashData(createClient());
      setAccounts(data.accounts);
      setTransactions(data.transactions);
      const firstActive = data.accounts.find((account) => account.is_active);
      setTransactionAccountId((current) => current || firstActive?.id || "");
      setFromAccountId((current) => current || firstActive?.id || "");
      setToAccountId((current) => current || data.accounts.find((account) => account.id !== firstActive?.id)?.id || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel carregar o caixa.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totalBalance = useMemo(() => accounts.reduce((sum, account) => sum + account.balance, 0), [accounts]);

  async function createAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accountName.trim()) {
      setError("Informe o nome da conta.");
      return;
    }
    setError("");
    setFeedback("");
    try {
      await saveCashAccount(createClient(), { name: accountName.trim(), color: accountColor, is_active: true });
      setAccountName("");
      setAccountColor("#111827");
      setFeedback("Conta criada.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel criar a conta.");
    }
  }

  async function createManualTransaction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = parseMoney(transactionAmount);
    if (!transactionAccountId || !Number.isFinite(amount) || amount <= 0 || !transactionDescription.trim()) {
      setError("Preencha conta, descricao e valor valido.");
      return;
    }
    setError("");
    setFeedback("");
    try {
      await createCashTransaction(createClient(), {
        account_id: transactionAccountId,
        type: transactionType,
        amount: transactionType === "income" ? amount : -amount,
        date: transactionDate,
        description: transactionDescription.trim(),
        source_type: "manual",
        source_id: null,
        notes: null,
      });
      setTransactionAmount("");
      setTransactionDescription("");
      setFeedback("Movimentacao registrada.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel registrar a movimentacao.");
    }
  }

  async function createTransfer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = parseMoney(transferAmount);
    if (!fromAccountId || !toAccountId || fromAccountId === toAccountId || !Number.isFinite(amount) || amount <= 0) {
      setError("Escolha duas contas diferentes e um valor valido.");
      return;
    }
    setError("");
    setFeedback("");
    try {
      await createCashTransfer(createClient(), {
        from_account_id: fromAccountId,
        to_account_id: toAccountId,
        amount,
        date: transferDate,
        description: "Transferencia entre contas",
        notes: null,
      });
      setTransferAmount("");
      setFeedback("Transferencia registrada.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel transferir.");
    }
  }

  return (
    <AuthGuard>
      <AppShell title="Caixa" subtitle="Contas e movimentacoes">
        {!hasSupabaseConfig() ? <ConfigNotice /> : null}
        {error ? <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        {feedback ? <p className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{feedback}</p> : null}

        <section className="mb-5 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-gray-500">Saldo total</p>
          <p className={`mt-1 text-3xl font-bold ${totalBalance >= 0 ? "text-emerald-600" : "text-red-600"}`}>{formatCurrency(totalBalance)}</p>
          {loading ? <p className="mt-2 text-sm text-gray-500">Atualizando...</p> : null}
        </section>

        <section className="mb-5 grid gap-3 md:grid-cols-3">
          {accounts.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500 md:col-span-3">Crie sua primeira conta para comecar o controle de caixa.</div>
          ) : (
            accounts.map((account) => (
              <div key={account.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="size-3 rounded-full" style={{ background: account.color }} />
                  <p className="truncate font-bold">{account.name}</p>
                </div>
                <p className={`mt-3 text-xl font-bold ${account.balance >= 0 ? "text-gray-950" : "text-red-600"}`}>{formatCurrency(account.balance)}</p>
                <p className="mt-1 text-xs text-gray-500">{account.is_active ? "Ativa" : "Inativa"}</p>
              </div>
            ))
          )}
        </section>

        <section className="mb-5 grid gap-4 lg:grid-cols-3">
          <form onSubmit={createAccount} className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="flex items-center gap-2 font-bold"><Landmark size={18} /> Nova conta</h2>
            <Input label="Nome" value={accountName} onChange={setAccountName} placeholder="Nubank, Itau..." />
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Cor</span>
              <input type="color" value={accountColor} onChange={(event) => setAccountColor(event.target.value)} className="h-11 w-full rounded-lg border border-gray-300 bg-white px-2" />
            </label>
            <button type="submit" className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gray-950 font-bold text-white"><Plus size={17} /> Criar</button>
          </form>

          <form onSubmit={createManualTransaction} className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="flex items-center gap-2 font-bold">{transactionType === "income" ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />} Movimentar</h2>
            <Select label="Conta" value={transactionAccountId} onChange={setTransactionAccountId}>
              <option value="">Escolha</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </Select>
            <Select label="Tipo" value={transactionType} onChange={(value) => setTransactionType(value as "income" | "expense")}>
              <option value="income">Adicionar dinheiro</option>
              <option value="expense">Tirar dinheiro</option>
            </Select>
            <Input label="Descricao" value={transactionDescription} onChange={setTransactionDescription} />
            <Input label="Valor" value={transactionAmount} onChange={setTransactionAmount} inputMode="decimal" placeholder="100,00" />
            <Input label="Data" value={transactionDate} onChange={setTransactionDate} type="date" />
            <button type="submit" className="h-11 w-full rounded-lg bg-gray-950 font-bold text-white">Salvar</button>
          </form>

          <form onSubmit={createTransfer} className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="flex items-center gap-2 font-bold"><ArrowRightLeft size={18} /> Transferir</h2>
            <Select label="Sai de" value={fromAccountId} onChange={setFromAccountId}>
              <option value="">Escolha</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </Select>
            <Select label="Entra em" value={toAccountId} onChange={setToAccountId}>
              <option value="">Escolha</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </Select>
            <Input label="Valor" value={transferAmount} onChange={setTransferAmount} inputMode="decimal" placeholder="100,00" />
            <Input label="Data" value={transferDate} onChange={setTransferDate} type="date" />
            <button type="submit" className="h-11 w-full rounded-lg bg-gray-950 font-bold text-white">Transferir</button>
          </form>
        </section>

        <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 p-4">
            <h2 className="font-bold">Historico recente</h2>
          </div>
          {transactions.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">Nenhuma movimentacao registrada.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {transactions.map((transaction) => (
                <div key={transaction.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{transaction.description}</p>
                    <p className="text-sm text-gray-500">{transaction.cash_accounts?.name ?? "Conta"} - {formatDateBr(transaction.date)}</p>
                  </div>
                  <p className={`shrink-0 font-bold ${Number(transaction.amount) >= 0 ? "text-emerald-600" : "text-red-600"}`}>{formatCurrency(transaction.amount)}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </AppShell>
    </AuthGuard>
  );
}

function Input({ label, value, onChange, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <input {...props} value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-full rounded-lg border border-gray-300 px-3 outline-none focus:border-gray-900" />
    </label>
  );
}

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 outline-none focus:border-gray-900">
        {children}
      </select>
    </label>
  );
}
