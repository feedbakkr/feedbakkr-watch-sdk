// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { __resetForTests, captureError, initFeedbakkrErrors } from "./index.js";

const base = {
	endpoint: "https://watch.example.com/v1/events",
	projectId: "proj",
	environment: "test",
};

let sent: { body: { source: string; message: string }; init: RequestInit }[] = [];

function wait() {
	return new Promise((r) => setTimeout(r, 10));
}

beforeEach(() => {
	__resetForTests();
	sent = [];
	globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
		sent.push({ body: JSON.parse(String(init?.body)), init: init ?? {} });
		return new Response(null, { status: 202 });
	}) as typeof fetch;
});

afterEach(() => {
	__resetForTests();
});

function throwUnhandled(message: string) {
	window.dispatchEvent(new ErrorEvent("error", { error: new Error(message), message }));
}

describe("initFeedbakkrErrors", () => {
	test("sends captured errors with the default source", async () => {
		initFeedbakkrErrors(base);
		captureError(new Error("boom"));
		await wait();
		expect(sent).toHaveLength(1);
		expect(sent[0]?.body.source).toBe("web");
	});

	test("uses a custom defaultSource for automatic captures", async () => {
		initFeedbakkrErrors({ ...base, defaultSource: "community-web" });
		throwUnhandled("unhandled");
		await wait();
		// __resetForTests re-arms the install-once guard, so earlier tests'
		// window listeners may also fire here; every send must use the source.
		expect(sent.length).toBeGreaterThan(0);
		expect(new Set(sent.map((s) => s.body.source))).toEqual(new Set(["community-web"]));
	});

	test("sends with a timeout signal", async () => {
		initFeedbakkrErrors(base);
		captureError(new Error("boom"));
		await wait();
		expect(sent[0]?.init.signal).toBeInstanceOf(AbortSignal);
	});

	test("does nothing when endpoint or projectId is missing", async () => {
		initFeedbakkrErrors({ ...base, endpoint: "" });
		captureError(new Error("boom"));
		initFeedbakkrErrors({ ...base, projectId: "" });
		captureError(new Error("boom"));
		await wait();
		expect(sent).toHaveLength(0);
	});

	test("enabled: false also stops automatic capture", async () => {
		initFeedbakkrErrors(base);
		initFeedbakkrErrors({ ...base, enabled: false });
		throwUnhandled("should not be sent");
		captureError(new Error("nor this"));
		await wait();
		expect(sent).toHaveLength(0);
	});

	test("a failing endpoint never throws into the page", async () => {
		globalThis.fetch = vi.fn(async () => {
			throw new TypeError("network down");
		}) as typeof fetch;
		initFeedbakkrErrors(base);
		expect(() => captureError(new Error("boom"))).not.toThrow();
		await wait();
	});
});
