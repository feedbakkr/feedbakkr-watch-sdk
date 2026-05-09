import { describe, expect, test } from "vitest";
import { normaliseMessage, normaliseRoute, topMeaningfulFrame } from "./normalise.js";

describe("normaliseMessage", () => {
	test("redacts emails, uuids, and long ids", () => {
		const m = normaliseMessage(
			"Failed to send to ada@example.com (id 1234567 / 550e8400-e29b-41d4-a716-446655440000)",
		);
		expect(m).toContain(":email");
		expect(m).toContain(":uuid");
		expect(m).toContain(":n");
	});

	test("leaves short numbers alone", () => {
		expect(normaliseMessage("retry 3 of 5")).toBe("retry 3 of 5");
	});

	test("trims and caps to 500 chars", () => {
		const long = "x".repeat(900);
		expect(normaliseMessage(long).length).toBe(500);
	});
});

describe("normaliseRoute", () => {
	test("strips query string", () => {
		expect(normaliseRoute("/users/12345?tab=settings&debug=1")).toBe("/users/:n");
	});

	test("replaces uuid path segments", () => {
		expect(normaliseRoute("/projects/550e8400-e29b-41d4-a716-446655440000/edit")).toBe(
			"/projects/:uuid/edit",
		);
	});
});

describe("topMeaningfulFrame", () => {
	test("skips node_modules frames", () => {
		const stack = [
			"Error: boom",
			"    at someFn (/app/node_modules/react-dom/index.js:42:7)",
			"    at MyComponent (/app/src/inbox/list.tsx:88:3)",
			"    at runRenderQueue (/app/node_modules/react/index.js:1:1)",
		].join("\n");
		expect(topMeaningfulFrame(stack)).toContain("MyComponent");
		expect(topMeaningfulFrame(stack)).toContain("/app/src/inbox/list.tsx");
	});

	test("strips bundle hash from filenames", () => {
		const stack = "Error: x\n    at foo (/static/chunk-AbC123dEf.js:10:1)";
		expect(topMeaningfulFrame(stack)).toContain(".js");
		expect(topMeaningfulFrame(stack)).not.toContain("AbC123dEf");
	});
});
