import {
	AsyncQueue,
	type Breadcrumb,
	buildPayload,
	type CaptureOptions,
	type EventPayload,
	type Tags,
} from "@feedbakkr/watch-core";

export interface InitOptions {
	endpoint: string;
	projectId: string;
	projectName?: string;
	tenantId?: string;
	environment: string;
	appVersion?: string;
	apiKey?: string;
	enabled?: boolean;
	debug?: boolean;
	maxBreadcrumbs?: number;
	sampleRate?: number;
	defaultTags?: Tags;
	captureUnhandledErrors?: boolean;
	captureUnhandledRejections?: boolean;
	captureNavigation?: boolean;
	beforeSend?: (event: EventPayload) => EventPayload | null | Promise<EventPayload | null>;
}

interface InternalState {
	options: Required<
		Omit<
			InitOptions,
			"appVersion" | "apiKey" | "tenantId" | "projectName" | "defaultTags" | "beforeSend"
		>
	> & {
		appVersion?: string;
		apiKey?: string;
		tenantId?: string;
		projectName?: string;
		defaultTags?: Tags;
		beforeSend?: InitOptions["beforeSend"];
	};
	breadcrumbs: Breadcrumb[];
	queue: AsyncQueue<EventPayload>;
}

let state: InternalState | null = null;

export function initFeedbakkrErrors(options: InitOptions): void {
	const merged: InternalState["options"] = {
		endpoint: options.endpoint,
		projectId: options.projectId,
		projectName: options.projectName,
		tenantId: options.tenantId,
		environment: options.environment,
		appVersion: options.appVersion,
		apiKey: options.apiKey,
		enabled: options.enabled ?? true,
		debug: options.debug ?? false,
		maxBreadcrumbs: options.maxBreadcrumbs ?? 30,
		sampleRate: options.sampleRate ?? 1,
		captureUnhandledErrors: options.captureUnhandledErrors ?? true,
		captureUnhandledRejections: options.captureUnhandledRejections ?? true,
		captureNavigation: options.captureNavigation ?? false,
		defaultTags: options.defaultTags,
		beforeSend: options.beforeSend,
	};

	state = {
		options: merged,
		breadcrumbs: [],
		queue: new AsyncQueue<EventPayload>(async (event) => {
			await sendEvent(event, merged);
		}),
	};

	if (typeof window === "undefined") return;

	if (merged.captureUnhandledErrors) {
		window.addEventListener("error", (e) => {
			const err = e.error instanceof Error ? e.error : new Error(e.message || "Unhandled error");
			safeCapture(err);
		});
	}

	if (merged.captureUnhandledRejections) {
		window.addEventListener("unhandledrejection", (e) => {
			const reason = e.reason;
			const err =
				reason instanceof Error
					? reason
					: new Error(typeof reason === "string" ? reason : "Unhandled rejection");
			safeCapture(err);
		});
	}

	if (merged.captureNavigation && typeof history !== "undefined") {
		hookHistory();
	}
}

export function captureError(error: Error | unknown, options: CaptureOptions = {}): void {
	if (!state || !state.options.enabled) return;
	const err = error instanceof Error ? error : new Error(String(error));
	safeCapture(err, options);
}

export function captureMessage(message: string, options: CaptureOptions = {}): void {
	if (!state || !state.options.enabled) return;
	safeCapture(message, { severity: "info", ...options });
}

export function addBreadcrumb(crumb: Omit<Breadcrumb, "timestamp"> & { timestamp?: string }): void {
	if (!state) return;
	const full: Breadcrumb = {
		timestamp: crumb.timestamp ?? new Date().toISOString(),
		category: crumb.category,
		message: crumb.message,
		level: crumb.level,
		data: crumb.data,
	};
	state.breadcrumbs.push(full);
	if (state.breadcrumbs.length > state.options.maxBreadcrumbs) {
		state.breadcrumbs.splice(0, state.breadcrumbs.length - state.options.maxBreadcrumbs);
	}
}

export function clearBreadcrumbs(): void {
	if (!state) return;
	state.breadcrumbs = [];
}

// ─── Internals ──────────────────────────────────────────────────────────────

function safeCapture(error: Error | string, options: CaptureOptions = {}): void {
	if (!state) return;
	try {
		if (Math.random() > state.options.sampleRate) return;

		const event = buildPayload(
			error,
			{
				projectId: state.options.projectId,
				projectName: state.options.projectName,
				tenantId: state.options.tenantId,
				environment: state.options.environment,
				appVersion: state.options.appVersion,
				defaultSource: "web",
				defaultTags: state.options.defaultTags,
			},
			options,
		);

		event.breadcrumbs = state.breadcrumbs.slice();
		event.runtime = collectRuntime();

		state.queue.enqueue(event);
	} catch (caught) {
		debug("captureError failed", caught);
	}
}

async function sendEvent(event: EventPayload, options: InternalState["options"]): Promise<void> {
	let outgoing: EventPayload | null = event;
	if (options.beforeSend) {
		try {
			outgoing = (await options.beforeSend(event)) ?? null;
		} catch (e) {
			debug("beforeSend threw", e);
			outgoing = event;
		}
	}
	if (!outgoing) return;

	const headers: Record<string, string> = {
		"content-type": "application/json",
		"x-feedbakkr-tool-source": "errors-web",
	};
	if (options.apiKey) headers["x-feedbakkr-tool-key"] = options.apiKey;

	try {
		await fetch(options.endpoint, {
			method: "POST",
			headers,
			body: JSON.stringify(outgoing),
			keepalive: true,
		});
	} catch (e) {
		debug("send failed", e);
	}
}

function collectRuntime() {
	if (typeof navigator === "undefined") return undefined;
	return {
		userAgent: navigator.userAgent,
	};
}

function hookHistory(): void {
	const original = {
		pushState: history.pushState.bind(history),
		replaceState: history.replaceState.bind(history),
	};
	history.pushState = (data: unknown, unused: string, url?: string | URL | null) => {
		original.pushState(data, unused, url);
		addBreadcrumb({ category: "navigation", message: `pushState ${url ?? ""}` });
	};
	history.replaceState = (data: unknown, unused: string, url?: string | URL | null) => {
		original.replaceState(data, unused, url);
		addBreadcrumb({ category: "navigation", message: `replaceState ${url ?? ""}` });
	};
	window.addEventListener("popstate", () => {
		addBreadcrumb({ category: "navigation", message: `popstate ${location.pathname}` });
	});
}

function debug(...args: unknown[]): void {
	if (state?.options.debug) {
		// biome-ignore lint/suspicious/noConsole: debug-only path, gated on debug flag
		console.debug("[feedbakkr-errors]", ...args);
	}
}
