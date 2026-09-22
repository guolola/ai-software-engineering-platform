// Verifies SSE-specific headers because hijacked streams bypass Fastify CORS.
import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { RunEvent, RunSnapshot } from "@uml-platform/contracts";
import {
  emitEvent,
  type RunRecord,
} from "../runs/records/run-record-store.js";
import { registerRunEventsRoute } from "./run-events.js";

const completedSnapshot = {
  runId: "run-1",
  status: "completed",
} as RunSnapshot;

function createCompletedRunRecord(): RunRecord {
  const event = {
    type: "completed",
    snapshot: completedSnapshot,
  } as RunEvent;

  return {
    snapshot: completedSnapshot,
    events: [event],
    listeners: new Set(),
    terminal: true,
  };
}

async function createSseTestApp() {
  const app = Fastify({ logger: false });
  const runs = new Map<string, RunRecord>();
  runs.set("run-1", createCompletedRunRecord());

  registerRunEventsRoute({
    app,
    runs,
    path: "/runs/:runId/events",
    notFoundMessage: "Run not found",
    defaultAllowOrigin: "http://localhost:5173",
    heartbeatMs: 1000,
  });

  return { app, runs };
}

test("replays history before buffered terminal publications and deduplicates overlapping live events", async () => {
  const app = Fastify();
  const started: RunEvent = { type: "stage_started", stage: "generate_models", eventId: "stage-one" };
  const record: RunRecord = { snapshot: { ...completedSnapshot, status: "running" }, events: [{ type: "queued", eventId: "queued" }, started], listeners: new Set(), terminal: false };
  let closed = false;
  registerRunEventsRoute({
    app, runs: new Map([["run-1", record]]), path: "/runs/:runId/events", notFoundMessage: "missing", defaultAllowOrigin: "http://localhost:5173",
    subscribeRunEvents: async (_runId, receive) => {
      receive(started);
      receive({ type: "cancelled", eventId: "end", message: "已取消" });
      return { close: async () => { closed = true; } };
    },
  });
  const response = await app.inject({ method: "GET", url: "/runs/run-1/events" });
  const events = response.body.split("\n").filter((line) => line.startsWith("data:")).map((line) => JSON.parse(line.slice(5)));
  assert.deepEqual(events.map((event) => event.eventId), ["queued", "stage-one", "end"]);
  assert.equal(closed, true);
  await app.close();
});

async function withApiCorsOrigins<T>(
  value: string | undefined,
  callback: () => Promise<T>,
) {
  const original = process.env.API_CORS_ORIGINS;
  if (value === undefined) {
    delete process.env.API_CORS_ORIGINS;
  } else {
    process.env.API_CORS_ORIGINS = value;
  }

  try {
    return await callback();
  } finally {
    if (original === undefined) {
      delete process.env.API_CORS_ORIGINS;
    } else {
      process.env.API_CORS_ORIGINS = original;
    }
  }
}

