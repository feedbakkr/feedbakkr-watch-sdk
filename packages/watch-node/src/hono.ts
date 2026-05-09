import type { CaptureOptions, ErrorSource } from "@feedbakkr/watch-core";
import type { Context, MiddlewareHandler } from "hono";
import type { FeedbakkrErrorsClient } from "./index.js";

export interface HonoErrorsOptions {
	client: FeedbakkrErrorsClient;
	source?: ErrorSource;
	requestIdHeader?: string;
}

/**
 * Wires a Feedbakkr Errors client into a Hono app via `app.onError`.
 *
 *   const errors = createFeedbakkrErrorsClient({ ... });
 *   app.onError(honoOnError({ client: errors }));
 *
 * The capture is enqueued, not awaited, so it never blocks the response. On
 * Cloudflare Workers, the helper also schedules the send via
 * `executionCtx.waitUntil` when available.
 */
export function honoOnError(options: HonoErrorsOptions) {
	const source = options.source ?? "api";
	const reqIdHeader = options.requestIdHeader ?? "x-request-id";

	return (err: Error, c: Context): Response => {
		const captureOpts: CaptureOptions = {
			source,
			route: c.req.path,
			method: c.req.method,
			requestId: c.req.header(reqIdHeader) ?? undefined,
		};
		const send = options.client.captureError(err, captureOpts);

		// On Workers, hand the promise to the runtime so it survives the response.
		const executionCtx = (
			c as unknown as { executionCtx?: { waitUntil(p: Promise<unknown>): void } }
		).executionCtx;
		if (executionCtx?.waitUntil) {
			executionCtx.waitUntil(send);
		}

		return c.json({ error: { code: "INTERNAL", message: "Internal server error" } }, 500);
	};
}

/**
 * Optional: middleware that sets a request id on `c` so downstream handlers
 * can read it. Only set if the request didn't already carry one.
 */
export function ensureRequestId(headerName = "x-request-id"): MiddlewareHandler {
	return async (c, next) => {
		if (!c.req.header(headerName)) {
			c.req.raw.headers.set(headerName, crypto.randomUUID());
		}
		await next();
	};
}
