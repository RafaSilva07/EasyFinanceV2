"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, Edit3, Landmark, Plus, Trash2, Undo2, X } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { ConfigNotice } from "@/components/layout/ConfigNotice";
import { createCashTransaction, createCashTransfer, deleteCashAccount, deleteCashTransaction, fetchCashData, saveCashAccount, undoCashTransaction } from "@/features/finance/api";
import { formatDateBr } from "@/lib/dates/format";
import { formatCurrency } from "@/lib/money/format";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import type { CashAccountWithBalance, CashTransactionWithActions } from "@/types/finance";
import { useOperation } from "@/components/providers/OperationProvider";

type CashActionRequest = {
  action: "undo" | "delete";
  transaction: CashTransactionWithActions;
};

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
const parseMoney = (value: string) => Number(value.replace(/\./g, "").replace(",", "."));

export default function CaixaPage() {
  const [accounts, setAccounts] = useState<CashAccountWithBalance[]>([]);
  const [transactions, setTransactions] = useState<CashTransactionWithActions[]>([]);
  const [editingAccount, setEditingAccount] = useState<CashAccountWithBalance | null>(null);
  const [editAccountName, setEditAccountName] = useState("");
  const [editAccountColor, setEditAccountColor] = useState("#111827");
  const [editAccountActive, setEditAccountActive] = useState(true);
  const [accountName, setAccountName] = useState("");
  const [accountColor, setAccountColor] = useState("#111827");
  const [transactionAccountId, setTransactionAccountId] = useState("");
  const [transactionType, setTransactionType] = useState<"income" | "expense">("income");
  const [transactionAmount, setTransactionAmount] = useState("");
  const [transactionDate, setTransactionDate] = useState(todayBr());
  const [transactionDescription, setTransactionDescription] = useState("");
  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferDate, setTransferDate] = useState(todayBr());
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [cashAction, setCashAction] = useState<CashActionRequest | null>(null);
  const [cashActionSaving, setCashActionSaving] = useState(false);
  const { runMutation, runQuery } = useOperation();

  const load = useCallback(async () => {
    if (!hasSupabaseConfig()) return;
    setLoading(true);
    setError("");
    try {
      await runQuery("Carregando caixa...", async () => {
        const data = await fetchCashData(createClient());
        setAccounts(data.accounts);
        setTransactions(data.transactions);
        const firstActive = data.accounts.find((account) => account.is_active);
        setTransactionAccountId((current) => current || firstActive?.id || "");
        setFromAccountId((current) => current || firstActive?.id || "");
        setToAccountId((current) => current || data.accounts.find((account) => account.id !== firstActive?.id)?.id || "");
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel carregar o caixa.");
    } finally {
      setLoading(false);
    }
  }, [runQuery]);

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
      await runMutation("Criando conta...", async () => {
        await saveCashAccount(createClient(), { name: accountName.trim(), color: accountColor, is_active: true });
        setAccountName("");
        setAccountColor("#111827");
        setFeedback("Conta criada.");
        await load();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel criar a conta.");
    }
  }

  function startEditAccount(account: CashAccountWithBalance) {
    setEditingAccount(account);
    setEditAccountName(account.name);
    setEditAccountColor(account.color);
    setEditAccountActive(account.is_active);
    setError("");
    setFeedback("");
  }

  async function updateAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingAccount || !editAccountName.trim()) {
      setError("Informe o nome da conta.");
      return;
    }
    setError("");
    setFeedback("");
    try {
      await runMutation("Atualizando conta...", async () => {
        await saveCashAccount(
          createClient(),
          { name: editAccountName.trim(), color: editAccountColor, is_active: editAccountActive },
          editingAccount.id,
        );
        setEditingAccount(null);
        setFeedback("Conta atualizada.");
        await load();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel editar a conta.");
    }
  }

  async function removeAccount(account: CashAccountWithBalance) {
    const confirmed = window.confirm(`Excluir a conta "${account.name}"? Contas com movimentacoes devem ser inativadas para preservar o historico.`);
    if (!confirmed) return;
    setError("");
    setFeedback("");
    try {
      await runMutation("Excluindo conta...", async () => {
        await deleteCashAccount(createClient(), account.id);
        setFeedback("Conta excluida.");
        await load();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel excluir a conta.");
    }
  }

  async function createManualTransaction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = parseMoney(transactionAmount);
    const isoDate = dateBrToIso(transactionDate);
    if (!transactionAccountId || !Number.isFinite(amount) || amount <= 0 || !transactionDescription.trim() || !isoDate) {
      setError("Preencha conta, descricao, valor e data valida.");
      return;
    }
    setError("");
    setFeedback("");
    try {
      await runMutation(transactionType === "income" ? "Adicionando dinheiro..." : "Retirando dinheiro...", async () => {
        await createCashTransaction(createClient(), {
          account_id: transactionAccountId,
          type: transactionType,
          amount: transactionType === "income" ? amount : -amount,
          date: isoDate,
          description: transactionDescription.trim(),
          source_type: "manual",
          source_id: null,
          notes: null,
        });
        setTransactionAmount("");
        setTransactionDescription("");
        setFeedback("Movimentacao registrada.");
        await load();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel registrar a movimentacao.");
    }
  }

  async function createTransfer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = parseMoney(transferAmount);
    const isoDate = dateBrToIso(transferDate);
    if (!fromAccountId || !toAccountId || fromAccountId === toAccountId || !Number.isFinite(amount) || amount <= 0 || !isoDate) {
      setError("Escolha duas contas diferentes, um valor e uma data valida.");
      return;
    }
    setError("");
    setFeedback("");
    try {
      await runMutation("Transferindo dinheiro...", async () => {
        await createCashTransfer(createClient(), {
          from_account_id: fromAccountId,
          to_account_id: toAccountId,
          amount,
          date: isoDate,
          description: "Transferencia entre contas",
          notes: null,
        });
        setTransferAmount("");
        setFeedback("Transferencia registrada.");
        await load();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel transferir.");
    }
  }

  async function confirmCashAction() {
    if (!cashAction) return;
    setCashActionSaving(true);
    setError("");
    setFeedback("");
    try {
      await runMutation(cashAction.action === "undo" ? "Desfazendo movimentacao..." : "Excluindo movimentacao...", async () => {
        if (cashAction.action === "undo") {
          await undoCashTransaction(createClient(), cashAction.transaction.id);
          setFeedback("Movimentacao desfeita e saldo atualizado.");
        } else {
          await deleteCashTransaction(createClient(), cashAction.transaction.id);
          setFeedback("Movimentacao excluida e saldo atualizado.");
        }
        setCashAction(null);
        await load();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel concluir a acao.");
    } finally {
      setCashActionSaving(false);
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
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="size-3 rounded-full" style={{ background: account.color }} />
                      <p className="truncate font-bold">{account.name}</p>
                    </div>
                    <p className={`mt-3 text-xl font-bold ${account.balance >= 0 ? "text-gray-950" : "text-red-600"}`}>{formatCurrency(account.balance)}</p>
                    <p className="mt-1 text-xs text-gray-500">{account.is_active ? "Ativa" : "Inativa"}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => startEditAccount(account)} aria-label="Editar conta" title="Editar conta" className="grid size-9 place-items-center rounded-lg border border-gray-200 text-gray-700">
                      <Edit3 size={16} />
                    </button>
                    <button type="button" onClick={() => removeAccount(account)} aria-label="Excluir conta" title="Excluir conta" className="grid size-9 place-items-center rounded-lg border border-red-200 text-red-700">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </section>

        {editingAccount ? (
          <div className="fixed inset-0 z-40 flex items-end bg-black/40 p-4 sm:items-center sm:justify-center">
            <form onSubmit={updateAccount} className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="font-bold">Editar conta</h2>
                <button type="button" onClick={() => setEditingAccount(null)} aria-label="Fechar" className="grid size-9 place-items-center rounded-lg border border-gray-200">
                  <X size={17} />
                </button>
              </div>
              <div className="space-y-3">
                <Input label="Nome" value={editAccountName} onChange={setEditAccountName} />
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Cor</span>
                  <input type="color" value={editAccountColor} onChange={(event) => setEditAccountColor(event.target.value)} className="h-11 w-full rounded-lg border border-gray-300 bg-white px-2" />
                </label>
                <label className="flex min-h-11 items-center justify-between rounded-lg border border-gray-200 px-3">
                  <span className="text-sm font-medium text-gray-700">Conta ativa</span>
                  <input type="checkbox" checked={editAccountActive} onChange={(event) => setEditAccountActive(event.target.checked)} className="size-5 accent-gray-950" />
                </label>
                <button type="submit" className="h-11 w-full rounded-lg bg-gray-950 font-bold text-white">Salvar alteracoes</button>
              </div>
            </form>
          </div>
        ) : null}

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
            <DateInput label="Data" value={transactionDate} onChange={setTransactionDate} />
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
            <DateInput label="Data" value={transferDate} onChange={setTransferDate} />
            <button type="submit" className="h-11 w-full rounded-lg bg-gray-950 font-bold text-white">Transferir</button>
          </form>
        </section>

        <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-gray-100 p-4">
            <h2 className="font-bold">Historico recente</h2>
            <Link href="/caixa/historico" className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-bold text-gray-700">
              Ver completo
            </Link>
          </div>
          {transactions.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">Nenhuma movimentacao registrada.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {transactions.map((transaction) => (
                <div key={transaction.id} className="flex flex-col items-stretch justify-between gap-3 p-4 sm:flex-row sm:items-center">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{transaction.description}</p>
                    <p className="text-sm text-gray-500">{transaction.cash_accounts?.name ?? "Conta"} - {formatDateBr(transaction.date)}</p>
                    {transaction.is_reversed ? <p className="mt-1 text-xs font-bold text-gray-500">Desfeita</p> : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 sm:justify-end">
                    <p className={`font-bold ${Number(transaction.amount) >= 0 ? "text-emerald-600" : "text-red-600"}`}>{formatCurrency(transaction.amount)}</p>
                    {transaction.can_undo ? (
                      <button type="button" onClick={() => setCashAction({ action: "undo", transaction })} title="Desfazer movimentacao" className="inline-flex h-9 items-center gap-1 rounded-lg border border-gray-200 px-2 text-xs font-bold text-gray-700">
                        <Undo2 size={15} /> Desfazer
                      </button>
                    ) : null}
                    {transaction.can_delete ? (
                      <button type="button" onClick={() => setCashAction({ action: "delete", transaction })} title="Excluir movimentacao" className="grid size-9 place-items-center rounded-lg border border-red-200 text-red-700">
                        <Trash2 size={15} />
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {cashAction ? (
          <CashActionDialog
            request={cashAction}
            saving={cashActionSaving}
            onClose={() => setCashAction(null)}
            onConfirm={confirmCashAction}
          />
        ) : null}
      </AppShell>
    </AuthGuard>
  );
}

function CashActionDialog({
  request,
  saving,
  onClose,
  onConfirm,
}: {
  request: CashActionRequest;
  saving: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { action, transaction } = request;
  const isTransfer = transaction.source_type === "transfer";
  const sourceImpact = transaction.source_type === "entry"
    ? "A entrada vinculada sera removida e o credito sera estornado."
    : transaction.source_type === "expense"
      ? "O gasto voltara para pendente e o valor retornara para a conta."
      : transaction.source_type === "payable"
        ? "A conta a pagar voltara para pendente e o valor retornara para a conta."
        : transaction.source_type === "card_invoice"
          ? "A fatura voltara para pendente e o valor retornara para a conta."
          : isTransfer
            ? action === "undo"
              ? "As duas pontas da transferencia receberao estornos."
              : "A saida e a entrada da transferencia serao removidas."
            : action === "undo"
              ? "Uma movimentacao inversa sera criada para preservar o historico."
              : "O lancamento manual sera removido definitivamente.";

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 p-4 sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-label={`${action === "undo" ? "Desfazer" : "Excluir"} movimentacao`}>
      <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold">{action === "undo" ? "Desfazer movimentacao" : "Excluir movimentacao"}</h2>
            <p className="mt-1 text-sm text-gray-500">{transaction.description}</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Fechar" title="Fechar" className="grid size-9 shrink-0 place-items-center rounded-lg border border-gray-200 text-gray-700 disabled:opacity-50">
            <X size={17} />
          </button>
        </div>
        <div className="my-4 rounded-lg bg-gray-100 p-4">
          <p className="text-sm text-gray-500">Impacto original no saldo</p>
          <p className={`mt-1 text-xl font-bold ${Number(transaction.amount) >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatCurrency(transaction.amount)}</p>
          <p className="mt-3 text-sm text-gray-700">{sourceImpact}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="h-11 rounded-lg border border-gray-200 font-bold text-gray-700 disabled:opacity-50">Cancelar</button>
          <button type="button" onClick={onConfirm} disabled={saving} className={`h-11 rounded-lg font-bold text-white disabled:opacity-50 ${action === "delete" ? "bg-red-700" : "bg-gray-950"}`}>
            {saving ? "Processando..." : action === "undo" ? "Confirmar estorno" : "Confirmar exclusao"}
          </button>
        </div>
      </div>
    </div>
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

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(maskDateBr(event.target.value))}
        inputMode="numeric"
        placeholder="dd/mm/aaaa"
        maxLength={10}
        className="h-11 w-full rounded-lg border border-gray-300 px-3 outline-none focus:border-gray-900"
      />
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
