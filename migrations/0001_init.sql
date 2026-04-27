-- Talk2Doc 初始化迁移
-- D1 (SQLite)：四张表覆盖账户、积分流水、充值订单、ASR 任务。
-- 一切余额变更必须经过 credit_transactions（双花防护 + 对账）。

CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,        -- google sub
    email       TEXT NOT NULL UNIQUE,
    name        TEXT,
    picture     TEXT,
    credits     INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 积分流水：delta 正充负扣，balance_after 同步快照便于对账。
CREATE TABLE IF NOT EXISTS credit_transactions (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    delta           INTEGER NOT NULL,
    reason          TEXT NOT NULL,                 -- 'topup' | 'asr' | 'asr_refund' | 'signup_bonus'
    ref_id          TEXT,                          -- 关联订单/任务 id
    balance_after   INTEGER NOT NULL,
    created_at      INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_credit_tx_user ON credit_transactions(user_id, created_at DESC);

-- 充值订单：id 即 stripe checkout session id；状态机 pending → paid / failed。
CREATE TABLE IF NOT EXISTS billing_orders (
    id                       TEXT PRIMARY KEY,    -- stripe checkout session id
    user_id                  TEXT NOT NULL,
    package_id               TEXT NOT NULL,
    amount_cents             INTEGER NOT NULL,
    currency                 TEXT NOT NULL,
    credits_granted          INTEGER NOT NULL,
    status                   TEXT NOT NULL,       -- 'pending' | 'paid' | 'failed'
    stripe_payment_intent    TEXT,
    created_at               INTEGER NOT NULL,
    paid_at                  INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON billing_orders(user_id, created_at DESC);

-- ASR 任务：每次付费 ASR 一条记录，便于追踪扣分/退分原因。
CREATE TABLE IF NOT EXISTS asr_jobs (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    source_url      TEXT NOT NULL,
    duration_sec    INTEGER,
    cost_credits    INTEGER NOT NULL,
    status          TEXT NOT NULL,                -- 'pending' | 'success' | 'failed' | 'refunded'
    provider        TEXT NOT NULL,                -- 'cf-whisper' | 'stub'
    created_at      INTEGER NOT NULL,
    finished_at     INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_asr_user ON asr_jobs(user_id, created_at DESC);
