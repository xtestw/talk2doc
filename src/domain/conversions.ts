import type { DB } from "../infra/db/d1";
import type { ConversionRecord, ConversionStatus } from "./types";

export class ConversionsService {
  constructor(private readonly db: DB) {}

  async createPending(input: {
    id: string;
    userId: string;
    sourceUrl: string;
    provider: string;
    model: string;
  }): Promise<ConversionRecord> {
    const now = Date.now();
    await this.db.exec(
      `INSERT INTO conversion_records
       (id, user_id, source_url, provider, model, status, subtitle_text, article_markdown, error_message, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', '', '', NULL, ?, ?)`,
      input.id,
      input.userId,
      input.sourceUrl,
      input.provider,
      input.model,
      now,
      now,
    );
    return {
      id: input.id,
      userId: input.userId,
      sourceUrl: input.sourceUrl,
      provider: input.provider,
      model: input.model,
      status: "pending",
      subtitleText: "",
      articleMarkdown: "",
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  async markSuccess(id: string, input: { subtitleText: string; articleMarkdown: string }): Promise<void> {
    const now = Date.now();
    await this.db.exec(
      `UPDATE conversion_records
       SET status = 'success',
           subtitle_text = ?,
           article_markdown = ?,
           error_message = NULL,
           updated_at = ?
       WHERE id = ?`,
      input.subtitleText,
      input.articleMarkdown,
      now,
      id,
    );
  }

  async markFailed(id: string, errorMessage: string): Promise<void> {
    const now = Date.now();
    await this.db.exec(
      `UPDATE conversion_records
       SET status = 'failed',
           error_message = ?,
           updated_at = ?
       WHERE id = ?`,
      errorMessage,
      now,
      id,
    );
  }

  async history(userId: string, limit = 50): Promise<ConversionRecord[]> {
    const rows = await this.db.all<RawConversion>(
      `SELECT id, user_id, source_url, provider, model, status,
              subtitle_text, article_markdown, error_message, created_at, updated_at
       FROM conversion_records
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      userId,
      Math.min(Math.max(limit, 1), 200),
    );
    return rows.map(rowToConversion);
  }

  async findById(userId: string, id: string): Promise<ConversionRecord | null> {
    const row = await this.db.first<RawConversion>(
      `SELECT id, user_id, source_url, provider, model, status,
              subtitle_text, article_markdown, error_message, created_at, updated_at
       FROM conversion_records
       WHERE user_id = ? AND id = ?`,
      userId,
      id,
    );
    return row ? rowToConversion(row) : null;
  }

  async deleteById(userId: string, id: string): Promise<boolean> {
    const changed = await this.db.exec(
      `DELETE FROM conversion_records WHERE user_id = ? AND id = ?`,
      userId,
      id,
    );
    return changed > 0;
  }
}

interface RawConversion {
  id: string;
  user_id: string;
  source_url: string;
  provider: string;
  model: string;
  status: ConversionStatus;
  subtitle_text: string;
  article_markdown: string;
  error_message: string | null;
  created_at: number;
  updated_at: number;
}

function rowToConversion(r: RawConversion): ConversionRecord {
  return {
    id: r.id,
    userId: r.user_id,
    sourceUrl: r.source_url,
    provider: r.provider,
    model: r.model,
    status: r.status,
    subtitleText: r.subtitle_text,
    articleMarkdown: r.article_markdown,
    errorMessage: r.error_message,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
