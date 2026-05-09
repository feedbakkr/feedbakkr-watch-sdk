import { describe, expect, test } from "vitest";
import { sanitise } from "./sanitise.js";

describe("sanitise", () => {
	test("redacts well-known sensitive keys", () => {
		const out = sanitise({
			authorization: "Bearer abc",
			cookie: "session=xyz",
			password: "hunter2",
			email: "ada@example.com",
			workspaceId: "wks_1",
		}) as Record<string, unknown>;

		expect(out.authorization).toBe("[REDACTED]");
		expect(out.cookie).toBe("[REDACTED]");
		expect(out.password).toBe("[REDACTED]");
		expect(out.email).toBe("[REDACTED]");
		expect(out.workspaceId).toBe("wks_1");
	});

	test("walks nested structures", () => {
		const out = sanitise({
			user: { name: "Ada", email: "ada@example.com" },
			meta: { token: "secret" },
		}) as { user: { email: unknown }; meta: { token: unknown } };
		expect(out.user.email).toBe("[REDACTED]");
		expect(out.meta.token).toBe("[REDACTED]");
	});

	test("caps depth and key count", () => {
		let nested: Record<string, unknown> = {};
		const inner = nested;
		for (let i = 0; i < 10; i++) {
			const next = {} as Record<string, unknown>;
			(nested as Record<string, unknown>).next = next;
			nested = next;
		}
		const out = sanitise(inner) as { next: { next: { next: { next: { next: unknown } } } } };
		expect(JSON.stringify(out)).toContain("[TRUNCATED]");
	});

	test("custom sensitive pattern is honoured", () => {
		const out = sanitise(
			{ companyId: "123", customSecret: "x" },
			{ additionalSensitiveKeys: /^customSecret$/i },
		) as Record<string, unknown>;
		expect(out.customSecret).toBe("[REDACTED]");
		expect(out.companyId).toBe("123");
	});
});
