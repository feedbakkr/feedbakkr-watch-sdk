import {
	AsyncQueue,
	buildPayload,
	type CaptureOptions,
	type EventPayload,
	type SourceName,
	type Tags,
	timeoutSignal,
	walkCauses,
} from "@feedbakkr/watch-core";

export interface ClientOptions {
	endpoint: string;
	projectId: string;
	projectName?: string;
	tenantId?: string;
	environment: string;
	appVersion?: string;
	apiKey?: string;
	/**
	 * Set false to turn reporting off. Reporting is also off when `endpoint`
	 * or `projectId` is empty, so a missing config never produces requests.
	 */
	enabled?: boolean;
	debug?: boolean;
	defaultTags?: Tags;
	defaultSource?: SourceName;
	maxQueueSize?: number;
	/** Abort a send after this many milliseconds. Default 5000. */
	timeoutMs?: number;
	/**
	 * When true, the worker folds `request.route` into the fingerprint so
	 * the same error at different routes becomes distinct groups. Caller
	 * must pass `route` via `CaptureOptions` (or the Hono helper, which
	 * fills it in automatically) — there's no global `route` to auto-detect
	 * server-side.
	 */
	groupByUrl?: boolean;
	beforeSend?: (event: EventPayload) => EventPayload | null | Promise<EventPayload | null>;
	fetchImpl?: typeof fetch;
}

/**
 * The promises returned here settle once the event has been sent (or the
 * send has failed or timed out) and never reject. On Cloudflare Workers,
 * pass them to `ctx.waitUntil()` so the send outlives the response; don't
 * `await` them in the request path.
 */
export interface FeedbakkrErrorsClient {
	captureError(error: Error | unknown, options?: CaptureOptions): Promise<void>;
	captureMessage(message: string, options?: CaptureOptions): Promise<void>;
	/** Settles once every queued event has been sent. Never rejects. */
	flush(): Promise<void>;
}

const DEFAULT_TIMEOUT_MS = 5000;

export function createFeedbakkrErrorsClient(options: ClientOptions): FeedbakkrErrorsClient {
	const enabled = (options.enabled ?? true) && Boolean(options.endpoint && options.projectId);
	const defaultSource = options.defaultSource ?? "api";
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const fetchImpl = options.fetchImpl ?? fetch;

	const queue = new AsyncQueue<EventPayload>(
		async (event) => {
			let outgoing: EventPayload | null = event;
			if (options.beforeSend) {
				try {
					outgoing = (await options.beforeSend(event)) ?? null;
				} catch (e) {
					if (options.debug) {
						// biome-ignore lint/suspicious/noConsole: debug-only
						console.debug("[feedbakkr-errors] beforeSend threw", e);
					}
					outgoing = event;
				}
			}
			if (!outgoing) return;

			const headers: Record<string, string> = {
				"content-type": "application/json",
				"x-feedbakkr-tool-source": "errors-node",
			};
			if (options.apiKey) headers["x-feedbakkr-tool-key"] = options.apiKey;

			try {
				await fetchImpl(options.endpoint, {
					method: "POST",
					headers,
					body: JSON.stringify(outgoing),
					signal: timeoutSignal(timeoutMs),
				});
			} catch (e) {
				if (options.debug) {
					// biome-ignore lint/suspicious/noConsole: debug-only
					console.debug("[feedbakkr-errors] send failed", e);
				}
			}
		},
		{ maxSize: options.maxQueueSize ?? 64 },
	);

	function send(error: Error | string, captureOpts: CaptureOptions = {}): Promise<void> {
		if (!enabled) return Promise.resolve();
		try {
			const event = buildPayload(
				error,
				{
					projectId: options.projectId,
					projectName: options.projectName,
					tenantId: options.tenantId,
					environment: options.environment,
					appVersion: options.appVersion,
					defaultSource,
					defaultTags: options.defaultTags,
				},
				captureOpts,
			);

			// Cause-chain — always on, part of the necessary error data.
			if (error instanceof Error) {
				const causes = walkCauses(error);
				if (causes.length > 0) event.causes = causes;
			}

			// Group-by-URL instruction for the worker. No-op if the caller
			// didn't pass a route — there's nothing to fold in.
			if (options.groupByUrl && event.request?.route) {
				event.groupByUrl = true;
			}

			return queue.enqueueAndWait(event);
		} catch {
			// SDKs must never throw into host code.
			return Promise.resolve();
		}
	}

	return {
		captureError(error, captureOpts) {
			if (!enabled) return Promise.resolve();
			let err: Error;
			try {
				err = error instanceof Error ? error : new Error(String(error));
			} catch {
				err = new Error("Unknown error");
			}
			return send(err, captureOpts);
		},
		captureMessage(message, captureOpts = {}) {
			return send(message, { severity: "info", ...captureOpts });
		},
		flush() {
			return queue.flush();
		},
	};
}

export type { CaptureOptions, EventPayload, SourceName, Tags } from "@feedbakkr/watch-core";
