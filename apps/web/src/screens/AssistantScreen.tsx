import {
  ASSISTANT_SYSTEM_PROMPT,
  buildAssistantContext,
  buildExpenseSummary,
  newId,
  type AiChatTurn,
} from "@betapouch/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { activeProviderConfig, resolveProvider } from "../lib/ai";
import { useExpenses } from "../lib/expenses";
import { useVault } from "../lib/vault";

interface Turn {
  id: string;
  role: "user" | "assistant";
  content: string;
  error?: boolean;
}

const SUGGESTIONS = [
  "What did I spend the most on last month?",
  "Which merchants am I visiting most often?",
  "Is my dining spend going up or down?",
  "Where could I realistically cut back?",
];

/**
 * The assistant.
 *
 * It is given an aggregate summary of the ledger, never the raw records, and
 * the conversation is held in memory only — closing the tab or locking the
 * vault ends it. That is a deliberate choice: a persisted chat log would be a
 * second copy of the user's financial life in a less structured form.
 */
export function AssistantScreen() {
  const { vault, settings } = useVault();
  const { expenses } = useExpenses();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const config = activeProviderConfig(settings);
  const summary = useMemo(
    () => buildExpenseSummary(expenses, { currency: settings.baseCurrency, locale: settings.locale }),
    [expenses, settings.baseCurrency, settings.locale],
  );

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || busy || !vault || !config) return;

    const userTurn: Turn = { id: newId("msg"), role: "user", content: trimmed };
    const history = [...turns, userTurn];
    setTurns(history);
    setInput("");
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const resolved = await resolveProvider(vault, settings);
      if (!resolved) throw new Error("No AI provider is configured.");

      const messages: AiChatTurn[] = [
        { role: "user", content: buildAssistantContext(summary) },
        { role: "assistant", content: "Understood — I'll answer from that summary." },
        ...history.map((turn) => ({ role: turn.role, content: turn.content })),
      ];

      const reply = await resolved.provider.chat({
        system: ASSISTANT_SYSTEM_PROMPT,
        messages,
        maxTokens: 1024,
        signal: controller.signal,
      });

      setTurns((current) => [...current, { id: newId("msg"), role: "assistant", content: reply }]);
    } catch (caught) {
      setTurns((current) => [
        ...current,
        {
          id: newId("msg"),
          role: "assistant",
          content: caught instanceof Error ? caught.message : "That request failed.",
          error: true,
        },
      ]);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  if (!config) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="m-0 text-xl font-semibold tracking-tight">Ask about your spending</h1>
        <div className="card p-6">
          <p className="m-0 text-sm" style={{ color: "var(--text-secondary)" }}>
            No AI provider is set up yet. You can connect one in Settings:
          </p>
          <ul
            className="mb-0 mt-3 flex list-none flex-col gap-2 p-0 text-sm"
            style={{ color: "var(--text-secondary)" }}
          >
            <li>
              <strong>Your own API key</strong> — Anthropic, OpenAI, or anything
              OpenAI-compatible. The key stays in your encrypted vault.
            </li>
            <li>
              <strong>A local model</strong> via Ollama. Nothing leaves the device at all.
            </li>
            <li>
              <strong>An agent you already run</strong> — Claude Code or Codex, through the
              loopback bridge. No extra API key needed.
            </li>
          </ul>
          <p className="mb-0 mt-4 text-xs" style={{ color: "var(--text-muted)" }}>
            Everything else in BetaPouch works without any of this.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <header>
        <h1 className="m-0 text-xl font-semibold tracking-tight">Ask about your spending</h1>
        <p className="m-0 mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
          A summary of your totals goes to {config.label || config.kind}
          {" — "}
          individual records and receipt images do not. This conversation is not saved.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto">
        {turns.length === 0 ? (
          <div className="flex flex-col gap-2">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="card p-3 text-left text-sm"
                onClick={() => void ask(suggestion)}
                disabled={expenses.length === 0}
              >
                {suggestion}
              </button>
            ))}
            {expenses.length === 0 && (
              <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
                Add an expense or two first — there is nothing to analyse yet.
              </p>
            )}
          </div>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {turns.map((turn) => (
              <li
                key={turn.id}
                className={turn.role === "user" ? "flex justify-end" : "flex justify-start"}
              >
                <div
                  className="max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm"
                  style={{
                    background: turn.role === "user" ? "var(--series-1)" : "var(--surface-1)",
                    color: turn.role === "user" ? "#ffffff" : "var(--text-primary)",
                    border: turn.role === "user" ? "none" : "1px solid var(--hairline)",
                    ...(turn.error ? { color: "var(--status-critical)" } : {}),
                  }}
                >
                  {/* Rendered as plain text on purpose: model output is
                      untrusted input and never becomes markup. */}
                  {turn.content}
                </div>
              </li>
            ))}
            {busy && (
              <li className="text-sm" style={{ color: "var(--text-muted)" }}>
                Thinking…
              </li>
            )}
          </ul>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void ask(input);
        }}
      >
        <input
          className="field flex-1"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask a question about your expenses"
          disabled={busy}
          maxLength={2000}
        />
        <button type="submit" className="btn btn-primary" disabled={busy || !input.trim()}>
          Ask
        </button>
        {busy && (
          <button type="button" className="btn" onClick={() => abortRef.current?.abort()}>
            Stop
          </button>
        )}
      </form>

      <details className="card p-3">
        <summary className="cursor-pointer text-xs" style={{ color: "var(--text-secondary)" }}>
          Exactly what gets sent
        </summary>
        <pre
          className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-[11px]"
          style={{ color: "var(--text-muted)" }}
        >
          {summary}
        </pre>
      </details>
    </div>
  );
}
