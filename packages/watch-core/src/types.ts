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

export interface EventPayload {
	source: ErrorSource;
	severity: ErrorSeverity;
	environment: string;
	appVersion?: string;
	timestamp: string;
	tenantId?: string;
	projectId: string;

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
}
