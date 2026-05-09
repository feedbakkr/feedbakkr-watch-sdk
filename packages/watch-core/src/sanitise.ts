// Default deny-list for keys that almost certainly carry credentials, PII,
// or session material. Matched case-insensitively against the *whole* key.
const SENSITIVE_KEY_RE =
	/^(authorization|cookie|set-cookie|password|passwd|secret|api[_-]?key|token|access[_-]?token|refresh[_-]?token|jwt|session(?:[_-]?id)?|email|x-csrf|csrf)$/i;

const REDACTED = "[REDACTED]";
const MAX_DEPTH = 4;
const MAX_KEYS = 32;
const MAX_STRING = 1024;

export interface SanitiseOptions {
	additionalSensitiveKeys?: RegExp;
}

export function sanitise<T>(value: T, options?: SanitiseOptions): T {
	return walk(value, 0, options) as T;
}

function walk(value: unknown, depth: number, options?: SanitiseOptions): unknown {
	if (depth > MAX_DEPTH) return "[TRUNCATED]";

	if (value === null || value === undefined) return value;
	if (typeof value === "string") {
		return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
	}
	if (typeof value === "number" || typeof value === "boolean") return value;

	if (Array.isArray(value)) {
		return value.slice(0, MAX_KEYS).map((v) => walk(v, depth + 1, options));
	}

	if (typeof value === "object") {
		const out: Record<string, unknown> = {};
		const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_KEYS);
		for (const [key, v] of entries) {
			if (isSensitiveKey(key, options)) {
				out[key] = REDACTED;
				continue;
			}
			out[key] = walk(v, depth + 1, options);
		}
		return out;
	}

	// Functions, symbols, etc — drop.
	return undefined;
}

function isSensitiveKey(key: string, options?: SanitiseOptions): boolean {
	if (SENSITIVE_KEY_RE.test(key)) return true;
	if (options?.additionalSensitiveKeys?.test(key)) return true;
	return false;
}

export function safeJsonStringify(value: unknown): string {
	try {
		return JSON.stringify(value);
	} catch {
		return JSON.stringify({ __unserialisable: true });
	}
}