test("run event SSE allows an allowlisted default origin", async () => {
  await withApiCorsOrigins("http://localhost:5173", async () => {
    const { app } = await createSseTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/runs/run-1/events",
      headers: {
        origin: "http://localhost:5173",
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(
      response.headers["access-control-allow-origin"],
      "http://localhost:5173",
    );
    assert.equal(response.headers["access-control-allow-credentials"], "true");

    await app.close();
  });
});

test("run event SSE allows origins from the API CORS allowlist", async () => {
  await withApiCorsOrigins("https://app.example.com", async () => {
    const { app } = await createSseTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/runs/run-1/events",
      headers: {
        origin: "https://app.example.com",
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(
      response.headers["access-control-allow-origin"],
      "https://app.example.com",
    );

    await app.close();
  });
});

test("run event SSE does not reflect hostile origins", async () => {
  await withApiCorsOrigins("https://app.example.com", async () => {
    const { app } = await createSseTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/runs/run-1/events",
      headers: {
        origin: "https://attacker.example",
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["access-control-allow-origin"], undefined);

    await app.close();
  });
});

test("run event SSE keeps no-origin requests usable", async () => {
  const { app } = await createSseTestApp();

  const response = await app.inject({
    method: "GET",
    url: "/runs/run-1/events",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(
    response.headers["access-control-allow-origin"],
    "http://localhost:5173",
  );
  assert.match(response.body, /"type":"completed"/);

  await app.close();
});

test("run event SSE closes after a live cancelled event", async () => {
  const { app, runs } = await createSseTestApp();
  const record: RunRecord = {
    snapshot: {
      runId: "run-cancel",
      status: "running",
    } as RunSnapshot,
    events: [],
    listeners: new Set(),
    terminal: false,
  };
  runs.set("run-cancel", record);

  const responsePromise = app.inject({
    method: "GET",
    url: "/runs/run-cancel/events",
  });
  setTimeout(() => {
    emitEvent(record, {
      type: "cancelled",
      message: "Run cancelled by user",
    } as RunEvent);
  }, 0);

  const response = await responsePromise;

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /"type":"cancelled"/);
  assert.equal(record.listeners.size, 0);

  await app.close();
});

test("run event SSE forwards subscribed Redis events and closes after terminal events", async () => {
  const app = Fastify({ logger: false });
  const runs = new Map<string, RunRecord>();
  const record: RunRecord = {
    snapshot: {
      runId: "run-redis",
      status: "running",
    } as RunSnapshot,
    events: [],
    listeners: new Set(),
    terminal: false,
  };
  runs.set("run-redis", record);
  let redisListener: ((event: RunEvent) => void) | null = null;
  let subscriptionClosed = false;

  registerRunEventsRoute({
    app,
    runs,
    path: "/runs/:runId/events",
    notFoundMessage: "Run not found",
    defaultAllowOrigin: "http://localhost:5173",
    heartbeatMs: 1000,
    subscribeRunEvents: async (runId, listener) => {
      assert.equal(runId, "run-redis");
      redisListener = listener;
      return {
        async close() {
          subscriptionClosed = true;
        },
      };
    },
  });

  const responsePromise = app.inject({
    method: "GET",
    url: "/runs/run-redis/events",
  });
  setTimeout(() => {
    redisListener?.({
      type: "completed",
      snapshot: completedSnapshot,
    } as RunEvent);
  }, 0);

  const response = await responsePromise;

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /"type":"completed"/);
  assert.equal(record.listeners.size, 0);
  assert.equal(subscriptionClosed, true);

  await app.close();
});

test("run event SSE ends when the Redis subscriber fails during streaming", async () => {
  const app = Fastify({ logger: false });
  const runs = new Map<string, RunRecord>();
  const record: RunRecord = {
    snapshot: {
      runId: "run-redis-error",
      status: "running",
    } as RunSnapshot,
    events: [],
    listeners: new Set(),
    terminal: false,
  };
  runs.set("run-redis-error", record);
  let failSubscriber: ((error: unknown) => void) | null = null;
  let subscriptionClosed = false;

  registerRunEventsRoute({
    app,
    runs,
    path: "/runs/:runId/events",
    notFoundMessage: "Run not found",
    defaultAllowOrigin: "http://localhost:5173",
    heartbeatMs: 1000,
    subscribeRunEvents: async (_runId, _listener, onError) => {
      failSubscriber = onError ?? null;
      return {
        async close() {
          subscriptionClosed = true;
        },
      };
    },
  });

  const responsePromise = app.inject({
    method: "GET",
    url: "/runs/run-redis-error/events",
  });
  setTimeout(() => {
    failSubscriber?.(new Error("redis connection closed"));
  }, 0);

  const response = await responsePromise;

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.includes('"type":"completed"'), false);
  assert.equal(record.listeners.size, 0);
  assert.equal(subscriptionClosed, true);

  await app.close();
});
