import type { ErrorGroup, ErrorGroupStatus, ErrorOccurrence } from "./api-client.js";

const SEVERITY_CLASS: Record<string, string> = {
	debug: "bg-slate-100 text-slate-700",
	info: "bg-sky-100 text-sky-700",
	warning: "bg-amber-100 text-amber-700",
	error: "bg-rose-100 text-rose-700",
	fatal: "bg-rose-200 text-rose-900",
};

const STATUS_CLASS: Record<ErrorGroupStatus, string> = {
	open: "bg-rose-100 text-rose-700",
	resolved: "bg-emerald-100 text-emerald-700",
	ignored: "bg-slate-100 text-slate-600",
};

export function ErrorSeverityBadge({ severity }: { severity: string }) {
	const cls = SEVERITY_CLASS[severity] ?? SEVERITY_CLASS.error;
	return (
		<span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${cls}`}>{severity}</span>
	);
}

export function ErrorStatusBadge({ status }: { status: ErrorGroupStatus }) {
	return (
		<span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status]}`}>
			{status}
		</span>
	);
}

export function ErrorStackTrace({ stack }: { stack?: string }) {
	if (!stack) return null;
	return (
		<pre className="overflow-x-auto rounded bg-slate-950 p-3 text-xs text-slate-100">
			<code>{stack}</code>
		</pre>
	);
}

export function ErrorOccurrenceList({
	occurrences,
	onSelect,
}: {
	occurrences: ErrorOccurrence[];
	onSelect?: (occ: ErrorOccurrence) => void;
}) {
	if (occurrences.length === 0) {
		return <p className="text-sm text-slate-500">No occurrences yet.</p>;
	}
	return (
		<ul className="divide-y divide-slate-200">
			{occurrences.map((occ) => (
				<li key={occ.id} className="flex items-center gap-3 py-2">
					<ErrorSeverityBadge severity={occ.severity} />
					<button
						type="button"
						onClick={() => onSelect?.(occ)}
						className="flex-1 text-left text-sm hover:underline"
					>
						<div className="font-medium text-slate-900">
							{occ.method ?? ""} {occ.route ?? "—"}
						</div>
						<div className="text-xs text-slate-500">
							{new Date(occ.occurredAt).toLocaleString()} · {occ.environment} ·{" "}
							{occ.appVersion ?? ""}
						</div>
					</button>
				</li>
			))}
		</ul>
	);
}

export function ErrorGroupRow({
	group,
	onSelect,
}: {
	group: ErrorGroup;
	onSelect?: (group: ErrorGroup) => void;
}) {
	return (
		<button
			type="button"
			onClick={() => onSelect?.(group)}
			className="flex w-full items-center gap-3 border-b border-slate-200 py-3 text-left hover:bg-slate-50"
		>
			<ErrorSeverityBadge severity={group.severity} />
			<ErrorStatusBadge status={group.status} />
			<div className="flex-1">
				<div className="text-sm font-medium text-slate-900">{group.title}</div>
				<div className="text-xs text-slate-500">
					{group.environment} · {group.source} · last seen{" "}
					{new Date(group.lastSeenAt).toLocaleString()}
				</div>
			</div>
			<div className="text-sm tabular-nums text-slate-700">{group.occurrenceCount}</div>
		</button>
	);
}

export interface ErrorFiltersValue {
	environment?: string;
	source?: string;
	severity?: string;
	status?: ErrorGroupStatus;
}

export function ErrorFilters({
	value,
	onChange,
}: {
	value: ErrorFiltersValue;
	onChange: (next: ErrorFiltersValue) => void;
}) {
	function update<K extends keyof ErrorFiltersValue>(key: K, v: ErrorFiltersValue[K]): void {
		onChange({ ...value, [key]: v || undefined });
	}
	return (
		<div className="flex flex-wrap gap-2">
			<select
				value={value.status ?? ""}
				onChange={(e) => update("status", (e.target.value || undefined) as ErrorGroupStatus)}
				className="rounded border border-slate-300 px-2 py-1 text-sm"
			>
				<option value="">All statuses</option>
				<option value="open">Open</option>
				<option value="resolved">Resolved</option>
				<option value="ignored">Ignored</option>
			</select>
			<select
				value={value.severity ?? ""}
				onChange={(e) => update("severity", e.target.value || undefined)}
				className="rounded border border-slate-300 px-2 py-1 text-sm"
			>
				<option value="">All severities</option>
				<option value="fatal">Fatal</option>
				<option value="error">Error</option>
				<option value="warning">Warning</option>
				<option value="info">Info</option>
				<option value="debug">Debug</option>
			</select>
			<select
				value={value.source ?? ""}
				onChange={(e) => update("source", e.target.value || undefined)}
				className="rounded border border-slate-300 px-2 py-1 text-sm"
			>
				<option value="">All sources</option>
				<option value="web">Web</option>
				<option value="api">API</option>
				<option value="worker">Worker</option>
				<option value="mobile">Mobile</option>
			</select>
			<input
				placeholder="Environment (e.g. production)"
				value={value.environment ?? ""}
				onChange={(e) => update("environment", e.target.value || undefined)}
				className="rounded border border-slate-300 px-2 py-1 text-sm"
			/>
		</div>
	);
}
