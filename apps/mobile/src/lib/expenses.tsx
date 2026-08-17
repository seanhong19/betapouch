import {
  expenseSchema,
  newId,
  type Attachment,
  type Expense,
  type ExpenseDraft,
} from "@betapouch/core";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  deleteExpense as dbDeleteExpense,
  loadAttachmentBytes,
  loadExpenses,
  putAttachment,
  putExpense,
} from "./db";
import { useVault } from "./vault";

interface ExpensesContextValue {
  expenses: Expense[];
  loading: boolean;
  damaged: string[];
  saveExpense(draft: ExpenseDraft, options?: { id?: string }): Promise<Expense>;
  removeExpense(id: string): Promise<void>;
  attachToExpense(expenseId: string, attachment: Attachment, bytes: Uint8Array): Promise<void>;
  getAttachmentBytes(id: string): Promise<Uint8Array | null>;
}

const ExpensesContext = createContext<ExpensesContextValue | null>(null);

export function ExpensesProvider({ children }: { children: ReactNode }) {
  const { vault } = useVault();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [damaged, setDamaged] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!vault) {
      setExpenses([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void loadExpenses(vault).then((result) => {
      if (cancelled) return;
      setExpenses(result.expenses);
      setDamaged(result.damaged);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [vault]);

  const saveExpense = useCallback(
    async (draft: ExpenseDraft, options: { id?: string } = {}) => {
      if (!vault) throw new Error("The vault is locked.");
      const nowIso = new Date().toISOString();
      const existing = options.id ? expenses.find((e) => e.id === options.id) : undefined;

      const record = expenseSchema.parse({
        ...existing,
        ...draft,
        id: existing?.id ?? options.id ?? newId("exp"),
        occurredAt: draft.occurredAt ?? existing?.occurredAt ?? nowIso,
        createdAt: existing?.createdAt ?? nowIso,
        updatedAt: nowIso,
        amountMinor: draft.amountMinor ?? existing?.amountMinor ?? 0,
      });

      await putExpense(vault, record);
      setExpenses((current) => {
        const index = current.findIndex((e) => e.id === record.id);
        if (index === -1) return [record, ...current];
        const next = [...current];
        next[index] = record;
        return next;
      });
      return record;
    },
    [expenses, vault],
  );

  const removeExpense = useCallback(
    async (id: string) => {
      const target = expenses.find((e) => e.id === id);
      await dbDeleteExpense(id, target?.attachmentIds ?? []);
      setExpenses((current) => current.filter((e) => e.id !== id));
    },
    [expenses],
  );

  const attachToExpense = useCallback(
    async (expenseId: string, attachment: Attachment, bytes: Uint8Array) => {
      if (!vault) throw new Error("The vault is locked.");
      await putAttachment(vault, attachment, bytes);
      const target = expenses.find((e) => e.id === expenseId);
      if (!target) return;
      const updated: Expense = {
        ...target,
        attachmentIds: [...target.attachmentIds, attachment.id].slice(0, 20),
        updatedAt: new Date().toISOString(),
      };
      await putExpense(vault, updated);
      setExpenses((current) => current.map((e) => (e.id === expenseId ? updated : e)));
    },
    [expenses, vault],
  );

  const getAttachmentBytes = useCallback(
    async (id: string) => (vault ? loadAttachmentBytes(vault, id) : null),
    [vault],
  );

  const value = useMemo<ExpensesContextValue>(
    () => ({
      expenses,
      loading,
      damaged,
      saveExpense,
      removeExpense,
      attachToExpense,
      getAttachmentBytes,
    }),
    [attachToExpense, damaged, expenses, getAttachmentBytes, loading, removeExpense, saveExpense],
  );

  return <ExpensesContext.Provider value={value}>{children}</ExpensesContext.Provider>;
}

export function useExpenses(): ExpensesContextValue {
  const context = useContext(ExpensesContext);
  if (!context) throw new Error("useExpenses must be used inside an ExpensesProvider.");
  return context;
}
