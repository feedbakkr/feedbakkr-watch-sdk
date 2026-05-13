import { describe, expect, test } from "vitest";
import { walkCauses } from "./cause.js";

describe("walkCauses", () => {
	test("returns empty array when error has no cause", () => {
		expect(walkCauses(new Error("plain"))).toEqual([]);
	});

	test("walks a single-link cause chain", () => {
		const inner = new Error("inner failure");
		const outer = new Error("outer", { cause: inner });
		const chain = walkCauses(outer);
		expect(chain).toHaveLength(1);
		expect(chain[0]?.message).toBe("inner failure");
		expect(chain[0]?.errorName).toBe("Error");
	});

	test("walks multi-link chains", () => {
		const root = new Error("root");
		const mid = new Error("mid", { cause: root });
		const outer = new Error("outer", { cause: mid });
		const chain = walkCauses(outer);
		expect(chain.map((c) => c.message)).toEqual(["mid", "root"]);
	});

	test("handles non-Error causes (string / plain object)", () => {
		const err = new Error("outer", { cause: "bad config" });
		expect(walkCauses(err)).toEqual([{ message: "bad config" }]);

		const objCause = { name: "OopsError", message: "from object", stack: "stack-trace" };
		const wrapped = new Error("outer2", { cause: objCause });
		const chain = walkCauses(wrapped);
		expect(chain[0]).toEqual({
			errorName: "OopsError",
			message: "from object",
			stack: "stack-trace",
		});
	});

	test("breaks cycles instead of looping forever", () => {
		// biome-ignore lint/suspicious/noExplicitAny: building a deliberate cycle for the test
		const a: any = new Error("a");
		// biome-ignore lint/suspicious/noExplicitAny: building a deliberate cycle for the test
		const b: any = new Error("b", { cause: a });
		a.cause = b;
		const chain = walkCauses(a);
		// Each node is added at most once: a→b→a triggers the cycle break
		// on the third hop, after b and a have both been recorded.
		expect(chain.map((c) => c.message)).toEqual(["b", "a"]);
	});

	test("caps very deep chains", () => {
		let current: Error | undefined;
		for (let i = 0; i < 50; i++) {
			current = new Error(`level ${i}`, current ? { cause: current } : undefined);
		}
		const chain = walkCauses(current as Error);
		expect(chain.length).toBeLessThanOrEqual(8);
	});
});
