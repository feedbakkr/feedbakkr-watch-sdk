// Tiny ordered async queue for SDK sends. Bounded so a slow endpoint can't
// pile up unbounded memory if the host app keeps capturing.

export interface AsyncQueueOptions {
	maxSize?: number;
}

interface Entry<T> {
	item: T;
	done?: () => void;
}

export class AsyncQueue<T> {
	private readonly maxSize: number;
	private readonly items: Entry<T>[] = [];
	private running = false;
	private idleWaiters: (() => void)[] = [];

	constructor(
		private readonly worker: (item: T) => Promise<void>,
		options: AsyncQueueOptions = {},
	) {
		this.maxSize = options.maxSize ?? 32;
	}

	/** Queue an item. Returns false (and drops it) when the queue is full. */
	enqueue(item: T): boolean {
		return this.push({ item });
	}

	/**
	 * Queue an item and return a promise that settles once the worker has
	 * finished with it, or immediately if the queue was full. Never rejects,
	 * so it is safe to hand to `ctx.waitUntil()`.
	 */
	enqueueAndWait(item: T): Promise<void> {
		return new Promise<void>((resolve) => {
			if (!this.push({ item, done: resolve })) resolve();
		});
	}

	/** Settles once every queued item has been processed. Never rejects. */
	flush(): Promise<void> {
		if (!this.running && this.items.length === 0) return Promise.resolve();
		return new Promise<void>((resolve) => {
			this.idleWaiters.push(resolve);
		});
	}

	private push(entry: Entry<T>): boolean {
		if (this.items.length >= this.maxSize) return false;
		this.items.push(entry);
		void this.drain();
		return true;
	}

	private async drain(): Promise<void> {
		if (this.running) return;
		this.running = true;
		while (this.items.length > 0) {
			const entry = this.items.shift();
			if (entry === undefined) continue;
			try {
				await this.worker(entry.item);
			} catch {
				// SDKs must never throw into host code; failures are intentionally swallowed here.
			}
			entry.done?.();
		}
		this.running = false;
		const waiters = this.idleWaiters;
		this.idleWaiters = [];
		for (const resolve of waiters) resolve();
	}
}

/**
 * An AbortSignal that fires after `ms`, or undefined where the runtime has
 * no `AbortSignal.timeout` (the send then simply has no timeout).
 */
export function timeoutSignal(ms: number): AbortSignal | undefined {
	if (!(ms > 0) || typeof AbortSignal === "undefined") return undefined;
	const timeout = (AbortSignal as { timeout?: (ms: number) => AbortSignal }).timeout;
	return typeof timeout === "function" ? timeout.call(AbortSignal, ms) : undefined;
}
