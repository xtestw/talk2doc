import test from "node:test";
import assert from "node:assert/strict";

import { ProxyPool } from "./proxy-pool.js";

test("returns null when no proxies configured", () => {
  const pool = new ProxyPool("");
  assert.equal(pool.next(), null);
});

test("rotates proxies in round-robin order", () => {
  const pool = new ProxyPool("socks5://127.0.0.1:1080,http://127.0.0.1:7890");
  assert.equal(pool.next()?.url, "socks5://127.0.0.1:1080");
  assert.equal(pool.next()?.url, "http://127.0.0.1:7890");
  assert.equal(pool.next()?.url, "socks5://127.0.0.1:1080");
});

test("skips proxy during cooldown after failure", () => {
  const pool = new ProxyPool("http://a:1,http://b:2", { now: () => 1000, cooldownMs: 3000 });
  const first = pool.next();
  assert.equal(first?.url, "http://a:1");
  pool.markFailure(first?.id);

  assert.equal(pool.next()?.url, "http://b:2");
});

test("proxy becomes available after cooldown", () => {
  let now = 1000;
  const pool = new ProxyPool("http://a:1,http://b:2", { now: () => now, cooldownMs: 3000 });
  const first = pool.next();
  pool.markFailure(first?.id);

  now = 5000;
  const picks = [pool.next()?.url, pool.next()?.url];
  assert.deepEqual(new Set(picks), new Set(["http://a:1", "http://b:2"]));
});
