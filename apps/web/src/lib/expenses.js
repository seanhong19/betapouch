import { jsx as _jsx } from "react/jsx-runtime";
import { expenseSchema, learnCategory, newId, } from "@betapouch/core";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, } from "react";
import { deleteExpense as dbDeleteExpense, loadAttachmentBytes, loadCategoryMemory, loadExpenses, putAttachment, putExpense, putExpenses, saveCategoryMemory, } from "./db";
import { useVault } from "./vault";
const ExpensesContext = createContext(null);
export function ExpensesProvider({ children }) {
    const { vault } = useVault();
    const [expenses, setExpenses] = useState([]);
    const [damaged, setDamaged] = useState([]);
    const [categoryMemory, setCategoryMemory] = useState({});
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        if (!vault) {
            setExpenses([]);
            setCategoryMemory({});
            setLoading(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
        void (async () => {
            const [result, memory] = await Promise.all([loadExpenses(vault), loadCategoryMemory(vault)]);
            if (cancelled)
                return;
            setExpenses(result.expenses);
            setDamaged(result.damaged);
            setCategoryMemory(memory);
            setLoading(false);
        })();
        return () => {
            cancelled = true;
        };
    }, [vault]);
    const saveExpense = useCallback(async (draft, options = {}) => {
        if (!vault)
            throw new Error("The vault is locked.");
        const nowIso = new Date().toISOString();
        const existing = options.id ? expenses.find((e) => e.id === options.id) : undefined;
        const record = expenseSchema.parse({
            ...existing,
            ...draft,
            id: existing?.id ?? options.id ?? newId("exp"),
            occurredAt: draft.occurredAt ?? existing?.occurredAt ?? nowIso,
            createdAt: existing?.createdAt ?? nowIso,
            updatedAt: nowIso,
            // A draft carries a nullable amount; a stored expense never does.
            amountMinor: draft.amountMinor ?? existing?.amountMinor ?? 0,
        });
        await putExpense(vault, record);
        setExpenses((current) => {
            const index = current.findIndex((e) => e.id === record.id);
            if (index === -1)
                return [...current, record];
            const next = [...current];
            next[index] = record;
            return next;
        });
        return record;
    }, [expenses, vault]);
    const removeExpense = useCallback(async (id) => {
        const target = expenses.find((e) => e.id === id);
        await dbDeleteExpense(id, target?.attachmentIds ?? []);
        setExpenses((current) => current.filter((e) => e.id !== id));
    }, [expenses]);
    const importExpenses = useCallback(async (records) => {
        if (!vault)
            throw new Error("The vault is locked.");
        // Imported ids are re-minted so a crafted file cannot overwrite an
        // existing record by claiming its id.
        const known = new Set(expenses.map((e) => e.id));
        const incoming = records.map((record) => known.has(record.id) ? { ...record, id: newId("exp") } : record);
        await putExpenses(vault, incoming);
        setExpenses((current) => [...current, ...incoming]);
        return incoming.length;
    }, [expenses, vault]);
    const attachToExpense = useCallback(async (expenseId, attachment, bytes) => {
        if (!vault)
            throw new Error("The vault is locked.");
        await putAttachment(vault, attachment, bytes);
        const target = expenses.find((e) => e.id === expenseId);
        if (!target)
            return;
        const updated = {
            ...target,
            attachmentIds: [...target.attachmentIds, attachment.id].slice(0, 20),
            updatedAt: new Date().toISOString(),
        };
        await putExpense(vault, updated);
        setExpenses((current) => current.map((e) => (e.id === expenseId ? updated : e)));
    }, [expenses, vault]);
    const getAttachmentBytes = useCallback(async (id) => {
        if (!vault)
            return null;
        return loadAttachmentBytes(vault, id);
    }, [vault]);
    const rememberCategory = useCallback(async (merchant, category) => {
        if (!vault || !merchant.trim())
            return;
        const next = learnCategory(categoryMemory, merchant, category);
        setCategoryMemory(next);
        await saveCategoryMemory(vault, next);
    }, [categoryMemory, vault]);
    const value = useMemo(() => ({
        expenses,
        loading,
        damaged,
        categoryMemory,
        saveExpense,
        removeExpense,
        importExpenses,
        attachToExpense,
        getAttachmentBytes,
        rememberCategory,
    }), [
        attachToExpense,
        categoryMemory,
        damaged,
        expenses,
        getAttachmentBytes,
        importExpenses,
        loading,
        rememberCategory,
        removeExpense,
        saveExpense,
    ]);
    return _jsx(ExpensesContext.Provider, { value: value, children: children });
}
export function useExpenses() {
    const context = useContext(ExpensesContext);
    if (!context)
        throw new Error("useExpenses must be used inside an ExpensesProvider.");
    return context;
}
