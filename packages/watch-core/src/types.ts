export const ERROR_SEVERITIES = ["debug", "info", "warning", "error", "fatal"] as const;
export type ErrorSeverity = (typeof ERROR_SEVERITIES)[number];

export const ERROR_SOURCES = ["web", "api", "worker", "mobile", "cli", "other"] as const;
export type ErrorSource = (typeof ERROR_SOURCES)[number];

export interface Breadcrumb {
	timestamp: string;
	category: string;
	message: string;
	level?: ErrorSeverity;
	data?: Record<string, unknown>;
}

export type Tags = Record<string, string | number | boolean>;

export interface RuntimeContext {
	browser?: string;
	browserVersion?: string;
	os?: string;
	osVersion?: string;
	runtime?: string;
	runtimeVersion?: string;
	userAgent?: string;
}

export interface RequestContext {
	route?: string;
	method?: string;
	statusCode?: number;
	requestId?: string;
}

export interface UserContext {
	idHash?: string;
	sessionId?: string;
}

/**
 * Browser environment snapshot taken at the moment the error fired.
 * Distinct from `runtime` (UA-derived "what's running") because these are
 * dynamic — viewport changes per resize, connection per network, etc.
 * Captured by the web SDK only when `consent.technical` is on.
 */
export interface WebContext {
	viewport?: { width: number; height: number };
	screen?: { width: number; height: number };
	devicePixelRatio?: number;
	colorScheme?: "light" | "dark" | "no-preference";
	reducedMotion?: boolean;
	connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean };
	online?: boolean;
	visibilityState?: "visible" | "hidden" | "prerender" | "unloaded";
	language?: string;
	timezone?: string;
	deviceMemory?: number;
	hardwareConcurrency?: number;
}

/**
 * Last user-driven action before the error. Helps reproduce "click → error"
 * sequences when stack alone doesn't point at the trigger. Behavioural
 * consent only — represents real user activity.
 */
export interface LastUserAction {
	kind: "click" | "input" | "navigation" | "keydown";
	at: string;
	target?: string; // CSS selector hint (tag + first id/class)
	label?: string; // aria-label, button text, or input name
	route?: string; // current pathname at the time
}

/**
 * Recent non-2xx fetch responses captured before the error fired. A failing
 * upstream is often the smoking gun for a downstream throw. Captured when
 * `consent.behavioural` is on.
 */
export interface FetchHistoryEntry {
	at: string;
	method: string;
	url: string;
	status: number;
	durationMs?: number;
}

/**
 * One link in an error's cause chain (`error.cause`). The web/node SDKs walk
 * the chain so root causes aren't buried inside a re-thrown wrapper.
 */
export interface CauseChainEntry {
	errorName?: string;
	message: string;
	stack?: string;
}

export interface EventPayload {
	source: ErrorSource;
	severity: ErrorSeverity;
	environment: string;
	appVersion?: string;
	timestamp: string;
	tenantId?: string;
	projectId: string;
	projectName?: string;

	errorName?: string;
	message: string;
	stack?: string;

	fingerprint?: string;

	breadcrumbs?: Breadcrumb[];
	tags?: Tags;
	context?: Record<string, unknown>;

	request?: RequestContext;
	runtime?: RuntimeContext;
	user?: UserContext;

	/** Web SDK only, gated on `consent.technical`. */
	webContext?: WebContext;
	/** Web SDK only, gated on `consent.behavioural`. */
	lastAction?: LastUserAction;
	/** Web SDK only, gated on `consent.behavioural`. */
	fetchHistory?: FetchHistoryEntry[];
	/** Both SDKs. Always on — part of the necessary error data. */
	causes?: CauseChainEntry[];

	/**
	 * When true, the worker folds `request.route` into the fingerprint so
	 * the same error at different URLs becomes distinct groups. Set by the
	 * SDK from the `groupByUrl` init option.
	 */
	groupByUrl?: boolean;
}

export interface CaptureOptions {
	severity?: ErrorSeverity;
	tags?: Tags;
	context?: Record<string, unknown>;
	fingerprint?: string;
	source?: ErrorSource;
	route?: string;
	method?: string;
	statusCode?: number;
	requestId?: string;
}

export interface IngestResponse {
	ok: true;
	groupId: string;
	occurrenceId: string;
	fingerprint: string;
	isNewGroup: boolean;
	wasResolved?: boolean;
}
