import test from "node:test";
import assert from "node:assert/strict";
import { OnlineGame } from "../online.js";

test("anonymous auth, RPC bearer token, stored reconnect and token refresh", async () => {
  const previousFetch = globalThis.fetch;
  const previousStorage = globalThis.localStorage;
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => storage.get(key),
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, ...options });
    return {
      ok: true,
      json: async () =>
        url.includes("/rpc/")
          ? { code: "ABCDEF", version: 1 }
          : {
              access_token: "player-jwt",
              refresh_token: "refresh",
              expires_in: 3600,
              user: { id: "player-1" },
            },
    };
  };
  try {
    const config = {
      supabaseUrl: "https://example.supabase.co",
      supabaseKey: "sb_publishable_example",
    };
    const client = new OnlineGame(config);
    assert.equal(client.configured, true);
    await client.connect("captcha");
    assert.equal(calls[0].headers.Authorization, undefined);
    assert.equal(
      JSON.parse(calls[0].body).gotrue_meta_security.captcha_token,
      "captcha",
    );
    await client.request("create", null, { name: "Michael" });
    assert.equal(calls[1].headers.Authorization, "Bearer player-jwt");
    assert.equal(JSON.parse(calls[1].body).p_action, "create");
    const reconnected = new OnlineGame(config);
    await reconnected.connect();
    assert.equal(calls.length, 2);
    assert.equal(reconnected.userId, "player-1");
    await reconnected.connect(undefined, true);
    assert.match(calls[2].url, /grant_type=refresh_token/);
    assert.deepEqual(JSON.parse(calls[2].body), { refresh_token: "refresh" });
  } finally {
    globalThis.fetch = previousFetch;
    globalThis.localStorage = previousStorage;
  }
});

test("private keys are rejected and missing sessions never silently become new seats", async () => {
  const client = new OnlineGame({
    supabaseUrl: "https://example.supabase.co",
    supabaseKey: "sb_secret_forbidden",
  });
  await assert.rejects(client.connect(), /never a secret key/);
  const unconnected = new OnlineGame({
    supabaseUrl: "https://example.supabase.co",
    supabaseKey: "sb_publishable_example",
  });
  await assert.rejects(
    unconnected.request("get", "ABCDEF"),
    /session is missing/,
  );
});
