import type { CauseChainEntry } from "./types.js";

/**
 * Walk an error's `cause` chain into a flat array of plain entries.
 *
 * `error.cause` is standardised in modern JS (ES2022) — wrappers commonly
 * use `new Error("doing X", { cause: original })` so the root cause is
 * buried one or more levels in. Carrying the chain into the payload means
 * the dashboard can show "what really happened" without the operator
 * having to manually rebuild it from logs.
 *
 * Returns `[]` when the root error has no cause — callers should omit
 * the field on the payload entirely in that case (saves bytes).
 *
 * Defends against:
 *   - Non-Error causes (string, object, undefined)
 *   - Cycles (A.cause = B, B.cause = A). Visited set bails after the cap.
 *   - Excessively deep chains (rare but possible) — capped at MAX_DEPTH.
 */
const MAX_DEPTH = 8;

export function walkCauses(err: unknown): CauseChainEntry[] {
	const out: CauseChainEntry[] = [];
	const seen = new Set<unknown>();

	let current: unknown = (err && typeof err === "object" && "cause" in err && err.cause) || null;
	while (current && out.length < MAX_DEPTH) {
		if (seen.has(current)) break;
		seen.add(current);
		out.push(toEntry(current));
		if (typeof current === "object" && current !== null && "cause" in current) {
			current = (current as { cause?: unknown }).cause ?? null;
		} else {
			current = null;
		}
	}

	return out;
}

function toEntry(value: unknown): CauseChainEntry {
	if (value instanceof Error) {
		return { errorName: value.name, message: value.message, stack: value.stack };
	}
	if (typeof value === "string") {
		return { message: value };
	}
	// Plain object / unknown — best-effort message extraction so we don't
	// drop information silently.
	if (typeof value === "object" && value !== null && "message" in value) {
		const v = value as { name?: unknown; message?: unknown; stack?: unknown };
		return {
			errorName: typeof v.name === "string" ? v.name : undefined,
			message: typeof v.message === "string" ? v.message : JSON.stringify(value),
			stack: typeof v.stack === "string" ? v.stack : undefined,
		};
	}
	return { message: String(value) };
}
