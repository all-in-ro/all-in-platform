import { randomUUID } from "node:crypto";
import { processAifShopifyOutboxBatch } from "./aifShopify.js";

const GLOBAL_STATE_KEY = Symbol.for("allin.shopify.embeddedWorker");

function envBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on", "igen"].includes(String(value).trim().toLowerCase());
}

function boundedInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function schedule(state, delayMs) {
  if (state.stopped) return;
  state.timer = setTimeout(() => {
    void tick(state);
  }, delayMs);

  // The HTTP server keeps the process alive. This timer alone should not block shutdown.
  state.timer.unref?.();
}

async function tick(state) {
  if (state.stopped || state.running) return;
  state.running = true;

  try {
    const result = await processAifShopifyOutboxBatch(state.pool, {
      limit: state.limit,
    });

    if (result.processed || result.errors || result.superseded) {
      console.log("AIF Shopify embedded sync batch", JSON.stringify({
        instanceId: state.instanceId,
        ...result,
      }));
    }

    if (!result.enabled) {
      schedule(state, state.disabledDelayMs);
    } else {
      schedule(state, result.processed ? state.busyDelayMs : state.idleDelayMs);
    }
  } catch (error) {
    console.error("AIF Shopify embedded sync error", {
      instanceId: state.instanceId,
      message: error?.message || String(error),
      code: error?.code || null,
    });
    schedule(state, state.errorDelayMs);
  } finally {
    state.running = false;
  }
}

export function startAifShopifyEmbeddedWorker(pool, options = {}) {
  if (!pool || typeof pool.connect !== "function") {
    throw new Error("Az AIF Shopify beágyazott workerhez érvényes PostgreSQL pool szükséges.");
  }

  const existing = globalThis[GLOBAL_STATE_KEY];
  if (existing?.started && !existing.stopped) return existing;

  const enabled = envBool(process.env.SHOPIFY_SYNC_ENABLED, false);
  const embeddedEnabled = envBool(process.env.SHOPIFY_EMBEDDED_WORKER_ENABLED, true);

  const state = {
    started: false,
    stopped: false,
    running: false,
    timer: null,
    pool,
    instanceId: randomUUID(),
    limit: boundedInt(
      options.limit ?? process.env.SHOPIFY_SYNC_BATCH_LIMIT,
      20,
      1,
      100,
    ),
    idleDelayMs: boundedInt(
      options.idleDelayMs ?? process.env.SHOPIFY_SYNC_IDLE_MS,
      2000,
      500,
      60000,
    ),
    busyDelayMs: boundedInt(
      options.busyDelayMs ?? process.env.SHOPIFY_SYNC_BUSY_MS,
      500,
      100,
      10000,
    ),
    disabledDelayMs: 30000,
    errorDelayMs: 15000,
  };

  globalThis[GLOBAL_STATE_KEY] = state;

  if (!embeddedEnabled) {
    console.log("AIF Shopify embedded worker disabled by SHOPIFY_EMBEDDED_WORKER_ENABLED=false");
    return state;
  }

  if (!enabled) {
    console.log("AIF Shopify embedded worker not started because SHOPIFY_SYNC_ENABLED=false");
    return state;
  }

  state.started = true;
  console.log("AIF Shopify embedded worker started", JSON.stringify({
    instanceId: state.instanceId,
    limit: state.limit,
    idleDelayMs: state.idleDelayMs,
  }));

  schedule(state, 250);
  return state;
}

export function stopAifShopifyEmbeddedWorker() {
  const state = globalThis[GLOBAL_STATE_KEY];
  if (!state) return false;

  state.stopped = true;
  state.started = false;
  if (state.timer) clearTimeout(state.timer);
  state.timer = null;
  return true;
}
