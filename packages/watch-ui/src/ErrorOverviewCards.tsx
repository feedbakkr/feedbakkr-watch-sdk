import { useEffect, useState } from "react";
import type { ErrorOverview, ToolApiClient } from "./api-client.js";

export interface ErrorOverviewCardsProps {
	projectId?: string;
	environment?: string;
	apiClient: ToolApiClient;
}

export function ErrorOverviewCards({ projectId, environment, apiClient }: ErrorOverviewCardsProps) {
	const [data, setData] = useState<ErrorOverview | null>(null);

	useEffect(() => {
		let cancelled = false;
		apiClient.getOverview({ projectId, environment }).then((res) => {
			if (!cancelled) setData(res);
		});
		return () => {
			cancelled = true;
		};
	}, [apiClient, projectId, environment]);

	if (!data) return null;

	const cards = [
		{ label: "Open groups", value: data.openGroups },
		{ label: "New (24h)", value: data.newGroupsLast24h },
		{ label: "Occurrences (24h)", value: data.occurrencesLast24h },
	];

	return (
		<div className="grid grid-cols-3 gap-3">
			{cards.map((c) => (
				<div key={c.label} className="rounded border border-slate-200 bg-white p-4">
					<div className="text-xs uppercase tracking-wide text-slate-500">{c.label}</div>
					<div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{c.value}</div>
				</div>
			))}
		</div>
	);
}
