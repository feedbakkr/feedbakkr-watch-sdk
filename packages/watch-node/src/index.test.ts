import { describe, expect, test, vi } from "vitest";
import { createFeedbakkrErrorsClient } from "./index.js";

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

describe("createFeedbakkrErrorsClient", () => {
	test("captureError settles after the send completes", async () => {
		let finish!: (r: Response) => void;
		const fetchImpl = vi.fn(
			() =>
				new Promise<Response>((resolve) => {
					finish = resolve;
				}),
		);
		const client = createFeedbakkrErrorsClient({ ...base, fetchImpl });
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
		const client = createFeedbakkrErrorsClient({ ...base, fetchImpl });
		await expect(client.captureError(new Error("boom"))).resolves.toBeUndefined();
	});

	test("never rejects on an error response", async () => {
		const fetchImpl = vi.fn(async () => new Response("nope", { status: 500 }));
		const client = createFeedbakkrErrorsClient({ ...base, fetchImpl });
		await expect(client.captureError(new Error("boom"))).resolves.toBeUndefined();
	});

	test("a hung endpoint is abandoned after timeoutMs", async () => {
		const fetchImpl = hangingFetch();
		const client = createFeedbakkrErrorsClient({ ...base, fetchImpl, timeoutMs: 20 });
		const started = Date.now();
		await client.captureError(new Error("boom"));
		expect(Date.now() - started).toBeLessThan(1000);
	});

	test("sends nothing when endpoint or projectId is missing", async () => {
		const fetchImpl = vi.fn(async () => new Response(null, { status: 202 }));
		for (const missing of [{ endpoint: "" }, { projectId: "" }]) {
			const client = createFeedbakkrErrorsClient({ ...base, ...missing, fetchImpl });
			await client.captureError(new Error("boom"));
			await client.flush();
		}
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	test("sends nothing when disabled", async () => {
		const fetchImpl = vi.fn(async () => new Response(null, { status: 202 }));
		const client = createFeedbakkrErrorsClient({ ...base, enabled: false, fetchImpl });
		await client.captureError(new Error("boom"));
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	test("accepts custom component sources and flushes", async () => {
		const bodies: { source: string }[] = [];
		const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
			bodies.push(JSON.parse(String(init?.body)));
			return new Response(null, { status: 202 });
		});
		const client = createFeedbakkrErrorsClient({ ...base, defaultSource: "api-cron", fetchImpl });
		void client.captureError(new Error("a"));
		void client.captureError(new Error("b"), { source: "community-server" });
		await client.flush();
		expect(bodies.map((b) => b.source)).toEqual(["api-cron", "community-server"]);
	});

	test("does not throw for values whose toString throws", async () => {
		const fetchImpl = vi.fn(async () => new Response(null, { status: 202 }));
		const client = createFeedbakkrErrorsClient({ ...base, fetchImpl });
		const hostile = {
			toString() {
				throw new Error("nope");
			},
		};
		await expect(client.captureError(hostile)).resolves.toBeUndefined();
	});
});
