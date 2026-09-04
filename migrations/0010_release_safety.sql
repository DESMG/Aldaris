ALTER TABLE users ADD COLUMN credentialVersion INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN profileVersion INTEGER NOT NULL DEFAULT 1;
ALTER TABLE issues ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE mutation_requests (
    userId INTEGER NOT NULL REFERENCES users(id),
    requestKey TEXT NOT NULL,
    route TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    resourceId INTEGER NOT NULL,
    createdAt TEXT NOT NULL,
    PRIMARY KEY (userId, requestKey)
);

CREATE TABLE operation_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actorId INTEGER NOT NULL REFERENCES users(id),
    targetId INTEGER REFERENCES users(id),
    action TEXT NOT NULL CHECK (action IN ('user_created', 'user_updated', 'user_deleted', 'password_reset', 'setup',
        'issue_created', 'reply_created', 'reply_edited', 'reply_deleted', 'issue_status', 'issue_priority', 'issue_assignees')),
    details TEXT NOT NULL CHECK (json_valid(details)),
    createdAt TEXT NOT NULL
);

CREATE INDEX auth_attempts_expiry ON auth_attempts (expiresAt);

CREATE TABLE auth_account_attempts (
    id TEXT PRIMARY KEY,
    accountKey TEXT NOT NULL,
    attemptedAt INTEGER NOT NULL
);
CREATE INDEX auth_account_attempts_account_time ON auth_account_attempts (accountKey, attemptedAt);
CREATE INDEX auth_account_attempts_expiry ON auth_account_attempts (attemptedAt);
