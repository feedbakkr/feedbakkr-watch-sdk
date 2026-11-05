import { describe, expect, test } from "vitest";
import { fitPayload, Throttle } from "./limits.js";
import type { EventPayload } from "./types.js";

const event = (overrides: Partial<EventPayload> = {}): EventPayload => ({
	source: "web",
	severity: "error",
	environment: "test",
	timestamp: "2026-11-05T12:00:00Z",
	projectId: "shop",
	message: "boom",
	...overrides,
});

describe("fitPayload", () => {
	test("leaves small events alone", () => {
		const e = event();
		expect(fitPayload(e)).toBe(e);
	});

	test("drops extras first, then cuts the stack", () => {
		const big = event({
			breadcrumbs: Array.from({ length: 50 }, (_, i) => ({
				timestamp: "t",
				category: "c",
				message: "x".repeat(500) + i,
			})),
			stack: "s".repeat(10_000),
		});
		const fitted = fitPayload(big, 8_000);
		expect(fitted?.breadcrumbs).toBeUndefined();
		expect(fitted?.stack?.length).toBeLessThan(8_000);
		expect(new TextEncoder().encode(JSON.stringify(fitted)).length).toBeLessThanOrEqual(8_000);
		expect(fitted?.message).toBe("boom");
	});
});

describe("Throttle", () => {
	test("suppresses quick repeats of the same error", () => {
		const t = new Throttle({ perMinute: 100, repeatMs: 5_000 });
		expect(t.allow(event(), 0)).toBe(true);
		expect(t.allow(event(), 1_000)).toBe(false);
		expect(t.allow(event({ message: "other" }), 1_000)).toBe(true);
		expect(t.allow(event(), 6_000)).toBe(true);
	});

	test("caps events per rolling minute", () => {
		const t = new Throttle({ perMinute: 3, repeatMs: 0 });
		for (let i = 0; i < 3; i++) expect(t.allow(event({ message: `e${i}` }), i)).toBe(true);
		expect(t.allow(event({ message: "e3" }), 10)).toBe(false);
		expect(t.allow(event({ message: "e4" }), 60_001)).toBe(true);
	});
});
