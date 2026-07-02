import type { PaymentStatus } from "@/types/finance";

export function StatusBadge({ status }: { status: PaymentStatus }) {
  const isPaid = status === "paid";
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
        isPaid ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
      }`}
    >
      {isPaid ? "Pago" : "Pendente"}
    </span>
  );
}
