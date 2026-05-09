import { useEffect, useState } from "react";
import type { ErrorGroup, ToolApiClient } from "./api-client.js";
import { ErrorFilters, type ErrorFiltersValue, ErrorGroupRow } from "./components.js";

export interface ErrorGroupsPageProps {
	projectId: string;
	connectionId: string;
	apiClient: ToolApiClient;
	initialFilters?: ErrorFiltersValue;
	onSelectGroup?: (group: ErrorGroup) => void;
}

export function ErrorGroupsPage({
	projectId,
	apiClient,
	initialFilters,
	onSelectGroup,
}: ErrorGroupsPageProps) {
	const [filters, setFilters] = useState<ErrorFiltersValue>(initialFilters ?? {});
	const [groups, setGroups] = useState<ErrorGroup[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setError(null);
		apiClient
			.listGroups({
				projectId,
				environment: filters.environment,
				source: filters.source,
				severity: filters.severity,
				status: filters.status,
			})
			.then((res) => {
				if (cancelled) return;
				setGroups(res.data);
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
	}, [apiClient, projectId, filters.environment, filters.source, filters.severity, filters.status]);

	return (
		<div className="flex flex-col gap-4">
			<ErrorFilters value={filters} onChange={setFilters} />

			{loading ? (
				<p className="text-sm text-slate-500">Loading…</p>
			) : error ? (
				<p className="text-sm text-rose-600">{error}</p>
			) : groups.length === 0 ? (
				<p className="text-sm text-slate-500">No errors yet.</p>
			) : (
				<div>
					{groups.map((g) => (
						<ErrorGroupRow key={g.id} group={g} onSelect={onSelectGroup} />
					))}
				</div>
			)}
		</div>
	);
}
