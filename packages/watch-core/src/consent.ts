/**
 * Three-bucket consent model used by the SDKs.
 *
 * The host app owns the decision (cookie banner, settings page, jurisdiction-
 * specific rules). The SDK is consent-aware: when a bucket is off, the
 * corresponding fields are simply omitted from the payload.
 *
 *   - `necessary` — the error itself (message, stack, errorName, severity).
 *     Always on; not represented in this type because there's nothing to
 *     toggle.
 *   - `technical` — anonymous environment snapshot: viewport, screen, dpr,
 *     connection type, visibility, language, timezone, device memory, CPU
 *     cores, colour-scheme preference, reduced-motion preference. Low PII
 *     risk in isolation; defensible under legitimate interest in most
 *     jurisdictions but still gateable so consumers in stricter regions
 *     can require explicit opt-in.
 *   - `behavioural` — breadcrumbs (clicks/console/navigation), last user
 *     action, recent failed fetches. Reflects real user activity, higher
 *     identifying risk in combination, so default off.
 *
 * Identifying fields (`user.idHash`, `user.sessionId`) are never gated by
 * this type — they only land in payloads when the host app explicitly
 * passes them via `CaptureOptions.user` or equivalent.
 */
export interface ConsentSettings {
	technical: boolean;
	behavioural: boolean;
}

export const DEFAULT_CONSENT: ConsentSettings = {
	technical: false,
	behavioural: false,
};

/** Merge a partial update into existing consent, leaving omitted keys as-is. */
export function mergeConsent(
	current: ConsentSettings,
	patch: Partial<ConsentSettings>,
): ConsentSettings {
	return {
		technical: patch.technical ?? current.technical,
		behavioural: patch.behavioural ?? current.behavioural,
	};
}
