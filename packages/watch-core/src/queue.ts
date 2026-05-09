// Tiny ordered async queue for SDK sends. Bounded so a slow endpoint can't
// pile up unbounded memory if the host app keeps capturing.

export interface AsyncQueueOptions {
	maxSize?: number;
}

export class AsyncQueue<T> {
	private readonly maxSize: number;
	private readonly items: T[] = [];
	private running = false;

	constructor(
		private readonly worker: (item: T) => Promise<void>,
		options: AsyncQueueOptions = {},
	) {
		this.maxSize = options.maxSize ?? 32;
	}

	enqueue(item: T): boolean {
		if (this.items.length >= this.maxSize) return false;
		this.items.push(item);
		void this.drain();
		return true;
	}

	private async drain(): Promise<void> {
		if (this.running) return;
		this.running = true;
		while (this.items.length > 0) {
			const item = this.items.shift();
			if (item === undefined) continue;
			try {
				await this.worker(item);
			} catch {
				// SDKs must never throw into host code; failures are intentionally swallowed here.
			}
		}
		this.running = false;
	}
}
