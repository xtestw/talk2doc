// 单一 ID 生成入口；CF Workers / Node 18+ 原生支持 crypto.randomUUID。
export function newId(): string {
  return crypto.randomUUID();
}
