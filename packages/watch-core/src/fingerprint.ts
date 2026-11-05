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
	/**
	 * When true, the (normalised) route is folded into the fingerprint so
	 * the same error at different URLs becomes distinct groups. Default
	 * false: an error that fires on every product page rolls up into one
	 * group, not one per URL. Set by the SDK via the `groupByUrl` init
	 * option.
	 */
	groupByUrl?: boolean;
}

export function buildFingerprintKey(inputs: FingerprintInputs): string {
	return [
		inputs.projectId,
		inputs.environment,
		inputs.source,
		inputs.errorName ?? "",
		normaliseMessage(inputs.message),
		topMeaningfulFrame(inputs.stack),
		inputs.groupByUrl ? normaliseRoute(inputs.route) : "",
	].join("|");
}

/**
 * Compute the storage fingerprint for an event: a hash of the caller's own
 * `fingerprint` when there is one, otherwise of the heuristic key. Hashing the
 * explicit value (rather than cutting it to length) keeps long names such as
 * `checkout-payment-failed` and `checkout-payment-timeout` apart.
 */
export async function computeFingerprint(payload: EventPayload): Promise<string> {
	const explicit = payload.fingerprint?.trim();
	const key = explicit
		? `explicit|${explicit}`
		: buildFingerprintKey({
				projectId: payload.projectId,
				environment: payload.environment,
				source: payload.source,
				errorName: payload.errorName,
				message: payload.message,
				stack: payload.stack,
				route: payload.request?.route,
				groupByUrl: payload.groupByUrl,
			});
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
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
