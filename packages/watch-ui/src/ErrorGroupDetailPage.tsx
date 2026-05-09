import { useEffect, useState } from "react";
import type { ErrorGroup, ErrorOccurrence, ToolApiClient } from "./api-client.js";
import {
	ErrorOccurrenceList,
	ErrorSeverityBadge,
	ErrorStackTrace,
	ErrorStatusBadge,
} from "./components.js";

export interface ErrorGroupDetailPageProps {
	groupId: string;
	apiClient: ToolApiClient;
	onBack?: () => void;
}

export function ErrorGroupDetailPage({ groupId, apiClient, onBack }: ErrorGroupDetailPageProps) {
	const [group, setGroup] = useState<ErrorGroup | null>(null);
	const [occurrences, setOccurrences] = useState<ErrorOccurrence[]>([]);
	const [latest, setLatest] = useState<ErrorOccurrence | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setError(null);
		Promise.all([
			apiClient.getGroup(groupId),
			apiClient.listOccurrences(groupId, { page: 1, pageSize: 25 }),
		])
			.then(([g, occ]) => {
				if (cancelled) return;
				setGroup(g);
				setOccurrences(occ.data);
				setLatest(occ.data[0] ?? null);
			})
			.catch((e) => {
				if (!cancelled) setError(String(e));
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [apiClient, groupId]);

	async function act(action: "resolve" | "ignore" | "reopen"): Promise<void> {
		if (!group) return;
		const next =
			action === "resolve"
				? await apiClient.resolveGroup(group.id)
				: action === "ignore"
					? await apiClient.ignoreGroup(group.id)
					: await apiClient.reopenGroup(group.id);
		setGroup(next);
	}

	if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
	if (error) return <p className="text-sm text-rose-600">{error}</p>;
	if (!group) return <p className="text-sm text-slate-500">Group not found.</p>;

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					{onBack && (
						<button
							type="button"
							onClick={onBack}
							className="text-sm text-slate-600 hover:underline"
						>
							← Back
						</button>
					)}
					<h1 className="text-lg font-semibold text-slate-900">{group.title}</h1>
					<ErrorSeverityBadge severity={group.severity} />
					<ErrorStatusBadge status={group.status} />
				</div>
				<div className="flex gap-2">
					{group.status !== "resolved" && (
						<button
							type="button"
							onClick={() => void act("resolve")}
							className="rounded bg-emerald-600 px-3 py-1 text-sm text-white hover:bg-emerald-700"
						>
							Resolve
						</button>
					)}
					{group.status !== "ignored" && (
						<button
							type="button"
							onClick={() => void act("ignore")}
							className="rounded bg-slate-100 px-3 py-1 text-sm text-slate-700 hover:bg-slate-200"
						>
							Ignore
						</button>
					)}
					{group.status !== "open" && (
						<button
							type="button"
							onClick={() => void act("reopen")}
							className="rounded bg-rose-600 px-3 py-1 text-sm text-white hover:bg-rose-700"
						>
							Reopen
						</button>
					)}
				</div>
			</div>

			<dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-4">
				<dt className="text-slate-500">First seen</dt>
				<dd>{new Date(group.firstSeenAt).toLocaleString()}</dd>
				<dt className="text-slate-500">Last seen</dt>
				<dd>{new Date(group.lastSeenAt).toLocaleString()}</dd>
				<dt className="text-slate-500">Occurrences</dt>
				<dd>{group.occurrenceCount}</dd>
				<dt className="text-slate-500">Affected users</dt>
				<dd>{group.affectedUsersCount}</dd>
			</dl>

			{latest && (
				<section className="space-y-2">
					<h2 className="text-sm font-medium text-slate-700">Latest occurrence</h2>
					<ErrorStackTrace stack={latest.stack} />
				</section>
			)}

			<section className="space-y-2">
				<h2 className="text-sm font-medium text-slate-700">Recent occurrences</h2>
				<ErrorOccurrenceList occurrences={occurrences} />
			</section>
		</div>
	);
}
