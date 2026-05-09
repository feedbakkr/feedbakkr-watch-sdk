import { Component, type ComponentType, type ReactNode } from "react";
import { captureError } from "./index.js";

interface ErrorBoundaryProps {
	children: ReactNode;
	fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
	onError?: (error: Error, info: { componentStack?: string }) => void;
}

interface ErrorBoundaryState {
	error: Error | null;
}

export class FeedbakkrErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
	override state: ErrorBoundaryState = { error: null };

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { error };
	}

	override componentDidCatch(error: Error, info: { componentStack?: string }): void {
		captureError(error, {
			tags: { boundary: "react" },
			context: info.componentStack ? { componentStack: info.componentStack } : undefined,
		});
		this.props.onError?.(error, info);
	}

	private reset = (): void => this.setState({ error: null });

	override render(): ReactNode {
		if (this.state.error) {
			const { fallback } = this.props;
			if (typeof fallback === "function") return fallback(this.state.error, this.reset);
			return fallback ?? null;
		}
		return this.props.children;
	}
}

export function withErrorBoundary<P extends object>(
	Component: ComponentType<P>,
	boundaryProps: Omit<ErrorBoundaryProps, "children"> = {},
): ComponentType<P> {
	const Wrapped = (props: P) => (
		<FeedbakkrErrorBoundary {...boundaryProps}>
			<Component {...props} />
		</FeedbakkrErrorBoundary>
	);
	Wrapped.displayName = `withErrorBoundary(${Component.displayName ?? Component.name ?? "Anonymous"})`;
	return Wrapped;
}
