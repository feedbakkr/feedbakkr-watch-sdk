// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { __resetForTests, captureError, initWatch } from "./index.js";

const base = {
	endpoint: "https://watch.example.com/v1/events",
	projectId: "proj",
	environment: "test",
};

let sent: {
	body: { source: string; message: string; fetchHistory?: { url: string }[] };
	init: RequestInit;
}[] = [];

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

describe("initWatch", () => {
	test("sends captured errors with the default source", async () => {
		initWatch(base);
		captureError(new Error("boom"));
		await wait();
		expect(sent).toHaveLength(1);
		expect(sent[0]?.body.source).toBe("web");
	});

	test("uses a custom defaultSource for automatic captures", async () => {
		initWatch({ ...base, defaultSource: "community-web" });
		throwUnhandled("unhandled");
		await wait();
		// __resetForTests re-arms the install-once guard, so earlier tests'
		// window listeners may also fire here; every send must use the source.
		expect(sent.length).toBeGreaterThan(0);
		expect(new Set(sent.map((s) => s.body.source))).toEqual(new Set(["community-web"]));
	});

	test("sends with a timeout signal", async () => {
		initWatch(base);
		captureError(new Error("boom"));
		await wait();
		expect(sent[0]?.init.signal).toBeInstanceOf(AbortSignal);
	});

	test("does nothing when endpoint or projectId is missing", async () => {
		initWatch({ ...base, endpoint: "" });
		captureError(new Error("boom"));
		initWatch({ ...base, projectId: "" });
		captureError(new Error("boom"));
		await wait();
		expect(sent).toHaveLength(0);
	});

	test("enabled: false also stops automatic capture", async () => {
		initWatch(base);
		initWatch({ ...base, enabled: false });
		throwUnhandled("should not be sent");
		captureError(new Error("nor this"));
		await wait();
		expect(sent).toHaveLength(0);
	});

	test("a failing endpoint never throws into the page", async () => {
		globalThis.fetch = vi.fn(async () => {
			throw new TypeError("network down");
		}) as typeof fetch;
		initWatch(base);
		expect(() => captureError(new Error("boom"))).not.toThrow();
		await wait();
	});
});

describe("what gets sent", () => {
	test("sends the ingest key and SDK name", async () => {
		initWatch({ ...base, ingestKey: "wchi_x" });
		captureError(new Error("boom"));
		await wait();
		const headers = sent[0]?.init.headers as Record<string, string>;
		expect(headers["x-feedbakkr-tool-key"]).toBe("wchi_x");
		expect(headers["x-feedbakkr-tool-source"]).toBe("watch-web");
	});

	test("refuses a plain-http endpoint unless debugging", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		initWatch({ ...base, endpoint: "http://watch.example.com/v1/events" });
		captureError(new Error("boom"));
		await wait();
		expect(sent).toHaveLength(0);
		warn.mockRestore();
	});

	test("drops quick repeats and caps errors per minute", async () => {
		initWatch({ ...base, limits: { perMinute: 3 } });
		for (let i = 0; i < 5; i++) captureError(new Error("loop"));
		for (let i = 0; i < 5; i++) captureError(new Error(`e${i}`));
		await wait();
		expect(sent.map((s) => s.body.message)).toEqual(["loop", "e0", "e1"]);
	});

	test("ignores cross-site Script error. and browser extensions", async () => {
		initWatch(base);
		window.dispatchEvent(new ErrorEvent("error", { message: "Script error." }));
		window.dispatchEvent(
			new ErrorEvent("error", {
				message: "x is undefined",
				filename: "chrome-extension://abc/content.js",
			}),
		);
		const fromExtension = new Error("ext");
		fromExtension.stack = "Error: ext\n    at f (moz-extension://abc/inject.js:1:2)";
		window.dispatchEvent(new ErrorEvent("error", { error: fromExtension, message: "ext" }));
		await wait();
		expect(sent).toHaveLength(0);
	});

	test("leaves Watch's own sends out of the fetch history", async () => {
		const appFetch = globalThis.fetch;
		globalThis.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
			if (String(url).includes("/api/")) return new Response(null, { status: 500 });
			return appFetch(url as string, init);
		}) as typeof fetch;
		initWatch({ ...base, consent: { behavioural: true } });
		await fetch("https://app.example.com/api/orders?token=secret");
		captureError(new Error("first"));
		await wait();
		captureError(new Error("second"));
		await wait();
		expect(sent[1]?.body.fetchHistory?.map((f) => f.url)).toEqual([
			"https://app.example.com/api/orders",
		]);
	});
});
