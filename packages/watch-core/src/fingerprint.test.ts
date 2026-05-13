import { describe, expect, test } from "vitest";
import { computeFingerprint } from "./fingerprint.js";
import type { EventPayload } from "./types.js";

function payload(overrides: Partial<EventPayload> = {}): EventPayload {
	return {
		source: "web",
		severity: "error",
		environment: "production",
		timestamp: new Date().toISOString(),
		projectId: "proj_1",
		errorName: "TypeError",
		message: "Cannot read properties of undefined (reading 'id')",
		stack: "TypeError: x\n    at handler (/app/src/inbox/list.tsx:88:3)",
		...overrides,
	};
}

describe("computeFingerprint", () => {
	test("same logical error produces the same fingerprint across builds", async () => {
		const a = await computeFingerprint(
			payload({ stack: "TypeError: x\n    at handler (/app/static/chunk-AAA111.js:10:1)" }),
		);
		const b = await computeFingerprint(
			payload({ stack: "TypeError: x\n    at handler (/app/static/chunk-BBB222.js:10:1)" }),
		);
		expect(a).toBe(b);
	});

	test("different errors fingerprint differently", async () => {
		const a = await computeFingerprint(payload({ message: "Cannot read 'id'" }));
		const b = await computeFingerprint(payload({ message: "Cannot read 'name'" }));
		expect(a).not.toBe(b);
	});

	test("explicit fingerprint wins", async () => {
		const fp = await computeFingerprint(payload({ fingerprint: "custom-fp-123" }));
		expect(fp).toBe("custom-fp-123");
	});

	test("dynamic ids in route do not split the group when grouping by URL", async () => {
		const a = await computeFingerprint(
			payload({
				groupByUrl: true,
				request: { route: "/projects/550e8400-e29b-41d4-a716-446655440000/edit" },
			}),
		);
		const b = await computeFingerprint(
			payload({
				groupByUrl: true,
				request: { route: "/projects/11111111-2222-3333-4444-555555555555/edit" },
			}),
		);
		expect(a).toBe(b);
	});

	test("route is ignored by default — same error at different URLs groups together", async () => {
		const a = await computeFingerprint(payload({ request: { route: "/page-a" } }));
		const b = await computeFingerprint(payload({ request: { route: "/page-b" } }));
		expect(a).toBe(b);
	});

	test("with groupByUrl on, different routes split the group", async () => {
		const a = await computeFingerprint(
			payload({ groupByUrl: true, request: { route: "/page-a" } }),
		);
		const b = await computeFingerprint(
			payload({ groupByUrl: true, request: { route: "/page-b" } }),
		);
		expect(a).not.toBe(b);
	});
});
