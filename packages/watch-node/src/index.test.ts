import { describe, expect, test, vi } from "vitest";
import { createWatchClient, getWatchClient } from "./index.js";

const base = {
	endpoint: "https://watch.example.com/v1/events",
	projectId: "proj",
	environment: "test",
};

function hangingFetch() {
	return vi.fn(
		(_url: unknown, init?: RequestInit) =>
			new Promise<Response>((_resolve, reject) => {
				init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
			}),
	);
}

describe("createWatchClient", () => {
	test("captureError settles after the send completes", async () => {
		let finish!: (r: Response) => void;
		const fetchImpl = vi.fn(
			() =>
				new Promise<Response>((resolve) => {
					finish = resolve;
				}),
		);
		const client = createWatchClient({ ...base, fetchImpl });
		let settled = false;
		const pending = client.captureError(new Error("boom")).then(() => {
			settled = true;
		});
		await new Promise((r) => setTimeout(r, 0));
		expect(fetchImpl).toHaveBeenCalledTimes(1);
		expect(settled).toBe(false);
		finish(new Response(null, { status: 202 }));
		await pending;
		expect(settled).toBe(true);
	});

	test("never rejects when the network fails", async () => {
		const fetchImpl = vi.fn(async () => {
			throw new TypeError("network down");
		});
		const client = createWatchClient({ ...base, fetchImpl });
		await expect(client.captureError(new Error("boom"))).resolves.toBeUndefined();
	});

	test("never rejects on an error response", async () => {
		const fetchImpl = vi.fn(async () => new Response("nope", { status: 500 }));
		const client = createWatchClient({ ...base, fetchImpl });
		await expect(client.captureError(new Error("boom"))).resolves.toBeUndefined();
	});

	test("a hung endpoint is abandoned after timeoutMs", async () => {
		const fetchImpl = hangingFetch();
		const client = createWatchClient({ ...base, fetchImpl, timeoutMs: 20 });
		const started = Date.now();
		await client.captureError(new Error("boom"));
		expect(Date.now() - started).toBeLessThan(1000);
	});

	test("sends nothing when endpoint or projectId is missing", async () => {
		const fetchImpl = vi.fn(async () => new Response(null, { status: 202 }));
		for (const missing of [{ endpoint: "" }, { projectId: "" }]) {
			const client = createWatchClient({ ...base, ...missing, fetchImpl });
			await client.captureError(new Error("boom"));
			await client.flush();
		}
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	test("sends nothing when disabled", async () => {
		const fetchImpl = vi.fn(async () => new Response(null, { status: 202 }));
		const client = createWatchClient({ ...base, enabled: false, fetchImpl });
		await client.captureError(new Error("boom"));
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	test("accepts custom component sources and flushes", async () => {
		const bodies: { source: string }[] = [];
		const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
			bodies.push(JSON.parse(String(init?.body)));
			return new Response(null, { status: 202 });
		});
		const client = createWatchClient({ ...base, defaultSource: "api-cron", fetchImpl });
		void client.captureError(new Error("a"));
		void client.captureError(new Error("b"), { source: "community-server" });
		await client.flush();
		expect(bodies.map((b) => b.source)).toEqual(["api-cron", "community-server"]);
	});

	test("does not throw for values whose toString throws", async () => {
		const fetchImpl = vi.fn(async () => new Response(null, { status: 202 }));
		const client = createWatchClient({ ...base, fetchImpl });
		const hostile = {
			toString() {
				throw new Error("nope");
			},
		};
		await expect(client.captureError(hostile)).resolves.toBeUndefined();
	});
});

describe("limits", () => {
	function counting() {
		const bodies: Record<string, unknown>[] = [];
		const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
			bodies.push(JSON.parse(String(init?.body)));
			return new Response(null, { status: 202 });
		});
		return { bodies, fetchImpl };
	}

	test("sends the ingest key and SDK name", async () => {
		const fetchImpl = vi.fn(async () => new Response(null, { status: 202 }));
		const client = createWatchClient({ ...base, ingestKey: "wchi_x", fetchImpl });
		await client.captureError(new Error("boom"));
		const headers = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1]
			.headers as Record<string, string>;
		expect(headers["x-feedbakkr-tool-key"]).toBe("wchi_x");
		expect(headers["x-feedbakkr-tool-source"]).toBe("watch-node");
	});

	test("drops quick repeats of the same error", async () => {
		const { bodies, fetchImpl } = counting();
		const client = createWatchClient({ ...base, fetchImpl });
		for (let i = 0; i < 5; i++) void client.captureError(new Error("loop"));
		void client.captureError(new Error("other"));
		await client.flush();
		expect(bodies.map((b) => b.message)).toEqual(["loop", "other"]);
	});

	test("caps events per minute", async () => {
		const { bodies, fetchImpl } = counting();
		const client = createWatchClient({ ...base, fetchImpl, limits: { perMinute: 3 } });
		for (let i = 0; i < 10; i++) void client.captureError(new Error(`e${i}`));
		await client.flush();
		expect(bodies).toHaveLength(3);
	});

	test("shrinks an oversized event to fit", async () => {
		const { bodies, fetchImpl } = counting();
		const client = createWatchClient({ ...base, fetchImpl });
		await client.captureError(new Error("big"), {
			context: { blob: "x".repeat(50_000) },
			tags: { a: "y".repeat(20_000) },
		});
		expect(bodies).toHaveLength(1);
		expect(JSON.stringify(bodies[0]).length).toBeLessThanOrEqual(60 * 1024);
		expect(bodies[0]?.message).toBe("big");
	});
});

describe("getWatchClient", () => {
	test("returns the same client for the same settings", () => {
		const fetchImpl = vi.fn();
		const a = getWatchClient({ ...base, ingestKey: "k1", fetchImpl });
		expect(getWatchClient({ ...base, ingestKey: "k1", fetchImpl })).toBe(a);
		expect(getWatchClient({ ...base, ingestKey: "k2", fetchImpl })).not.toBe(a);
	});
});
