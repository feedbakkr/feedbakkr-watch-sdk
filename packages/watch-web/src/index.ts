import {
	AsyncQueue,
	type Breadcrumb,
	buildPayload,
	type CaptureOptions,
	type CauseChainEntry,
	type ConsentSettings,
	DEFAULT_CONSENT,
	type EventPayload,
	type FetchHistoryEntry,
	type LastUserAction,
	mergeConsent,
	type Tags,
	walkCauses,
	type WebContext,
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
	/**
	 * Initial consent state. Defaults to both buckets OFF — the SDK still
	 * sends the necessary error data (message, stack, etc) but skips the
	 * environment snapshot and behavioural captures until the host app
	 * flips them on (typically after a cookie banner accept).
	 */
	consent?: Partial<ConsentSettings>;
	/**
	 * URL the error happened at. Used as `request.route` when the caller
	 * hasn't passed one per-capture. Pass a function for SPAs that update
	 * the URL via history.pushState. Defaults to `window.location.pathname`
	 * (no query, no hash) when omitted and `window` is available.
	 */
	url?: string | (() => string | null | undefined);
	/**
	 * When true, the worker folds the resolved URL into the fingerprint
	 * so the same error at different pages becomes distinct groups.
	 */
	groupByUrl?: boolean;
	beforeSend?: (event: EventPayload) => EventPayload | null | Promise<EventPayload | null>;
}

const FETCH_HISTORY_MAX = 5;

interface InternalState {
	options: Required<
		Omit<
			InitOptions,
			| "appVersion"
			| "apiKey"
			| "tenantId"
			| "projectName"
			| "defaultTags"
			| "beforeSend"
			| "consent"
			| "url"
		>
	> & {
		appVersion?: string;
		apiKey?: string;
		tenantId?: string;
		projectName?: string;
		defaultTags?: Tags;
		beforeSend?: InitOptions["beforeSend"];
		url?: InitOptions["url"];
	};
	consent: ConsentSettings;
	breadcrumbs: Breadcrumb[];
	lastAction: LastUserAction | null;
	fetchHistory: FetchHistoryEntry[];
	queue: AsyncQueue<EventPayload>;
}

let state: InternalState | null = null;

// Module-level guards so re-init (Vite HMR rerunning the app entry, or a
// host that calls initFeedbakkrErrors more than once) doesn't stack
// listeners forever. Without these guards every save during dev would add
// another fetch wrapper / click listener / unhandled-error handler — they
// leak memory and the host process eventually gets SIGTERMed.
let windowListenersInstalled = false;
let fetchPatched = false;
let historyPatched = false;
let clicksHooked = false;

