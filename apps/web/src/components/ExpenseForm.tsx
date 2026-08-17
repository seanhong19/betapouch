import {
  CATEGORIES,
  CATEGORY_LABELS,
  minorToDecimalString,
  parseAmountToMinor,
  PAYMENT_METHODS,
  type Category,
  type ExpenseDraft,
  type PaymentMethod,
} from "@betapouch/core";
import { useEffect, useState, type FormEvent } from "react";
import { CurrencyPicker } from "./CurrencyPicker";

/**
 * The one place an expense is edited, whether it came from a camera, a file,
 * the assistant, or a keyboard. Auto-extracted values arrive pre-filled and
 * clearly marked so the user is confirming rather than trusting.
 */

interface Props {
  draft: ExpenseDraft;
  confidence?: number | null;
  busy?: boolean;
  submitLabel?: string;
  onSubmit: (draft: ExpenseDraft) => void | Promise<void>;
  onCancel?: () => void;
}

/** ISO instant -> the value a datetime-local input expects, in local time. */
function toLocalInput(iso: string | undefined): string {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) return toLocalInput(undefined);
  const pad = (n: number) => `${n}`.padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

export function ExpenseForm({
  draft,
  confidence = null,
  busy = false,
  submitLabel = "Save expense",
  onSubmit,
  onCancel,
}: Props) {
  const currency = draft.currency ?? "USD";

  const [merchant, setMerchant] = useState(draft.merchant ?? "");
  const [amount, setAmount] = useState(
    draft.amountMinor != null ? minorToDecimalString(draft.amountMinor, currency) : "",
  );
  const [currencyCode, setCurrencyCode] = useState(currency);
  const [occurredAt, setOccurredAt] = useState(toLocalInput(draft.occurredAt));
  const [category, setCategory] = useState<Category>(draft.category ?? "other");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">(draft.paymentMethod ?? "");
  const [tax, setTax] = useState(
    draft.taxMinor != null ? minorToDecimalString(draft.taxMinor, currency) : "",
  );
  const [notes, setNotes] = useState(draft.notes ?? "");
  const [tags, setTags] = useState((draft.tags ?? []).join(", "));
  const [error, setError] = useState<string | null>(null);

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

  function handleSubmit(event: FormEvent) {
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

  return (
    <form onSubmit={handleSubmit} className="card flex flex-col gap-4 p-5">
      {confidence !== null && (
        <p
          className="m-0 rounded-lg px-3 py-2 text-xs"
          style={{
            background: "var(--plane)",
            color: lowConfidence ? "var(--status-serious)" : "var(--text-secondary)",
          }}
        >
          {lowConfidence ? "⚠ " : "✓ "}
          Read automatically with {Math.round(confidence * 100)}% confidence. Check the amount and
          date before saving.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="merchant">
            Merchant
          </label>
          <input
            id="merchant"
            className="field"
            value={merchant}
            onChange={(event) => setMerchant(event.target.value)}
            placeholder="Where did you spend?"
            maxLength={200}
          />
        </div>

        <div>
          <label className="label" htmlFor="amount">
            Amount
          </label>
          <div className="flex gap-2">
            <input
              id="amount"
              className="field tabular"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              required
            />
            <div className="w-28 shrink-0">
              <CurrencyPicker
                value={currencyCode}
                onChange={setCurrencyCode}
                label={undefined}
                id="currency"
                compact
              />
            </div>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="occurredAt">
            When
          </label>
          <input
            id="occurredAt"
            className="field"
            type="datetime-local"
            value={occurredAt}
            onChange={(event) => setOccurredAt(event.target.value)}
            required
          />
        </div>

        <div>
          <label className="label" htmlFor="category">
            Category
          </label>
          <select
            id="category"
            className="field"
            value={category}
            onChange={(event) => setCategory(event.target.value as Category)}
          >
            {CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {CATEGORY_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="paymentMethod">
            Paid with
          </label>
          <select
            id="paymentMethod"
            className="field"
            value={paymentMethod}
            onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod | "")}
          >
            <option value="">Not recorded</option>
            {PAYMENT_METHODS.map((value) => (
              <option key={value} value={value}>
                {value[0]?.toUpperCase()}
                {value.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="tax">
            Tax (optional)
          </label>
          <input
            id="tax"
            className="field tabular"
            inputMode="decimal"
            value={tax}
            onChange={(event) => setTax(event.target.value)}
            placeholder="0.00"
          />
        </div>

        <div>
          <label className="label" htmlFor="tags">
            Tags (optional)
          </label>
          <input
            id="tags"
            className="field"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="work, reimbursable"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="notes">
            Notes (optional)
          </label>
          <textarea
            id="notes"
            className="field"
            rows={2}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={4000}
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="m-0 text-sm" style={{ color: "var(--status-critical)" }}>
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button type="submit" className="btn btn-primary flex-1" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
