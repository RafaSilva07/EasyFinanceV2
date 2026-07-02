export function ConfigNotice() {
  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      Configure <strong>NEXT_PUBLIC_SUPABASE_URL</strong> e{" "}
      <strong>NEXT_PUBLIC_SUPABASE_ANON_KEY</strong> no arquivo <strong>.env.local</strong>{" "}
      para conectar autenticacao e banco. O SQL esta em{" "}
      <strong>supabase/migrations/001_initial_schema.sql</strong>.
    </div>
  );
}
