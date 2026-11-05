import {
	AsyncQueue,
	buildPayload,
	type CaptureOptions,
	type EventPayload,
	fitPayload,
	type SourceName,
	type Tags,
	Throttle,
	type ThrottleOptions,
	timeoutSignal,
	walkCauses,
} from "@feedbakkr/watch-core";

export interface WatchClientOptions {
	/** Your Watch's ingest URL, e.g. `https://feedbakkr-watch.you.workers.dev/v1/events`. */
	endpoint: string;
	/** The app's id in Watch. */
	projectId: string;
	/** e.g. `production`. */
	environment: string;
	/** An ingest key (`wchi_…`) for this app. */
	ingestKey?: string;
	appVersion?: string;
	/**
	 * Set false to turn reporting off. Reporting is also off when `endpoint`
	 * or `projectId` is empty, so a missing config never produces requests.
	 */
	enabled?: boolean;
	/** Log send problems with console.debug. */
	debug?: boolean;
	defaultTags?: Tags;
	/** The component for events that don't name one. Default `api`. */
	defaultSource?: SourceName;
	maxQueueSize?: number;
	/** Abort a send after this many milliseconds. Default 5000. */
	timeoutMs?: number;
	/**
	 * Limits on what this client sends, so an error thrown in a loop can't use
	 * up the app's daily allowance. Default 60 a minute, and the same error
	 * (name, message and route) at most once every 2 seconds.
	 */
	limits?: Partial<ThrottleOptions>;
	/**
	 * Make the same error on different routes separate groups. Needs `route`
	 * on each capture (the Hono helper fills it in).
	 */
	groupByUrl?: boolean;
	/** Change or drop (return null) an event before it's sent. */
	beforeSend?: (event: EventPayload) => EventPayload | null | Promise<EventPayload | null>;
	fetchImpl?: typeof fetch;
}

/**
 * The promises returned here settle once the event has been sent (or the
 * send has failed or timed out) and never reject. On Cloudflare Workers,
 * pass them to `ctx.waitUntil()` so the send outlives the response; don't
 * `await` them in the request path.
 */
export interface WatchClient {
	captureError(error: unknown, options?: CaptureOptions): Promise<void>;
	captureMessage(message: string, options?: CaptureOptions): Promise<void>;
	/** Settles once every queued event has been sent. Never rejects. */
	flush(): Promise<void>;
}

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_LIMITS: ThrottleOptions = { perMinute: 60, repeatMs: 2_000 };

export function createWatchClient(options: WatchClientOptions): WatchClient {
	const enabled = (options.enabled ?? true) && Boolean(options.endpoint && options.projectId);
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const fetchImpl = options.fetchImpl ?? fetch;
	const throttle = new Throttle({ ...DEFAULT_LIMITS, ...options.limits });
	const debug = (...args: unknown[]) => {
		if (options.debug) console.debug("[feedbakkr-watch]", ...args);
	};

	const queue = new AsyncQueue<EventPayload>(
		async (event) => {
			let outgoing: EventPayload | null = event;
			if (options.beforeSend) {
				try {
					outgoing = (await options.beforeSend(event)) ?? null;
				} catch (e) {
					debug("beforeSend threw", e);
					outgoing = event;
				}
			}
			outgoing = outgoing && fitPayload(outgoing);
			if (!outgoing) return;

			const headers: Record<string, string> = {
				"content-type": "application/json",
				"x-feedbakkr-tool-source": "watch-node",
			};
			if (options.ingestKey) headers["x-feedbakkr-tool-key"] = options.ingestKey;
			try {
				const response = await fetchImpl(options.endpoint, {
					method: "POST",
					headers,
					body: JSON.stringify(outgoing),
					signal: timeoutSignal(timeoutMs),
				});
				if (!response.ok) debug("Watch refused the event", response.status);
			} catch (e) {
				debug("send failed", e);
			}
		},
		{ maxSize: options.maxQueueSize ?? 64 },
	);

	function send(error: Error | string, captureOptions: CaptureOptions = {}): Promise<void> {
		if (!enabled) return Promise.resolve();
		try {
			const event = buildPayload(
				error,
				{
					projectId: options.projectId,
					environment: options.environment,
					appVersion: options.appVersion,
					defaultSource: options.defaultSource ?? "api",
					defaultTags: options.defaultTags,
				},
				captureOptions,
			);
			if (error instanceof Error) {
				const causes = walkCauses(error);
				if (causes.length > 0) event.causes = causes;
			}
			if (options.groupByUrl && event.request?.route) event.groupByUrl = true;
			if (!throttle.allow(event)) return Promise.resolve();
			return queue.enqueueAndWait(event);
		} catch {
			// SDKs must never throw into host code.
			return Promise.resolve();
		}
	}

	return {
		captureError(error, captureOptions) {
			if (!enabled) return Promise.resolve();
			let err: Error;
			try {
				err = error instanceof Error ? error : new Error(String(error));
			} catch {
				err = new Error("Unknown error");
			}
			return send(err, captureOptions);
		},
		captureMessage(message, captureOptions = {}) {
			return send(message, { severity: "info", ...captureOptions });
		},
		flush() {
			return queue.flush();
		},
	};
}

const clients = new Map<string, WatchClient>();

/**
 * The same client for the same settings, made once. Use it where settings
 * only arrive per request (Cloudflare Workers' `env`), so the queue and
 * limits are shared rather than rebuilt for every error.
 */
export function getWatchClient(options: WatchClientOptions): WatchClient {
	const key = [options.endpoint, options.projectId, options.environment, options.ingestKey].join(
		"|",
	);
	let client = clients.get(key);
	if (!client) {
		client = createWatchClient(options);
		clients.set(key, client);
	}
	return client;
}

export type { CaptureOptions, EventPayload, SourceName, Tags } from "@feedbakkr/watch-core";
