"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CreditCard, Home, ListFilter, LogOut, PlusCircle } from "lucide-react";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";

const nav = [
  { href: "/inicio", label: "Inicio", icon: Home },
  { href: "/registrar", label: "Registrar", icon: PlusCircle },
  { href: "/cartoes", label: "Cartoes", icon: CreditCard },
  { href: "/lista", label: "Lista", icon: ListFilter },
];

export function AppShell({
  children,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    if (!hasSupabaseConfig()) return;
    await createClient().auth.signOut();
    router.push("/login");
  }

  return (
    <div className="min-h-dvh bg-[#F3F4F6] pb-24">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Meu Controle Financeiro
            </p>
            <h1 className="text-xl font-bold text-gray-950">{title}</h1>
            {subtitle ? <p className="text-sm text-gray-500">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={signOut}
            aria-label="Sair"
            title="Sair"
            className="grid size-11 place-items-center rounded-lg border border-gray-200 bg-white text-gray-700 shadow-sm"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-5">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white">
        <div className="mx-auto grid max-w-5xl grid-cols-4 px-2 pb-[env(safe-area-inset-bottom)]">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg text-xs font-semibold ${
                  active ? "text-gray-950" : "text-gray-500"
                }`}
              >
                <Icon size={22} strokeWidth={active ? 2.8 : 2} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
