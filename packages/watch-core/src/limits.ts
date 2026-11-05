import type { EventPayload } from "./types.js";

// Guards both SDKs apply before sending, so a bug that throws in a loop can't
// flood Watch (or use up the app's daily cap) and an oversized event isn't
// refused outright.

/** Watch accepts events up to 64 KB; browsers cap `keepalive` bodies at 64 KB too. */
export const MAX_EVENT_BYTES = 60 * 1024;

const encoder = new TextEncoder();
const size = (event: EventPayload) => encoder.encode(JSON.stringify(event)).length;

/**
 * The event, shrunk to fit `maxBytes` if needed: extras are dropped first
 * (breadcrumbs, fetch history, context), then the stack and message are cut.
 * Returns null if it still doesn't fit.
 */
export function fitPayload(event: EventPayload, maxBytes = MAX_EVENT_BYTES): EventPayload | null {
	if (size(event) <= maxBytes) return event;
	const out: EventPayload = { ...event };
	for (const key of [
		"breadcrumbs",
		"fetchHistory",
		"lastAction",
		"webContext",
		"context",
		"causes",
		"tags",
	] as const) {
		delete out[key];
		if (size(out) <= maxBytes) return out;
	}
	for (const key of ["stack", "message"] as const) {
		const value = out[key];
		if (!value) continue;
		const over = size(out) - maxBytes;
		if (over <= 0) return out;
		out[key] = `${value.slice(0, Math.max(0, value.length - over - 16))}…`;
	}
	return size(out) <= maxBytes ? out : null;
}

export interface ThrottleOptions {
	/** Events allowed per rolling minute. */
	perMinute: number;
	/** The same error (name, message and route) is sent at most once in this window. */
	repeatMs: number;
}

/** A rolling per-minute limit, plus suppression of quick repeats of the same error. */
export class Throttle {
	private readonly sent: number[] = [];
	private readonly lastSeen = new Map<string, number>();

	constructor(private readonly options: ThrottleOptions) {}

	allow(event: EventPayload, now = Date.now()): boolean {
		const key = `${event.errorName ?? ""}|${event.message}|${event.request?.route ?? ""}`;
		const last = this.lastSeen.get(key);
		if (last !== undefined && now - last < this.options.repeatMs) return false;

		while (this.sent.length > 0 && now - (this.sent[0] ?? 0) >= 60_000) this.sent.shift();
		if (this.sent.length >= this.options.perMinute) return false;

		this.sent.push(now);
		this.lastSeen.delete(key);
		this.lastSeen.set(key, now);
		// Keep the map small: forget the oldest keys.
		while (this.lastSeen.size > 100) {
			const oldest = this.lastSeen.keys().next().value;
			if (oldest === undefined) break;
			this.lastSeen.delete(oldest);
		}
		return true;
	}
}
