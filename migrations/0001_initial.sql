CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    passwordHash TEXT NOT NULL,
    passwordSalt TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    credentialVersion INTEGER NOT NULL DEFAULT 1,
    profileVersion INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL,
    deletedAt TEXT
);

CREATE TABLE issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    authorId INTEGER REFERENCES users(id),
    creationToken TEXT NOT NULL UNIQUE CHECK (length(creationToken) = 36),
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    priority TEXT NOT NULL CHECK (priority IN ('Low', 'Medium', 'High')),
    status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Closed')),
    stateReason TEXT CHECK (stateReason IN ('completed', 'not_planned')),
    version INTEGER NOT NULL DEFAULT 1,
    assignmentVersion INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL
);
CREATE INDEX issues_status_id ON issues (status, id DESC);

CREATE TABLE replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issueId INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    authorId INTEGER NOT NULL REFERENCES users(id),
    creationToken TEXT NOT NULL UNIQUE CHECK (length(creationToken) = 36),
    description TEXT NOT NULL DEFAULT '',
    version INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL
);
CREATE INDEX replies_issue_id ON replies (issueId, id);

CREATE TABLE issue_assignees (
    issueId INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('product', 'development', 'testing')),
    PRIMARY KEY (issueId, role, userId)
);
CREATE INDEX issue_assignees_user ON issue_assignees (userId, issueId);

CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel TEXT NOT NULL DEFAULT 'operation' CHECK (channel IN ('operation', 'timeline')),
    actorId INTEGER REFERENCES users(id),
    targetId INTEGER REFERENCES users(id),
    issueId INTEGER REFERENCES issues(id) ON DELETE CASCADE,
    action TEXT NOT NULL CHECK (action IN ('setup', 'user_created', 'user_updated', 'user_deleted', 'password_reset',
        'issue_created', 'reply_created', 'reply_edited', 'reply_deleted', 'issue_status', 'issue_priority', 'issue_assignees')),
    details TEXT NOT NULL CHECK (json_valid(details)),
    createdAt TEXT NOT NULL,
    CHECK ((channel = 'timeline' AND issueId IS NOT NULL AND targetId IS NULL
            AND action IN ('reply_edited', 'reply_deleted', 'issue_status', 'issue_priority', 'issue_assignees'))
        OR (channel = 'operation' AND issueId IS NULL AND actorId IS NOT NULL))
);
CREATE INDEX events_issue_time ON events (issueId, createdAt, id) WHERE channel = 'timeline';
CREATE INDEX events_operations ON events (id DESC) WHERE channel = 'operation';

CREATE TABLE notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actorId INTEGER NOT NULL REFERENCES users(id),
    issueId INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    replyId INTEGER REFERENCES replies(id) ON DELETE SET NULL,
    kind TEXT NOT NULL CHECK (kind IN ('mention', 'assignment')),
    source TEXT NOT NULL,
    assignmentRole TEXT CHECK (assignmentRole IN ('product', 'development', 'testing')),
    createdAt TEXT NOT NULL,
    readAt TEXT,
    UNIQUE (userId, kind, source)
);
CREATE INDEX notifications_user ON notifications (userId, id DESC);
CREATE INDEX notifications_unread ON notifications (userId, id DESC) WHERE readAt IS NULL;

CREATE TABLE images (
    key TEXT PRIMARY KEY,
    issueId INTEGER REFERENCES issues(id) ON DELETE CASCADE,
    replyId INTEGER REFERENCES replies(id) ON DELETE CASCADE,
    position INTEGER,
    contentType TEXT,
    byteSize INTEGER,
    state TEXT NOT NULL CHECK (state IN ('active', 'deleting')),
    createdAt TEXT,
    CHECK ((state = 'active' AND position IS NOT NULL AND position >= 0 AND ((issueId IS NOT NULL) != (replyId IS NOT NULL)))
        OR (state = 'deleting' AND issueId IS NULL AND replyId IS NULL AND position IS NULL))
);
CREATE UNIQUE INDEX images_issue_position ON images (issueId, position) WHERE issueId IS NOT NULL;
CREATE UNIQUE INDEX images_reply_position ON images (replyId, position) WHERE replyId IS NOT NULL;
CREATE INDEX images_state ON images (state);

CREATE TABLE auth_attempts (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL CHECK (scope IN ('account', 'network')),
    subjectHash TEXT,
    attemptedAt INTEGER,
    attempts INTEGER,
    expiresAt INTEGER,
    CHECK ((scope = 'account' AND subjectHash IS NOT NULL AND attemptedAt IS NOT NULL
            AND attempts IS NULL AND expiresAt IS NULL)
        OR (scope = 'network' AND attempts IS NOT NULL AND expiresAt IS NOT NULL
            AND subjectHash IS NULL AND attemptedAt IS NULL))
);
CREATE INDEX auth_attempts_account_time ON auth_attempts (subjectHash, attemptedAt) WHERE scope = 'account';
CREATE INDEX auth_attempts_account_expiry ON auth_attempts (attemptedAt) WHERE scope = 'account';
CREATE INDEX auth_attempts_network_expiry ON auth_attempts (expiresAt) WHERE scope = 'network';

CREATE TABLE mutation_requests (
    userId INTEGER NOT NULL REFERENCES users(id),
    requestKey TEXT NOT NULL,
    route TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    resourceId INTEGER NOT NULL,
    createdAt TEXT NOT NULL,
    PRIMARY KEY (userId, requestKey)
);

CREATE TABLE runtime_secrets (
    name TEXT PRIMARY KEY,
    value TEXT NOT NULL CHECK (length(value) >= 32),
    createdAt TEXT NOT NULL
);

PRAGMA optimize;
