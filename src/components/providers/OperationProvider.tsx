"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";

type Operation = {
  id: number;
  kind: "query" | "mutation";
  label: string;
};

type OperationContextValue = {
  isBusy: boolean;
  runMutation: <T>(label: string, action: () => Promise<T>) => Promise<T>;
  runQuery: <T>(label: string, action: () => Promise<T>) => Promise<T>;
};

const OperationContext = createContext<OperationContextValue | null>(null);

export function OperationProvider({ children }: { children: React.ReactNode }) {
  const [operations, setOperations] = useState<Operation[]>([]);
  const nextIdRef = useRef(0);
  const mutationPromiseRef = useRef<Promise<unknown> | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const runTracked = useCallback(async <T,>(kind: Operation["kind"], label: string, action: () => Promise<T>) => {
    const operation = { id: ++nextIdRef.current, kind, label };
    setOperations((current) => [...current, operation]);
    try {
      return await action();
    } finally {
      setOperations((current) => current.filter((item) => item.id !== operation.id));
    }
  }, []);

  const runQuery = useCallback(<T,>(label: string, action: () => Promise<T>) => runTracked("query", label, action), [runTracked]);

  const runMutation = useCallback(<T,>(label: string, action: () => Promise<T>) => {
    if (mutationPromiseRef.current) return mutationPromiseRef.current as Promise<T>;

    const promise = runTracked("mutation", label, action);
    mutationPromiseRef.current = promise;
    void promise.then(
      () => {
        if (mutationPromiseRef.current === promise) mutationPromiseRef.current = null;
      },
      () => {
        if (mutationPromiseRef.current === promise) mutationPromiseRef.current = null;
      },
    );
    return promise;
  }, [runTracked]);

  const isBusy = operations.length > 0;
  const visibleOperation = [...operations].reverse().find((operation) => operation.kind === "mutation") ?? operations.at(-1);

  useEffect(() => {
    if (!isBusy) return;
    const previousOverflow = document.body.style.overflow;
    const blockKeyboard = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", blockKeyboard, true);
    overlayRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", blockKeyboard, true);
    };
  }, [isBusy]);

  const value = useMemo(() => ({ isBusy, runMutation, runQuery }), [isBusy, runMutation, runQuery]);

  return (
    <OperationContext.Provider value={value}>
      <div aria-busy={isBusy} className={isBusy ? "pointer-events-none select-none" : undefined}>{children}</div>
      {visibleOperation ? (
        <div
          ref={overlayRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-live="assertive"
          aria-label={visibleOperation.label}
          className="fixed inset-0 z-[100] grid place-items-center bg-black/45 p-4 outline-none"
        >
          <div className="flex w-full max-w-xs flex-col items-center rounded-lg bg-white p-6 text-center shadow-xl">
            <LoaderCircle className="animate-spin text-gray-950" size={34} aria-hidden="true" />
            <p className="mt-4 font-bold text-gray-950">{visibleOperation.label}</p>
            <p className="mt-1 text-sm text-gray-500">Aguarde a conclusao.</p>
          </div>
        </div>
      ) : null}
    </OperationContext.Provider>
  );
}

export function useOperation() {
  const context = useContext(OperationContext);
  if (!context) throw new Error("useOperation deve ser usado dentro de OperationProvider.");
  return context;
}
