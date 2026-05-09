// ─── Tool manifest ──────────────────────────────────────────────────────────
//
// Served by every tool worker at GET /.well-known/feedbakkr-tool.json. The
// Feedbakkr dashboard reads this once when a project connects to a tool and
// uses it to decide which UI to render and what filter/action options to show.

export type ToolType = "errors" | "analytics" | "insights" | "uptime" | (string & {});

export interface ToolManifest {
	toolId: string;
	name: string;
	version: string;
	description?: string;
	capabilities: string[];
	supportedSources: string[];
	reports: ToolReportDescriptor[];
	actions: ToolActionDescriptor[];
	configSchema?: ToolConfigSchema;
	notificationEvents: ToolNotificationEvent[];
}

export interface ToolReportDescriptor {
	id: string;
	name: string;
	description?: string;
	uiComponent: string;
	defaultSort?: string;
	supportedFilters: string[];
	supportedSorts: string[];
}

export interface ToolActionDescriptor {
	id: string;
	name: string;
	description?: string;
	method: "POST" | "DELETE" | "PATCH";
	path: string;
	severity?: "neutral" | "destructive";
	confirmationRequired?: boolean;
}

export interface ToolConfigSchema {
	fields: ToolConfigField[];
}

export interface ToolConfigField {
	key: string;
	label: string;
	description?: string;
	type: "string" | "boolean" | "number" | "select";
	required?: boolean;
	defaultValue?: unknown;
	options?: { value: string; label: string }[];
}

export interface ToolNotificationEvent {
	id: string;
	name: string;
	description?: string;
	defaultEnabled: boolean;
}

// ─── Tool connection (Feedbakkr-side) ───────────────────────────────────────
//
// Stored by the Feedbakkr app per (project, tool). The tool worker doesn't
// know about ToolConnection; it's a Feedbakkr-side concept used to route
// requests and hold per-project config.

export type ToolMode = "self_hosted" | "managed";
export type ToolConnectionStatus = "active" | "disabled" | "error" | "pending";

export interface ToolConnection {
	id: string;
	projectId: string;
	toolType: ToolType;
	mode: ToolMode;
	apiBaseUrl: string;
	status: ToolConnectionStatus;
	config?: Record<string, unknown>;
	createdAt: string;
	updatedAt: string;
}

// ─── Health response ────────────────────────────────────────────────────────

export interface ToolHealthResponse {
	ok: boolean;
	version: string;
	uptime?: number;
	checks: {
		db?: "ok" | "degraded" | "down";
		[key: string]: "ok" | "degraded" | "down" | undefined;
	};
}

// ─── Report response envelope ───────────────────────────────────────────────
//
// All list-shaped tool endpoints return data wrapped in this shape. `display`
// lets the tool advertise UI hints (column order, severity colours, etc.)
// without the dashboard having to hardcode them per tool.

export interface ToolReportResponse<T> {
	data: T[];
	filters?: ToolFilterMeta[];
	sorts?: ToolSortMeta[];
	actions?: ToolActionDescriptor[];
	pagination?: ToolPagination;
	display?: ToolDisplayMeta;
}

export interface ToolFilterMeta {
	key: string;
	label: string;
	type: "select" | "string" | "date_range" | "multi_select";
	options?: { value: string; label: string }[];
}

export interface ToolSortMeta {
	key: string;
	label: string;
	direction: "asc" | "desc";
}

export interface ToolPagination {
	page: number;
	pageSize: number;
	total: number;
	hasMore: boolean;
}

export interface ToolDisplayMeta {
	title?: string;
	description?: string;
	emptyState?: { title: string; description?: string };
	colorMap?: Record<string, string>;
}

// ─── Standard error shape ───────────────────────────────────────────────────

export interface ToolApiError {
	error: {
		code: string;
		message: string;
		details?: unknown;
	};
}

// ─── Watch project stats (dashboard rollup) ─────────────────────────────────
//
// Rolled-up counts per (tenant, project, environment), backed by the worker's
// `error_project_stats` table and exposed at GET /v1/reports/projects.

export interface WatchProjectStats {
	tenantId: string;
	projectId: string;
	environment: string;
	openCount: number;
	resolvedCount: number;
	ignoredCount: number;
	totalGroups: number;
	totalOccurrences: number;
	lastOccurrenceAt: string | null;
	lastNewGroupAt: string | null;
	lastResolvedAt: string | null;
	updatedAt: string;
}

// ─── Watch outbound notification payload ────────────────────────────────────
//
// Posted by the worker to FEEDBAKKR_NOTIFY_URL when configured. Receiving
// systems (e.g. the Feedbakkr dashboard) validate the bearer key and channel
// id, then render a message linking back to the group.

export type WatchNotificationEventType = "new_group" | "status_changed";

export interface WatchNotificationGroupSummary {
	id: string;
	tenantId: string;
	projectId: string;
	environment: string;
	source: string;
	severity: string;
	status: "open" | "resolved" | "ignored";
	title: string;
	occurrenceCount: number;
	firstSeenAt: string;
	lastSeenAt: string;
}

export interface WatchNotificationPayload {
	event: WatchNotificationEventType;
	channelId: string;
	group: WatchNotificationGroupSummary;
	previousStatus?: "open" | "resolved" | "ignored";
}
