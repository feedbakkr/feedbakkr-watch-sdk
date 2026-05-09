import {
	AsyncQueue,
	buildPayload,
	type CaptureOptions,
	type ErrorSource,
	type EventPayload,
	type Tags,
} from "@feedbakkr/watch-core";

export interface ClientOptions {
	endpoint: string;
	projectId: string;
	projectName?: string;
	tenantId?: string;
	environment: string;
	appVersion?: string;
	apiKey?: string;
	enabled?: boolean;
	debug?: boolean;
	defaultTags?: Tags;
	defaultSource?: ErrorSource;
	maxQueueSize?: number;
	beforeSend?: (event: EventPayload) => EventPayload | null | Promise<EventPayload | null>;
	fetchImpl?: typeof fetch;
}

export interface FeedbakkrErrorsClient {
	captureError(error: Error | unknown, options?: CaptureOptions): Promise<void>;
	captureMessage(message: string, options?: CaptureOptions): Promise<void>;
	flush(): Promise<void>;
}

export function createFeedbakkrErrorsClient(options: ClientOptions): FeedbakkrErrorsClient {
	const enabled = options.enabled ?? true;
	const defaultSource = options.defaultSource ?? "api";
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
			queue.enqueue(event);
		} catch {
			// SDKs must never throw into host code.
		}
		return Promise.resolve();
	}

	return {
		captureError(error, captureOpts) {
			const err = error instanceof Error ? error : new Error(String(error));
			return send(err, captureOpts);
		},
		captureMessage(message, captureOpts = {}) {
			return send(message, { severity: "info", ...captureOpts });
		},
		flush() {
			// AsyncQueue has no explicit flush hook in v1 — drains opportunistically.
			// Kept on the API surface so callers can rely on it once we add it.
			return Promise.resolve();
		},
	};
}

export type { CaptureOptions, EventPayload, Tags } from "@feedbakkr/watch-core";
