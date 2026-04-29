export class ProxyPool {
  constructor(raw, opts = {}) {
    this.cooldownMs = Number(opts.cooldownMs || 20_000);
    this.now = typeof opts.now === "function" ? opts.now : () => Date.now();
    this.items = parseProxyList(raw).map((url, idx) => ({
      id: `p${idx}`,
      url,
      cooldownUntil: 0,
      failCount: 0,
    }));
    this.pointer = 0;
  }

  list() {
    return this.items.map((x) => ({ ...x }));
  }

  next() {
    if (this.items.length === 0) return null;
    const now = this.now();
    for (let i = 0; i < this.items.length; i += 1) {
      const idx = (this.pointer + i) % this.items.length;
      const item = this.items[idx];
      if (item.cooldownUntil > now) continue;
      this.pointer = (idx + 1) % this.items.length;
      return { id: item.id, url: item.url };
    }
    return null;
  }

  markFailure(id) {
    if (!id) return;
    const it = this.items.find((x) => x.id === id);
    if (!it) return;
    it.failCount += 1;
    it.cooldownUntil = this.now() + this.cooldownMs;
  }

  markSuccess(id) {
    if (!id) return;
    const it = this.items.find((x) => x.id === id);
    if (!it) return;
    it.failCount = 0;
    it.cooldownUntil = 0;
  }
}

export function parseProxyList(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/[,\n]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}
