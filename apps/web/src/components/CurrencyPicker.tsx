import { countryName, currencySymbol, searchCurrencies } from "@betapouch/core";
import { useEffect, useId, useMemo, useRef, useState } from "react";

/**
 * Currency picker.
 *
 * Searchable by code, currency name, symbol *or country* — because people know
 * they are in Malaysia, not that the code is MYR. Built as a combobox rather
 * than a 160-option <select>: a native select cannot be typed into on mobile,
 * and scrolling to "Singapore Dollar" past 90 others is miserable.
 */

interface Props {
  value: string;
  onChange: (code: string) => void;
  locale?: string;
  label?: string;
  id?: string;
  /** Compact form for sitting beside an amount field. */
  compact?: boolean;
  disabled?: boolean;
}

export function CurrencyPicker({
  value,
  onChange,
  locale = "en",
  label,
  id,
  compact = false,
  disabled = false,
}: Props) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listId = `${inputId}-list`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  const results = useMemo(() => searchCurrencies(query, locale, 80), [locale, query]);
  const symbol = useMemo(() => currencySymbol(value, locale), [locale, value]);

  // Close on an outside click or Escape, like any other popup.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${highlighted}"]`)?.scrollIntoView({
      block: "nearest",
    });
  }, [highlighted, open]);

  function commit(code: string) {
    onChange(code);
    setQuery("");
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setHighlighted((current) =>
        results.length === 0 ? 0 : (current + delta + results.length) % results.length,
      );
    } else if (event.key === "Enter") {
      if (!open) return;
      event.preventDefault();
      const chosen = results[highlighted];
      if (chosen) commit(chosen.code);
    } else if (event.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div ref={rootRef} className="relative">
      {label && (
        <label className="label" htmlFor={inputId}>
          {label}
        </label>
      )}

      <div className="relative">
        <input
          id={inputId}
          className="field"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && results[highlighted] ? `${listId}-${highlighted}` : undefined}
          autoComplete="off"
          disabled={disabled}
          // Shows the current choice until the user types; then it is a query.
          value={open ? query : compact ? value : `${value} · ${symbol}`}
          placeholder="Search by country or currency"
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlighted(0);
            setOpen(true);
          }}
          onFocus={() => {
            setQuery("");
            setHighlighted(Math.max(0, results.findIndex((o) => o.code === value)));
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          ▾
        </span>
      </div>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="Currency"
          className="absolute z-20 mt-1 max-h-72 w-full min-w-[18rem] overflow-y-auto rounded-lg p-1 shadow-lg"
          style={{ background: "var(--surface-2)", border: "1px solid var(--hairline)" }}
        >
          {results.length === 0 && (
            <li className="px-3 py-3 text-sm" style={{ color: "var(--text-muted)" }}>
              No currency matches “{query}”.
            </li>
          )}

          {results.map((option, index) => {
            const selected = option.code === value;
            const active = index === highlighted;
            // Naming a couple of countries is what makes an unfamiliar code
            // recognisable at a glance.
            const where = option.countries
              .slice(0, 2)
              .map((c) => countryName(c, locale))
              .join(", ");
            const more = option.countries.length - 2;

            return (
              <li
                key={option.code}
                id={`${listId}-${index}`}
                data-index={index}
                role="option"
                aria-selected={selected}
                onPointerDown={(event) => {
                  event.preventDefault();
                  commit(option.code);
                }}
                onMouseEnter={() => setHighlighted(index)}
                className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2"
                style={{ background: active ? "var(--plane)" : "transparent" }}
              >
                <span
                  className="tabular w-12 shrink-0 text-xs font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {option.code}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm" style={{ color: "var(--text-primary)" }}>
                    {option.name}
                  </span>
                  <span className="block truncate text-xs" style={{ color: "var(--text-muted)" }}>
                    {where}
                    {more > 0 ? ` +${more} more` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-sm" style={{ color: "var(--text-secondary)" }}>
                  {option.symbol}
                </span>
                {selected && (
                  <span aria-hidden="true" style={{ color: "var(--series-1)" }}>
                    ✓
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
