CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    passwordHash TEXT NOT NULL,
    passwordSalt TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    createdAt TEXT NOT NULL
);

CREATE TABLE sessions (
    tokenHash TEXT PRIMARY KEY,
    userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expiresAt INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions (userId);
CREATE INDEX sessions_expiry ON sessions (expiresAt);

CREATE TABLE auth_attempts (
    key TEXT PRIMARY KEY,
    attempts INTEGER NOT NULL,
    expiresAt INTEGER NOT NULL
);

ALTER TABLE issues ADD COLUMN authorId INTEGER REFERENCES users(id);

CREATE TABLE replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issueId INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    authorId INTEGER NOT NULL REFERENCES users(id),
    description TEXT NOT NULL DEFAULT '',
    images TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(images)),
    createdAt TEXT NOT NULL
);
CREATE INDEX replies_issue_id ON replies (issueId, id);
