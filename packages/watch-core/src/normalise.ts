// Patterns that change every build/request and would otherwise scatter the
// same logical error across thousands of fingerprints.

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const ULID_RE = /\b[0-9A-HJKMNP-TV-Z]{26}\b/g;
const HEX_HASH_RE = /\b[0-9a-f]{12,64}\b/gi;
const NUMERIC_ID_RE = /\b\d{4,}\b/g;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const QUERY_STRING_RE = /\?[^\s)"']*/g;

export function normaliseMessage(message: string): string {
	if (!message) return "";
	return message
		.replace(EMAIL_RE, ":email")
		.replace(UUID_RE, ":uuid")
		.replace(ULID_RE, ":ulid")
		.replace(NUMERIC_ID_RE, ":n")
		.trim()
		.slice(0, 500);
}

export function normaliseRoute(route: string | undefined): string {
	if (!route) return "";
	return route
		.replace(QUERY_STRING_RE, "")
		.replace(UUID_RE, ":uuid")
		.replace(ULID_RE, ":ulid")
		.replace(NUMERIC_ID_RE, ":n")
		.slice(0, 200);
}

interface StackFrame {
	function?: string;
	file?: string;
	line?: number;
	column?: number;
}

// Heuristic: pull the first frame that doesn't look like vendor/framework noise.
const VENDOR_PATTERNS = [/node_modules/, /\/_remix\//, /\/__hono\//, /react-dom/];

export function topMeaningfulFrame(stack: string | undefined): string {
	if (!stack) return "";
	const frames = parseStack(stack);
	const meaningful = frames.find(
		(f) => f.file && !VENDOR_PATTERNS.some((re) => re.test(f.file ?? "")),
	);
	const pick = meaningful ?? frames[0];
	if (!pick) return "";
	const file = stripVolatile(pick.file ?? "");
	return `${pick.function ?? "<anon>"}@${file}`;
}

function parseStack(stack: string): StackFrame[] {
	const out: StackFrame[] = [];
	for (const line of stack.split("\n")) {
		const m =
			line.match(/^\s*at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/) ??
			line.match(/^\s*at\s+(.+?):(\d+):(\d+)/);
		if (!m) continue;
		if (m.length === 5) {
			out.push({ function: m[1], file: m[2], line: Number(m[3]), column: Number(m[4]) });
		} else {
			out.push({ file: m[1], line: Number(m[2]), column: Number(m[3]) });
		}
	}
	return out;
}

// Hashed bundle filenames, version pins, and query strings vary per build —
// strip them so the same logical frame fingerprints consistently across builds.
function stripVolatile(file: string): string {
	return file
		.replace(QUERY_STRING_RE, "")
		.replace(/-[A-Za-z0-9_-]{6,}\.(js|mjs|cjs)/g, ".$1")
		.replace(/\/v\d+(\.\d+)*\//g, "/")
		.replace(HEX_HASH_RE, ":hash");
}
