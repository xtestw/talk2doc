-- 转换记录：保存每次生成任务的输入/输出（登录用户云端存储）
CREATE TABLE IF NOT EXISTS conversion_records (
    id                TEXT PRIMARY KEY,
    user_id           TEXT NOT NULL,
    source_url        TEXT NOT NULL,
    provider          TEXT NOT NULL,
    model             TEXT NOT NULL,
    status            TEXT NOT NULL, -- 'pending' | 'success' | 'failed'
    subtitle_text     TEXT NOT NULL DEFAULT '',
    article_markdown  TEXT NOT NULL DEFAULT '',
    error_message     TEXT,
    created_at        INTEGER NOT NULL,
    updated_at        INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_conv_user_created
ON conversion_records(user_id, created_at DESC);
