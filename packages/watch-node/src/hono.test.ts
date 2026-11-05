import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describe, expect, test, vi } from "vitest";
import { watchOnError } from "./hono.js";
import { createWatchClient } from "./index.js";

function setup() {
	const bodies: Record<string, unknown>[] = [];
	const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
		bodies.push(JSON.parse(String(init?.body)));
		return new Response(null, { status: 202 });
	});
	const client = createWatchClient({
		endpoint: "https://watch.example.com/v1/events",
		projectId: "proj",
		environment: "test",
		fetchImpl,
	});
	const app = new Hono();
	app.onError(watchOnError({ client }));
	app.get("/users/:id", (c) => {
		const id = c.req.param("id");
		if (id === "missing") throw new HTTPException(404, { message: "No such user" });
		if (id === "down") throw new HTTPException(503, { message: "Down" });
		throw new Error("crash");
	});
	return { app, client, bodies };
}

describe("watchOnError", () => {
	test("reports an unexpected error and answers 500", async () => {
		const { app, client, bodies } = setup();
		const res = await app.request("/users/42", { headers: { "x-request-id": "r1" } });
		expect(res.status).toBe(500);
		await client.flush();
		expect(bodies).toHaveLength(1);
		expect(bodies[0]?.message).toBe("crash");
		expect(bodies[0]?.request).toMatchObject({
			route: "/users/:id",
			method: "GET",
			statusCode: 500,
			requestId: "r1",
		});
	});

	test("keeps an HTTPException's response and doesn't report 4xx", async () => {
		const { app, client, bodies } = setup();
		const res = await app.request("/users/missing");
		expect(res.status).toBe(404);
		expect(await res.text()).toBe("No such user");
		await client.flush();
		expect(bodies).toHaveLength(0);
	});

	test("reports a 5xx HTTPException with its own response", async () => {
		const { app, client, bodies } = setup();
		const res = await app.request("/users/down");
		expect(res.status).toBe(503);
		await client.flush();
		expect(bodies).toHaveLength(1);
	});

	test("accepts a client per request", async () => {
		const { client, bodies } = setup();
		const app = new Hono();
		app.onError(watchOnError({ client: () => client }));
		app.get("/", () => {
			throw new Error("x");
		});
		expect((await app.request("/")).status).toBe(500);
		await client.flush();
		expect(bodies).toHaveLength(1);
	});
});
