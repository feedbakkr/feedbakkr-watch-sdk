import { sanitise } from "./sanitise.js";
import type { CaptureOptions, ErrorSeverity, ErrorSource, EventPayload, Tags } from "./types.js";

export interface PayloadBuilderConfig {
	projectId: string;
	tenantId?: string;
	environment: string;
	appVersion?: string;
	defaultSource: ErrorSource;
	defaultTags?: Tags;
}

export function buildPayload(
	error: Error | string,
	config: PayloadBuilderConfig,
	options: CaptureOptions = {},
): EventPayload {
	const isErr = typeof error !== "string";
	const message = isErr ? error.message : error;
	const errorName = isErr ? error.name : undefined;
	const stack = isErr ? error.stack : undefined;

	const payload: EventPayload = {
		source: options.source ?? config.defaultSource,
		severity: options.severity ?? "error",
		environment: config.environment,
		appVersion: config.appVersion,
		timestamp: new Date().toISOString(),
		tenantId: config.tenantId,
		projectId: config.projectId,
		errorName,
		message,
		stack,
		fingerprint: options.fingerprint,
		tags: options.tags ? sanitise({ ...config.defaultTags, ...options.tags }) : config.defaultTags,
		context: options.context ? sanitise(options.context) : undefined,
		request:
			options.route || options.method || options.statusCode || options.requestId
				? {
						route: options.route,
						method: options.method,
						statusCode: options.statusCode,
						requestId: options.requestId,
					}
				: undefined,
	};

	return payload;
}

export function severityForCapture(severity: ErrorSeverity | undefined): ErrorSeverity {
	return severity ?? "error";
}
