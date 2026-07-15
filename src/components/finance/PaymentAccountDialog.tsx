"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Landmark, WalletCards, X } from "lucide-react";
import { formatCurrency } from "@/lib/money/format";
import type { CashAccountWithBalance } from "@/types/finance";

export type PaymentRequest = {
  sourceType: "expense" | "payable" | "card_invoice";
  sourceIds: string[];
  description: string;
  amount: number;
};

export function PaymentAccountDialog({
  request,
  accounts,
  onClose,
  onConfirm,
}: {
  request: PaymentRequest;
  accounts: CashAccountWithBalance[];
  onClose: () => void;
  onConfirm: (accountId: string | null) => Promise<void>;
}) {
  const activeAccounts = useMemo(() => accounts.filter((account) => account.is_active), [accounts]);
  const [accountId, setAccountId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const suggested = activeAccounts.find((account) => Number(account.balance) >= request.amount);
    setAccountId(suggested?.id ?? activeAccounts[0]?.id ?? "external");
    setError("");
  }, [activeAccounts, request]);

  const isExternalPayment = accountId === "external";
  const selectedAccount = activeAccounts.find((account) => account.id === accountId);
  const projectedBalance = selectedAccount ? Number(selectedAccount.balance) - request.amount : null;
  const hasEnoughBalance = isExternalPayment || (projectedBalance !== null && projectedBalance >= 0);

  async function confirm() {
    if (!accountId || !hasEnoughBalance) return;
    setSaving(true);
    setError("");
    try {
      await onConfirm(isExternalPayment ? null : accountId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel concluir o pagamento.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 p-4 sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-label="Escolher conta para pagamento">
      <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-4 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold">Pagar pelo caixa</h2>
            <p className="mt-1 text-sm text-gray-500">{request.description}</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Fechar" title="Fechar" className="grid size-9 shrink-0 place-items-center rounded-lg border border-gray-200 text-gray-700 disabled:opacity-50">
            <X size={17} />
          </button>
        </div>

        <div className="mb-4 rounded-lg bg-gray-100 p-4">
          <p className="text-sm text-gray-500">Valor do pagamento</p>
          <p className="mt-1 text-2xl font-bold text-gray-950">{formatCurrency(request.amount)}</p>
        </div>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium text-gray-700">Forma de baixa</legend>
          <label className={`flex min-h-16 items-center gap-3 rounded-lg border px-3 py-2 ${isExternalPayment ? "border-gray-950" : "border-gray-200"}`}>
            <input type="radio" name="payment-account" value="external" checked={isExternalPayment} onChange={() => setAccountId("external")} className="size-4 accent-gray-950" />
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-gray-100 text-gray-700"><WalletCards size={18} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-gray-900">Pagamento externo</span>
              <span className="block text-xs text-gray-500">Marca como pago sem alterar o Caixa</span>
            </span>
          </label>
          {activeAccounts.length === 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-bold">Nenhuma conta ativa disponivel.</p>
              <Link href="/caixa" className="mt-3 inline-flex rounded-lg bg-gray-950 px-3 py-2 font-bold text-white">Criar conta no Caixa</Link>
            </div>
          ) : (
            <>
            {activeAccounts.map((account) => {
              const projected = Number(account.balance) - request.amount;
              const sufficient = projected >= 0;
              return (
                <label key={account.id} className={`flex min-h-16 items-center gap-3 rounded-lg border px-3 py-2 ${accountId === account.id ? "border-gray-950" : "border-gray-200"}`}>
                  <input type="radio" name="payment-account" value={account.id} checked={accountId === account.id} onChange={() => setAccountId(account.id)} className="size-4 accent-gray-950" />
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-gray-100" style={{ color: account.color }}><Landmark size={18} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-gray-900">{account.name}</span>
                    <span className="block text-xs text-gray-500">Saldo {formatCurrency(account.balance)}</span>
                  </span>
                  <span className={`shrink-0 text-right text-xs font-bold ${sufficient ? "text-emerald-700" : "text-red-700"}`}>
                    {formatCurrency(projected)}
                    <span className="block font-medium">depois</span>
                  </span>
                </label>
              );
            })}
            </>
          )}
        </fieldset>

        {selectedAccount && !hasEnoughBalance ? <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">Saldo insuficiente nesta conta.</p> : null}
        {error ? <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="h-11 rounded-lg border border-gray-200 font-bold text-gray-700 disabled:opacity-50">Cancelar</button>
          <button type="button" onClick={confirm} disabled={saving || !accountId || !hasEnoughBalance} className="h-11 rounded-lg bg-gray-950 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? "Pagando..." : "Confirmar pagamento"}
          </button>
        </div>
      </div>
    </div>
  );
}
