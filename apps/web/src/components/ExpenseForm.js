import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { CATEGORIES, CATEGORY_LABELS, minorToDecimalString, parseAmountToMinor, PAYMENT_METHODS, } from "@betapouch/core";
import { useEffect, useState } from "react";
/** ISO instant -> the value a datetime-local input expects, in local time. */
function toLocalInput(iso) {
    const date = iso ? new Date(iso) : new Date();
    if (Number.isNaN(date.getTime()))
        return toLocalInput(undefined);
    const pad = (n) => `${n}`.padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function fromLocalInput(value) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}
export function ExpenseForm({ draft, confidence = null, busy = false, submitLabel = "Save expense", onSubmit, onCancel, }) {
    const currency = draft.currency ?? "USD";
    const [merchant, setMerchant] = useState(draft.merchant ?? "");
    const [amount, setAmount] = useState(draft.amountMinor != null ? minorToDecimalString(draft.amountMinor, currency) : "");
    const [currencyCode, setCurrencyCode] = useState(currency);
    const [occurredAt, setOccurredAt] = useState(toLocalInput(draft.occurredAt));
    const [category, setCategory] = useState(draft.category ?? "other");
    const [paymentMethod, setPaymentMethod] = useState(draft.paymentMethod ?? "");
    const [tax, setTax] = useState(draft.taxMinor != null ? minorToDecimalString(draft.taxMinor, currency) : "");
    const [notes, setNotes] = useState(draft.notes ?? "");
    const [tags, setTags] = useState((draft.tags ?? []).join(", "));
    const [error, setError] = useState(null);
    // A newly extracted draft must replace what is on screen, not sit behind it.
    useEffect(() => {
        setMerchant(draft.merchant ?? "");
        setAmount(draft.amountMinor != null ? minorToDecimalString(draft.amountMinor, draft.currency ?? "USD") : "");
        setCurrencyCode(draft.currency ?? "USD");
        setOccurredAt(toLocalInput(draft.occurredAt));
        setCategory(draft.category ?? "other");
        setPaymentMethod(draft.paymentMethod ?? "");
        setTax(draft.taxMinor != null ? minorToDecimalString(draft.taxMinor, draft.currency ?? "USD") : "");
        setNotes(draft.notes ?? "");
        setTags((draft.tags ?? []).join(", "));
    }, [draft]);
    function handleSubmit(event) {
        event.preventDefault();
        const amountMinor = parseAmountToMinor(amount, currencyCode);
        if (amountMinor === null) {
            setError("Enter an amount, for example 12.50.");
            return;
        }
        if (amountMinor === 0) {
            setError("An expense of zero is probably a mistake — enter the amount you paid.");
            return;
        }
        setError(null);
        void onSubmit({
            ...draft,
            merchant: merchant.trim(),
            amountMinor,
            currency: currencyCode.toUpperCase(),
            occurredAt: fromLocalInput(occurredAt),
            category,
            paymentMethod: paymentMethod === "" ? null : paymentMethod,
            taxMinor: tax.trim() ? parseAmountToMinor(tax, currencyCode) : null,
            notes: notes.trim(),
            tags: tags
                .split(",")
                .map((tag) => tag.trim())
                .filter(Boolean)
                .slice(0, 30),
            // Saving from this form is the human check.
            reviewed: true,
        });
    }
    const lowConfidence = confidence !== null && confidence < 0.6;
    return (_jsxs("form", { onSubmit: handleSubmit, className: "card flex flex-col gap-4 p-5", children: [confidence !== null && (_jsxs("p", { className: "m-0 rounded-lg px-3 py-2 text-xs", style: {
                    background: "var(--plane)",
                    color: lowConfidence ? "var(--status-serious)" : "var(--text-secondary)",
                }, children: [lowConfidence ? "⚠ " : "✓ ", "Read automatically with ", Math.round(confidence * 100), "% confidence. Check the amount and date before saving."] })), _jsxs("div", { className: "grid grid-cols-1 gap-4 sm:grid-cols-2", children: [_jsxs("div", { className: "sm:col-span-2", children: [_jsx("label", { className: "label", htmlFor: "merchant", children: "Merchant" }), _jsx("input", { id: "merchant", className: "field", value: merchant, onChange: (event) => setMerchant(event.target.value), placeholder: "Where did you spend?", maxLength: 200 })] }), _jsxs("div", { children: [_jsx("label", { className: "label", htmlFor: "amount", children: "Amount" }), _jsxs("div", { className: "flex gap-2", children: [_jsx("input", { id: "amount", className: "field tabular", inputMode: "decimal", value: amount, onChange: (event) => setAmount(event.target.value), placeholder: "0.00", required: true }), _jsx("input", { className: "field w-20 uppercase", value: currencyCode, onChange: (event) => setCurrencyCode(event.target.value.slice(0, 3)), "aria-label": "Currency", maxLength: 3, pattern: "[A-Za-z]{3}" })] })] }), _jsxs("div", { children: [_jsx("label", { className: "label", htmlFor: "occurredAt", children: "When" }), _jsx("input", { id: "occurredAt", className: "field", type: "datetime-local", value: occurredAt, onChange: (event) => setOccurredAt(event.target.value), required: true })] }), _jsxs("div", { children: [_jsx("label", { className: "label", htmlFor: "category", children: "Category" }), _jsx("select", { id: "category", className: "field", value: category, onChange: (event) => setCategory(event.target.value), children: CATEGORIES.map((value) => (_jsx("option", { value: value, children: CATEGORY_LABELS[value] }, value))) })] }), _jsxs("div", { children: [_jsx("label", { className: "label", htmlFor: "paymentMethod", children: "Paid with" }), _jsxs("select", { id: "paymentMethod", className: "field", value: paymentMethod, onChange: (event) => setPaymentMethod(event.target.value), children: [_jsx("option", { value: "", children: "Not recorded" }), PAYMENT_METHODS.map((value) => (_jsxs("option", { value: value, children: [value[0]?.toUpperCase(), value.slice(1)] }, value)))] })] }), _jsxs("div", { children: [_jsx("label", { className: "label", htmlFor: "tax", children: "Tax (optional)" }), _jsx("input", { id: "tax", className: "field tabular", inputMode: "decimal", value: tax, onChange: (event) => setTax(event.target.value), placeholder: "0.00" })] }), _jsxs("div", { children: [_jsx("label", { className: "label", htmlFor: "tags", children: "Tags (optional)" }), _jsx("input", { id: "tags", className: "field", value: tags, onChange: (event) => setTags(event.target.value), placeholder: "work, reimbursable" })] }), _jsxs("div", { className: "sm:col-span-2", children: [_jsx("label", { className: "label", htmlFor: "notes", children: "Notes (optional)" }), _jsx("textarea", { id: "notes", className: "field", rows: 2, value: notes, onChange: (event) => setNotes(event.target.value), maxLength: 4000 })] })] }), error && (_jsx("p", { role: "alert", className: "m-0 text-sm", style: { color: "var(--status-critical)" }, children: error })), _jsxs("div", { className: "flex gap-3", children: [_jsx("button", { type: "submit", className: "btn btn-primary flex-1", disabled: busy, children: busy ? "Saving…" : submitLabel }), onCancel && (_jsx("button", { type: "button", className: "btn", onClick: onCancel, disabled: busy, children: "Cancel" }))] })] }));
}
