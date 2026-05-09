import { normaliseMessage, normaliseRoute, topMeaningfulFrame } from "./normalise.js";
import type { EventPayload } from "./types.js";

// 16 hex chars = 64 bits. Plenty of headroom for grouping; small enough to
// fit comfortably in DB indexes and URLs.
const FINGERPRINT_LENGTH = 16;

export interface FingerprintInputs {
	projectId: string;
	environment: string;
	source: string;
	errorName?: string;
	message: string;
	stack?: string;
	route?: string;
}

export function buildFingerprintKey(inputs: FingerprintInputs): string {
	return [
		inputs.projectId,
		inputs.environment,
		inputs.source,
		inputs.errorName ?? "",
		normaliseMessage(inputs.message),
		topMeaningfulFrame(inputs.stack),
		normaliseRoute(inputs.route),
	].join("|");
}

/**
 * Compute the storage fingerprint for an event. If the payload carries an
 * explicit fingerprint string, it wins (after normalisation) — otherwise the
 * heuristic key is hashed via Web Crypto's SHA-256.
 */
export async function computeFingerprint(payload: EventPayload): Promise<string> {
	if (payload.fingerprint) {
		const explicit = payload.fingerprint.trim().slice(0, FINGERPRINT_LENGTH);
		if (explicit) return explicit;
	}

	const key = buildFingerprintKey({
		projectId: payload.projectId,
		environment: payload.environment,
		source: payload.source,
		errorName: payload.errorName,
		message: payload.message,
		stack: payload.stack,
		route: payload.request?.route,
	});

	const data = new TextEncoder().encode(key);
	const digest = await crypto.subtle.digest("SHA-256", data);
	return bytesToHex(new Uint8Array(digest)).slice(0, FINGERPRINT_LENGTH);
}

function bytesToHex(bytes: Uint8Array): string {
	let out = "";
	for (let i = 0; i < bytes.length; i++) {
		const b = bytes[i] ?? 0;
		out += b.toString(16).padStart(2, "0");
	}
	return out;
}
