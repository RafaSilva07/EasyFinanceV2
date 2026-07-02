"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { hasSupabaseConfig, createClient } from "@/lib/supabase/client";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!hasSupabaseConfig()) {
      setReady(true);
      return;
    }

    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace("/login");
      setReady(true);
    });
  }, [router]);

  if (!ready) {
    return (
      <div className="grid min-h-dvh place-items-center bg-[#F3F4F6] px-4 text-sm text-gray-600">
        Carregando...
      </div>
    );
  }

  return children;
}
