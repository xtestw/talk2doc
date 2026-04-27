// ASR 任务台账。每次付费 ASR（不论成功/失败/退分）都留一行，便于审计与计费对账。

import type { DB } from "../infra/db/d1";
import type { AsrJob, AsrJobStatus } from "./types";

export class AsrJobsService {
  constructor(private readonly db: DB) {}

  async create(input: {
    id: string;
    userId: string;
    sourceUrl: string;
    durationSec: number | null;
    costCredits: number;
    provider: string;
  }): Promise<void> {
    await this.db.exec(
      `INSERT INTO asr_jobs
       (id, user_id, source_url, duration_sec, cost_credits, status, provider, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
      input.id,
      input.userId,
      input.sourceUrl,
      input.durationSec,
      input.costCredits,
      input.provider,
      Date.now(),
    );
  }

  async finish(id: string, status: Exclude<AsrJobStatus, "pending">): Promise<void> {
    await this.db.exec(
      `UPDATE asr_jobs SET status = ?, finished_at = ? WHERE id = ? AND status = 'pending'`,
      status,
      Date.now(),
      id,
    );
  }

  async listByUser(userId: string, limit = 50): Promise<AsrJob[]> {
    const rows = await this.db.all<{
      id: string;
      user_id: string;
      source_url: string;
      duration_sec: number | null;
      cost_credits: number;
      status: AsrJobStatus;
      provider: string;
      created_at: number;
      finished_at: number | null;
    }>(
      `SELECT id, user_id, source_url, duration_sec, cost_credits, status, provider, created_at, finished_at
       FROM asr_jobs WHERE user_id = ?
       ORDER BY created_at DESC LIMIT ?`,
      userId,
      Math.min(Math.max(limit, 1), 200),
    );
    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      sourceUrl: r.source_url,
      durationSec: r.duration_sec,
      costCredits: r.cost_credits,
      status: r.status,
      provider: r.provider,
      createdAt: r.created_at,
      finishedAt: r.finished_at,
    }));
  }
}
