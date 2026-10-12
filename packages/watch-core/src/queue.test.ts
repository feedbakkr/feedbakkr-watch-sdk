import { describe, expect, test } from "vitest";
import { AsyncQueue, timeoutSignal } from "./queue.js";

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

describe("AsyncQueue", () => {
	test("enqueueAndWait settles only after the worker finishes that item", async () => {
		const gate = deferred();
		const queue = new AsyncQueue<number>(async () => {
			await gate.promise;
		});
		let settled = false;
		const waiting = queue.enqueueAndWait(1).then(() => {
			settled = true;
		});
		await Promise.resolve();
		expect(settled).toBe(false);
		gate.resolve();
		await waiting;
		expect(settled).toBe(true);
	});

	test("enqueueAndWait resolves (not rejects) when the worker throws", async () => {
		const queue = new AsyncQueue<number>(async () => {
			throw new Error("send failed");
		});
		await expect(queue.enqueueAndWait(1)).resolves.toBeUndefined();
	});

	test("enqueueAndWait resolves immediately when the queue is full", async () => {
		const gate = deferred();
		const queue = new AsyncQueue<number>(() => gate.promise, { maxSize: 1 });
		queue.enqueue(1); // taken by the worker
		queue.enqueue(2); // fills the queue
		await expect(queue.enqueueAndWait(3)).resolves.toBeUndefined();
		gate.resolve();
	});

	test("enqueue still reports whether the item was accepted", () => {
		const queue = new AsyncQueue<number>(() => new Promise(() => {}), { maxSize: 1 });
		expect(queue.enqueue(1)).toBe(true);
		expect(queue.enqueue(2)).toBe(true);
		expect(queue.enqueue(3)).toBe(false);
	});

	test("flush waits for every queued item", async () => {
		const done: number[] = [];
		const queue = new AsyncQueue<number>(async (n) => {
			await new Promise((r) => setTimeout(r, 5));
			done.push(n);
		});
		queue.enqueue(1);
		queue.enqueue(2);
		await queue.flush();
		expect(done).toEqual([1, 2]);
	});

	test("flush resolves at once when idle", async () => {
		const queue = new AsyncQueue<number>(async () => {});
		await expect(queue.flush()).resolves.toBeUndefined();
	});
});

describe("timeoutSignal", () => {
	test("aborts after the given time", async () => {
		const signal = timeoutSignal(10);
		expect(signal?.aborted).toBe(false);
		await new Promise((r) => setTimeout(r, 30));
		expect(signal?.aborted).toBe(true);
	});

	test("returns undefined for a non-positive timeout", () => {
		expect(timeoutSignal(0)).toBeUndefined();
	});
});