export function initFeedbakkrErrors(options: InitOptions): void {
	// Endpoint scheme guard. The endpoint is whatever the host passes — a
	// misconfigured staging bundle hard-coded to `http://malicious.example`
	// would silently exfiltrate every captured event (URLs, user agents,
	// breadcrumbs) over plaintext. Reject anything that isn't `https://`
	// unless the caller explicitly opted into `debug: true` (local dev).
	if (typeof options.endpoint === "string" && options.endpoint.length > 0) {
		try {
			const url = new URL(options.endpoint);
			if (url.protocol !== "https:" && !options.debug) {
				console.warn(
					"[feedbakkr-watch] endpoint is not https — refusing to initialise. Set debug:true to bypass for local development.",
				);
				return;
			}
		} catch {
			console.warn("[feedbakkr-watch] endpoint is not a valid URL — refusing to initialise.");
			return;
		}
	}

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
		groupByUrl: options.groupByUrl ?? false,
		defaultTags: options.defaultTags,
		beforeSend: options.beforeSend,
		url: options.url,
	};

	state = {
		options: merged,
		consent: mergeConsent(DEFAULT_CONSENT, options.consent ?? {}),
		breadcrumbs: [],
		lastAction: null,
		fetchHistory: [],
		queue: new AsyncQueue<EventPayload>(async (event) => {
			await sendEvent(event, merged);
		}),
	};

	if (typeof window === "undefined") return;

	// Each window-level listener is installed exactly once per page. The
	// handler closes over `state` (a module-level binding) so any subsequent
	// init that swaps `state` is picked up automatically — no need to
	// re-attach a fresh handler with a new closure.
	if (!windowListenersInstalled) {
		windowListenersInstalled = true;
		window.addEventListener("error", (e) => {
			if (!state?.options.captureUnhandledErrors) return;
			const err = e.error instanceof Error ? e.error : new Error(e.message || "Unhandled error");
			safeCapture(err);
		});
		window.addEventListener("unhandledrejection", (e) => {
			if (!state?.options.captureUnhandledRejections) return;
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

	// Behavioural captures (click + fetch ring buffers) install their
	// listeners regardless of consent — gating happens at payload-build
	// time. This keeps the runtime tax of a consent flip near zero (no
	// late-install dance) and lets us record buffers from the moment
	// consent flips on, not from boot.
	hookClicks();
	hookFetch();
}

/**
 * Update consent at runtime — e.g. after a cookie banner accept. Buckets
 * left out of `patch` keep their current value. Takes effect on the next
 * capture; in-flight events are unaffected.
 */
export function setConsent(patch: Partial<ConsentSettings>): void {
	if (!state) return;
	state.consent = mergeConsent(state.consent, patch);
}

export function getConsent(): ConsentSettings {
	return state ? { ...state.consent } : { ...DEFAULT_CONSENT };
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

		const resolvedRoute = options.route ?? resolveCurrentUrl(state.options.url);
		const captureOptions: CaptureOptions = resolvedRoute
			? { ...options, route: resolvedRoute }
			: options;

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
			captureOptions,
		);

		event.runtime = collectRuntime();

		// Necessary bucket — always attached.
		if (error instanceof Error) {
			const causes = walkCauses(error);
			if (causes.length > 0) event.causes = causes;
		}

		// Technical bucket.
		if (state.consent.technical) {
			const ctx = collectWebContext();
			if (ctx) event.webContext = ctx;
		}

		// Behavioural bucket — breadcrumbs, last action, fetch history.
		if (state.consent.behavioural) {
			if (state.breadcrumbs.length > 0) event.breadcrumbs = state.breadcrumbs.slice();
			if (state.lastAction) event.lastAction = state.lastAction;
			if (state.fetchHistory.length > 0) event.fetchHistory = state.fetchHistory.slice();
		}

		if (state.options.groupByUrl && event.request?.route) {
			event.groupByUrl = true;
		}

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

/**
 * Best-effort environment snapshot. Each field is guarded individually
 * because non-standard APIs (`navigator.connection`, `deviceMemory`)
 * aren't in every browser, and the test runner may not expose `window`.
 */
function collectWebContext(): WebContext | undefined {
	if (typeof window === "undefined") return undefined;
	const ctx: WebContext = {};
	try {
		if (typeof window.innerWidth === "number") {
			ctx.viewport = { width: window.innerWidth, height: window.innerHeight };
		}
		if (typeof window.screen?.width === "number") {
			ctx.screen = { width: window.screen.width, height: window.screen.height };
		}
		if (typeof window.devicePixelRatio === "number") {
			ctx.devicePixelRatio = window.devicePixelRatio;
		}
		if (typeof window.matchMedia === "function") {
			const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
			const light = window.matchMedia("(prefers-color-scheme: light)").matches;
			ctx.colorScheme = dark ? "dark" : light ? "light" : "no-preference";
			ctx.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		}
		const conn = (navigator as unknown as { connection?: WebContext["connection"] }).connection;
		if (conn) ctx.connection = { ...conn };
		if (typeof navigator.onLine === "boolean") ctx.online = navigator.onLine;
		if (typeof document !== "undefined" && document.visibilityState) {
			ctx.visibilityState = document.visibilityState;
		}
		if (typeof navigator.language === "string") ctx.language = navigator.language;
		try {
			ctx.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		} catch {
			// Intl missing in some embedded contexts — ignore.
		}
		const deviceMemory = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
		if (typeof deviceMemory === "number") ctx.deviceMemory = deviceMemory;
		if (typeof navigator.hardwareConcurrency === "number") {
			ctx.hardwareConcurrency = navigator.hardwareConcurrency;
		}
	} catch {
		// Belt-and-braces: if anything weird happens, just ship what we have.
	}
	return Object.keys(ctx).length > 0 ? ctx : undefined;
}

/**
 * Resolve a URL string to put on `request.route`. Strips query + hash so
 * tokens / session ids in query params never leave the page.
 *
 *   1. Explicit `url` from init (string or function) wins.
 *   2. `window.location.pathname` as the auto-default in browsers.
 *   3. `undefined` when neither is available (SSR, tests).
 */
function resolveCurrentUrl(source: InitOptions["url"]): string | undefined {
	try {
		if (typeof source === "function") {
			const v = source();
			return typeof v === "string" && v.length > 0 ? scrubUrl(v) : undefined;
		}
		if (typeof source === "string" && source.length > 0) {
			return scrubUrl(source);
		}
		if (typeof window !== "undefined" && window.location?.pathname) {
			return window.location.pathname;
		}
	} catch {
		// Fall through to undefined.
	}
	return undefined;
}

function scrubUrl(value: string): string {
	// If it parses as an absolute URL, keep host + pathname only. Otherwise
	// strip everything after the first `?` or `#` — common for SPA route
	// strings like "/users/123?ref=foo#about".
	try {
		const u = new URL(value);
		return `${u.origin}${u.pathname}`;
	} catch {
		const q = value.indexOf("?");
		const h = value.indexOf("#");
		const cut = [q, h].filter((i) => i >= 0).reduce((a, b) => Math.min(a, b), value.length);
		return value.slice(0, cut);
	}
}

function hookHistory(): void {
	if (historyPatched) return;
	historyPatched = true;
	const original = {
		pushState: history.pushState.bind(history),
		replaceState: history.replaceState.bind(history),
	};
	history.pushState = (data: unknown, unused: string, url?: string | URL | null) => {
		original.pushState(data, unused, url);
		recordNavigation(url);
	};
	history.replaceState = (data: unknown, unused: string, url?: string | URL | null) => {
		original.replaceState(data, unused, url);
		recordNavigation(url);
	};
	window.addEventListener("popstate", () => {
		recordNavigation(location.pathname);
	});
}

function recordNavigation(url: string | URL | null | undefined): void {
	if (!state) return;
	const route = url ? scrubUrl(String(url)) : location.pathname;
	addBreadcrumb({ category: "navigation", message: route });
	state.lastAction = {
		kind: "navigation",
		at: new Date().toISOString(),
		route,
	};
}

/**
 * Click capture for the lastAction ring slot. Listens at capture phase so
 * a stopped-propagation click in app code doesn't hide it from us. We
 * record a CSS-selector hint + the most user-meaningful label we can find
 * (aria-label > textContent > input name) — no values, no PII fields.
 */
function hookClicks(): void {
	if (clicksHooked) return;
	if (typeof document === "undefined") return;
	clicksHooked = true;
	document.addEventListener(
		"click",
		(e) => {
			if (!state) return;
			const t = e.target;
			if (!(t instanceof Element)) return;
			state.lastAction = {
				kind: "click",
				at: new Date().toISOString(),
				target: selectorHint(t),
				label: labelOf(t),
				route: typeof location !== "undefined" ? location.pathname : undefined,
			};
		},
		{ capture: true, passive: true },
	);
}

function selectorHint(el: Element): string {
	const tag = el.tagName.toLowerCase();
	if (el.id) return `${tag}#${el.id}`;
	const cls = (el.getAttribute("class") ?? "").trim().split(/\s+/).filter(Boolean);
	if (cls.length > 0) return `${tag}.${cls[0]}`;
	return tag;
}

function labelOf(el: Element): string | undefined {
	const aria = el.getAttribute("aria-label");
	if (aria) return truncate(aria, 80);
	const role = el.getAttribute("role");
	if (role === "button" || el.tagName === "BUTTON" || el.tagName === "A") {
		const text = (el.textContent ?? "").trim().replace(/\s+/g, " ");
		if (text) return truncate(text, 80);
	}
	if (el instanceof HTMLInputElement) {
		// Field NAME only, never the value — fields can hold passwords / PII.
		if (el.name) return `[name=${el.name}]`;
		if (el.type) return `[type=${el.type}]`;
	}
	return undefined;
}

function truncate(s: string, max: number): string {
	return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * Patch global fetch to record a ring buffer of recent NON-2xx responses.
 * Successful responses aren't worth the memory — if they're failures the
 * error handler usually wants to know what blew up. URL is scrubbed of
 * query + hash so credentials in URLs don't leak into the payload.
 */
function hookFetch(): void {
	if (fetchPatched) return;
	if (typeof globalThis.fetch !== "function") return;
	fetchPatched = true;
	const original = globalThis.fetch.bind(globalThis);
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const startedAt = Date.now();
		const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
		const rawUrl =
			typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
		const url = scrubUrl(rawUrl);
		try {
			const res = await original(input as Request, init);
			if (!res.ok && state) {
				recordFetch({
					at: new Date().toISOString(),
					method,
					url,
					status: res.status,
					durationMs: Date.now() - startedAt,
				});
			}
			return res;
		} catch (err) {
			if (state) {
				recordFetch({
					at: new Date().toISOString(),
					method,
					url,
					// Conventionally 0 means "the network request failed before a
					// response could be parsed" — same shape Chrome uses in
					// devtools when the network fails.
					status: 0,
					durationMs: Date.now() - startedAt,
				});
			}
			throw err;
		}
	}) as typeof fetch;
}

function recordFetch(entry: FetchHistoryEntry): void {
	if (!state) return;
	state.fetchHistory.push(entry);
	if (state.fetchHistory.length > FETCH_HISTORY_MAX) {
		state.fetchHistory.splice(0, state.fetchHistory.length - FETCH_HISTORY_MAX);
	}
}

function debug(...args: unknown[]): void {
	if (state?.options.debug) {
		// biome-ignore lint/suspicious/noConsole: debug-only path, gated on debug flag
		console.debug("[feedbakkr-errors]", ...args);
	}
}

// Exported for tests so they can clear module state between specs.
export function __resetForTests(): void {
	state = null;
	windowListenersInstalled = false;
	fetchPatched = false;
	historyPatched = false;
	clicksHooked = false;
}

// Re-export the cause-chain type so consumers don't have to dual-import
// from watch-core just to type a beforeSend hook.
export type { CauseChainEntry, ConsentSettings, FetchHistoryEntry, LastUserAction, WebContext };
