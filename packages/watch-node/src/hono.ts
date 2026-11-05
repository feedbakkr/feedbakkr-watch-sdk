import type { CaptureOptions, SourceName } from "@feedbakkr/watch-core";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { WatchClient } from "./index.js";

export interface WatchOnErrorOptions {
	/**
	 * The client, or a function that returns it for a request. On Cloudflare
	 * Workers, where settings live on `c.env`, use a function with
	 * `getWatchClient` so one client is shared across requests.
	 */
	client: WatchClient | ((c: Context) => WatchClient);
	/** The component to report. Default `api`. */
	source?: SourceName;
	/** Read the request id from this header. Default `x-request-id`. */
	requestIdHeader?: string;
}

/**
 * An `app.onError` handler that reports server errors to Watch.
 *
 *   app.onError(watchOnError({ client: watch }));
 *
 * `HTTPException`s keep their own response; only those with a 5xx status are
 * reported, so a 404 or 401 you throw on purpose isn't an error in Watch.
 * Anything else is reported and answered with a plain 500. The send never
 * delays the response: on Workers it's passed to `executionCtx.waitUntil`.
 */
export function watchOnError(options: WatchOnErrorOptions) {
	const source = options.source ?? "api";
	const requestIdHeader = options.requestIdHeader ?? "x-request-id";

	return (err: Error, c: Context): Response => {
		const isHttp = err instanceof HTTPException;
		const status = isHttp ? err.status : 500;
		if (status >= 500) {
			try {
				const client = typeof options.client === "function" ? options.client(c) : options.client;
				const captureOptions: CaptureOptions = {
					source,
					route: c.req.routePath || c.req.path,
					method: c.req.method,
					statusCode: status,
					requestId: c.req.header(requestIdHeader) ?? undefined,
				};
				waitUntil(c, client.captureError(err, captureOptions));
			} catch {
				// Reporting must never change the host's response.
			}
		}
		if (isHttp) return err.getResponse();
		return c.json({ error: { code: "INTERNAL", message: "Internal server error" } }, 500);
	};
}

function waitUntil(c: Context, promise: Promise<unknown>) {
	try {
		// Throws outside Workers, where there's no execution context.
		c.executionCtx.waitUntil(promise);
	} catch {
		// Node keeps running, so the send completes anyway.
	}
}
