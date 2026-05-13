import type { ToolReportResponse, WatchProjectStats } from "@feedbakkr/watch-types";

// ─── Domain types (mirror the worker's response shapes) ─────────────────────

export type ErrorGroupStatus = "open" | "resolved" | "ignored";

export interface ErrorGroup {
	id: string;
	tenantId: string;
	projectId: string;
	projectName: string | null;
	environment: string;
	source: string;
	severity: string;
	fingerprint: string;
	title: string;
	status: ErrorGroupStatus;
	firstSeenAt: string;
	lastSeenAt: string;
	occurrenceCount: number;
	affectedUsersCount: number;
	affectedSessionsCount: number;
	lastOccurrenceId: string | null;
	commentCount: number;
}

export interface ErrorGroupComment {
	id: string;
	groupId: string;
	authorName: string;
	message: string;
	createdAt: string;
}

export interface ListGroupCommentsResponse {
	data: ErrorGroupComment[];
}

export interface AddGroupCommentParams {
	authorName: string;
	message: string;
}

export interface ErrorOccurrence {
	id: string;
	groupId: string;
	tenantId: string;
	projectId: string;
	projectName: string | null;
	occurredAt: string;
	source: string;
	severity: string;
	environment: string;
	requestId?: string;
	sessionId?: string;
	userIdHash?: string;
	route?: string;
	method?: string;
	statusCode?: number;
	browser?: string;
	os?: string;
	runtime?: string;
	appVersion?: string;
	errorName?: string;
	message: string;
	stack?: string;
	breadcrumbs?: unknown[];
	tags?: Record<string, unknown>;
	context?: Record<string, unknown>;
}

export interface ErrorOverview {
	openGroups: number;
	newGroupsLast24h: number;
	occurrencesLast24h: number;
	bySeverity: Record<string, number>;
	bySource: Record<string, number>;
}

export interface ListGroupsParams {
	tenantId?: string;
	projectId?: string;
	environment?: string;
	source?: string;
	severity?: string;
	status?: ErrorGroupStatus;
	from?: string;
	to?: string;
	page?: number;
	pageSize?: number;
	sort?: string;
}

export type ProjectStats = WatchProjectStats;

export interface ProjectStatsResponse {
	data: ProjectStats[];
}

// ─── Client interface (Feedbakkr injects an implementation) ─────────────────

export interface ToolApiClient {
	listGroups(params: ListGroupsParams): Promise<ToolReportResponse<ErrorGroup>>;
	getGroup(groupId: string): Promise<ErrorGroup>;
	listOccurrences(
		groupId: string,
		params: { page?: number; pageSize?: number },
	): Promise<ToolReportResponse<ErrorOccurrence>>;
	getOccurrence(occurrenceId: string): Promise<ErrorOccurrence>;
	resolveGroup(groupId: string): Promise<ErrorGroup>;
	ignoreGroup(groupId: string): Promise<ErrorGroup>;
	reopenGroup(groupId: string): Promise<ErrorGroup>;
	deleteGroup(groupId: string): Promise<{ ok: true }>;
	listComments(groupId: string): Promise<ListGroupCommentsResponse>;
	addComment(groupId: string, params: AddGroupCommentParams): Promise<ErrorGroupComment>;
	deleteComment(commentId: string): Promise<{ ok: true }>;
	getOverview(params: {
		tenantId?: string;
		projectId?: string;
		environment?: string;
	}): Promise<ErrorOverview>;
	listProjectStats(params?: { tenantId?: string }): Promise<ProjectStatsResponse>;
	getProjectStats(projectId: string, params?: { tenantId?: string }): Promise<ProjectStatsResponse>;
}

// ─── Reference impl for self-hosted use ─────────────────────────────────────
//
// The dashboard typically wraps its own auth in front, so consumers usually
// pass their own client. This helper exists so a repo trying out errors-ui
// can wire up to a worker quickly.

export interface CreateBrowserApiClientOptions {
	baseUrl: string;
	getKey?: () => string | Promise<string>;
	fetchImpl?: typeof fetch;
}

export function createBrowserApiClient(options: CreateBrowserApiClientOptions): ToolApiClient {
	const fetchImpl = options.fetchImpl ?? fetch;

	async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
		const headers: Record<string, string> = {
			"content-type": "application/json",
			...((init.headers as Record<string, string>) ?? {}),
		};
		if (options.getKey) {
			const key = await options.getKey();
			if (key) headers["x-feedbakkr-tool-key"] = key;
		}
		const res = await fetchImpl(`${options.baseUrl}${path}`, { ...init, headers });
		if (!res.ok) {
			const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
			throw new Error(
				typeof body.error === "object" && body.error
					? `${(body.error as { code?: string }).code ?? "ERROR"}: ${
							(body.error as { message?: string }).message ?? res.statusText
						}`
					: `HTTP ${res.status}`,
			);
		}
		return (await res.json()) as T;
	}

	function qs(params: Record<string, unknown>): string {
		const entries = Object.entries(params).filter(
			([, v]) => v !== undefined && v !== null && v !== "",
		);
		if (!entries.length) return "";
		const sp = new URLSearchParams();
		for (const [k, v] of entries) sp.set(k, String(v));
		return `?${sp.toString()}`;
	}

	return {
		listGroups(params) {
			return call(`/v1/groups${qs(params as Record<string, unknown>)}`);
		},
		getGroup(groupId) {
			return call(`/v1/groups/${encodeURIComponent(groupId)}`);
		},
		listOccurrences(groupId, params) {
			return call(
				`/v1/groups/${encodeURIComponent(groupId)}/occurrences${qs(params as Record<string, unknown>)}`,
			);
		},
		getOccurrence(occurrenceId) {
			return call(`/v1/occurrences/${encodeURIComponent(occurrenceId)}`);
		},
		resolveGroup(groupId) {
			return call(`/v1/groups/${encodeURIComponent(groupId)}/resolve`, { method: "POST" });
		},
		ignoreGroup(groupId) {
			return call(`/v1/groups/${encodeURIComponent(groupId)}/ignore`, { method: "POST" });
		},
		reopenGroup(groupId) {
			return call(`/v1/groups/${encodeURIComponent(groupId)}/reopen`, { method: "POST" });
		},
		deleteGroup(groupId) {
			return call(`/v1/groups/${encodeURIComponent(groupId)}`, { method: "DELETE" });
		},
		listComments(groupId) {
			return call(`/v1/groups/${encodeURIComponent(groupId)}/comments`);
		},
		addComment(groupId, params) {
			return call(`/v1/groups/${encodeURIComponent(groupId)}/comments`, {
				method: "POST",
				body: JSON.stringify(params),
			});
		},
		deleteComment(commentId) {
			return call(`/v1/comments/${encodeURIComponent(commentId)}`, { method: "DELETE" });
		},
		getOverview(params) {
			return call(`/v1/reports/overview${qs(params as Record<string, unknown>)}`);
		},
		listProjectStats(params) {
			return call(`/v1/reports/projects${qs((params ?? {}) as Record<string, unknown>)}`);
		},
		getProjectStats(projectId, params) {
			return call(
				`/v1/reports/projects/${encodeURIComponent(projectId)}${qs(
					(params ?? {}) as Record<string, unknown>,
				)}`,
			);
		},
	};
}
