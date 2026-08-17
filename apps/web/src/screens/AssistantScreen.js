import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ASSISTANT_SYSTEM_PROMPT, buildAssistantContext, buildExpenseSummary, newId, } from "@betapouch/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { activeProviderConfig, resolveProvider } from "../lib/ai";
import { useExpenses } from "../lib/expenses";
import { useVault } from "../lib/vault";
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
    const [turns, setTurns] = useState([]);
    const [input, setInput] = useState("");
    const [busy, setBusy] = useState(false);
    const abortRef = useRef(null);
    const endRef = useRef(null);
    const config = activeProviderConfig(settings);
    const summary = useMemo(() => buildExpenseSummary(expenses, { currency: settings.baseCurrency, locale: settings.locale }), [expenses, settings.baseCurrency, settings.locale]);
    useEffect(() => () => abortRef.current?.abort(), []);
    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [turns]);
    async function ask(question) {
        const trimmed = question.trim();
        if (!trimmed || busy || !vault || !config)
            return;
        const userTurn = { id: newId("msg"), role: "user", content: trimmed };
        const history = [...turns, userTurn];
        setTurns(history);
        setInput("");
        setBusy(true);
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const resolved = await resolveProvider(vault, settings);
            if (!resolved)
                throw new Error("No AI provider is configured.");
            const messages = [
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
        }
        catch (caught) {
            setTurns((current) => [
                ...current,
                {
                    id: newId("msg"),
                    role: "assistant",
                    content: caught instanceof Error ? caught.message : "That request failed.",
                    error: true,
                },
            ]);
        }
        finally {
            setBusy(false);
            abortRef.current = null;
        }
    }
    if (!config) {
        return (_jsxs("div", { className: "flex flex-col gap-4", children: [_jsx("h1", { className: "m-0 text-xl font-semibold tracking-tight", children: "Ask about your spending" }), _jsxs("div", { className: "card p-6", children: [_jsx("p", { className: "m-0 text-sm", style: { color: "var(--text-secondary)" }, children: "No AI provider is set up yet. You can connect one in Settings:" }), _jsxs("ul", { className: "mb-0 mt-3 flex list-none flex-col gap-2 p-0 text-sm", style: { color: "var(--text-secondary)" }, children: [_jsxs("li", { children: [_jsx("strong", { children: "Your own API key" }), " \u2014 Anthropic, OpenAI, or anything OpenAI-compatible. The key stays in your encrypted vault."] }), _jsxs("li", { children: [_jsx("strong", { children: "A local model" }), " via Ollama. Nothing leaves the device at all."] }), _jsxs("li", { children: [_jsx("strong", { children: "An agent you already run" }), " \u2014 Claude Code or Codex, through the loopback bridge. No extra API key needed."] })] }), _jsx("p", { className: "mb-0 mt-4 text-xs", style: { color: "var(--text-muted)" }, children: "Everything else in BetaPouch works without any of this." })] })] }));
    }
    return (_jsxs("div", { className: "flex h-full flex-col gap-4", children: [_jsxs("header", { children: [_jsx("h1", { className: "m-0 text-xl font-semibold tracking-tight", children: "Ask about your spending" }), _jsxs("p", { className: "m-0 mt-1 text-xs", style: { color: "var(--text-muted)" }, children: ["A summary of your totals goes to ", config.label || config.kind, " — ", "individual records and receipt images do not. This conversation is not saved."] })] }), _jsxs("div", { className: "flex-1 overflow-y-auto", children: [turns.length === 0 ? (_jsxs("div", { className: "flex flex-col gap-2", children: [SUGGESTIONS.map((suggestion) => (_jsx("button", { type: "button", className: "card p-3 text-left text-sm", onClick: () => void ask(suggestion), disabled: expenses.length === 0, children: suggestion }, suggestion))), expenses.length === 0 && (_jsx("p", { className: "mt-2 text-xs", style: { color: "var(--text-muted)" }, children: "Add an expense or two first \u2014 there is nothing to analyse yet." }))] })) : (_jsxs("ul", { className: "m-0 flex list-none flex-col gap-3 p-0", children: [turns.map((turn) => (_jsx("li", { className: turn.role === "user" ? "flex justify-end" : "flex justify-start", children: _jsx("div", { className: "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm", style: {
                                        background: turn.role === "user" ? "var(--series-1)" : "var(--surface-1)",
                                        color: turn.role === "user" ? "#ffffff" : "var(--text-primary)",
                                        border: turn.role === "user" ? "none" : "1px solid var(--hairline)",
                                        ...(turn.error ? { color: "var(--status-critical)" } : {}),
                                    }, children: turn.content }) }, turn.id))), busy && (_jsx("li", { className: "text-sm", style: { color: "var(--text-muted)" }, children: "Thinking\u2026" }))] })), _jsx("div", { ref: endRef })] }), _jsxs("form", { className: "flex gap-2", onSubmit: (event) => {
                    event.preventDefault();
                    void ask(input);
                }, children: [_jsx("input", { className: "field flex-1", value: input, onChange: (event) => setInput(event.target.value), placeholder: "Ask a question about your expenses", disabled: busy, maxLength: 2000 }), _jsx("button", { type: "submit", className: "btn btn-primary", disabled: busy || !input.trim(), children: "Ask" }), busy && (_jsx("button", { type: "button", className: "btn", onClick: () => abortRef.current?.abort(), children: "Stop" }))] }), _jsxs("details", { className: "card p-3", children: [_jsx("summary", { className: "cursor-pointer text-xs", style: { color: "var(--text-secondary)" }, children: "Exactly what gets sent" }), _jsx("pre", { className: "mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-[11px]", style: { color: "var(--text-muted)" }, children: summary })] })] }));
}
