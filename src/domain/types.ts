// Domain 层公共契约：仅描述业务实体与扣费理由的枚举。
// 不引 HTTP/IO，不依赖 D1 实现细节，便于在测试中 mock。

export interface User {
  id: string;
  email: string;
  name: string;
  picture: string;
  credits: number;
  createdAt: number;
  updatedAt: number;
}

export type CreditReason =
  | "topup"
  | "asr"
  | "asr_refund"
  | "signup_bonus";

export interface CreditTx {
  id: string;
  userId: string;
  delta: number;
  reason: CreditReason | string;
  refId: string | null;
  balanceAfter: number;
  createdAt: number;
}

export type OrderStatus = "pending" | "paid" | "failed";

export interface BillingOrder {
  id: string;
  userId: string;
  packageId: string;
  amountCents: number;
  currency: string;
  creditsGranted: number;
  status: OrderStatus;
  stripePaymentIntent: string | null;
  createdAt: number;
  paidAt: number | null;
}

export type AsrJobStatus = "pending" | "success" | "failed" | "refunded";

export interface AsrJob {
  id: string;
  userId: string;
  sourceUrl: string;
  durationSec: number | null;
  costCredits: number;
  status: AsrJobStatus;
  provider: string;
  createdAt: number;
  finishedAt: number | null;
}
