CREATE TABLE
    users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        passwordHash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
        credentialVersion INTEGER NOT NULL DEFAULT 1,
        profileVersion INTEGER NOT NULL DEFAULT 1,
        createdAt TEXT NOT NULL,
        deletedAt TEXT
    );

CREATE TABLE
    issues (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        authorId INTEGER REFERENCES users (id),
        creationToken TEXT NOT NULL UNIQUE CHECK (length (creationToken) = 36),
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        mentions TEXT NOT NULL DEFAULT '[]' CHECK (json_valid (mentions)),
        priority TEXT NOT NULL CHECK (priority IN ('Low', 'Medium', 'High')),
        status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Closed')),
        stateReason TEXT CHECK (stateReason IN ('completed', 'not_planned')),
        version INTEGER NOT NULL DEFAULT 1,
        assignmentVersion INTEGER NOT NULL DEFAULT 1,
        createdAt TEXT NOT NULL
    );

CREATE INDEX issues_status_id ON issues (status, id DESC);

CREATE TABLE
    replies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        issueId INTEGER NOT NULL REFERENCES issues (id) ON DELETE CASCADE,
        authorId INTEGER NOT NULL REFERENCES users (id),
        creationToken TEXT NOT NULL UNIQUE CHECK (length (creationToken) = 36),
        description TEXT NOT NULL DEFAULT '',
        mentions TEXT NOT NULL DEFAULT '[]' CHECK (json_valid (mentions)),
        version INTEGER NOT NULL DEFAULT 1,
        createdAt TEXT NOT NULL
    );

CREATE INDEX replies_issue_id ON replies (issueId, id);

CREATE TABLE
    issue_assignees (
        issueId INTEGER NOT NULL REFERENCES issues (id) ON DELETE CASCADE,
        userId INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('product', 'development', 'testing')),
        PRIMARY KEY (issueId, role, userId)
    );

CREATE INDEX issue_assignees_user ON issue_assignees (userId, issueId);

CREATE TABLE
    events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel TEXT NOT NULL DEFAULT 'operation' CHECK (channel IN ('operation', 'timeline')),
        actorId INTEGER REFERENCES users (id),
        targetId INTEGER REFERENCES users (id),
        issueId INTEGER REFERENCES issues (id) ON DELETE CASCADE,
        action TEXT NOT NULL CHECK (
            action IN (
                'user_created',
                'user_updated',
                'user_deleted',
                'password_reset',
                'issue_created',
                'reply_created',
                'reply_edited',
                'reply_deleted',
                'issue_status',
                'issue_priority',
                'issue_assignees'
            )
        ),
        details TEXT NOT NULL CHECK (json_valid (details)),
        createdAt TEXT NOT NULL,
        CHECK (
            (
                channel = 'timeline'
                AND issueId IS NOT NULL
                AND targetId IS NULL
                AND action IN (
                    'reply_edited',
                    'reply_deleted',
                    'issue_status',
                    'issue_priority',
                    'issue_assignees'
                )
            )
            OR (
                channel = 'operation'
                AND issueId IS NULL
                AND actorId IS NOT NULL
            )
        )
    );

CREATE INDEX events_issue_time ON events (issueId, createdAt, id)
WHERE
    channel = 'timeline';

CREATE INDEX events_operations ON events (id DESC)
WHERE
    channel = 'operation';

CREATE TABLE
    image_capacity (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        byteSize INTEGER NOT NULL DEFAULT 0 CHECK (byteSize BETWEEN 0 AND 10000000000),
        requestedBytes INTEGER NOT NULL DEFAULT 0 CHECK (requestedBytes BETWEEN 0 AND 10485760)
    );

INSERT INTO
    image_capacity (id)
VALUES
    (1);

CREATE TABLE
    images (
        key TEXT PRIMARY KEY,
        issueId INTEGER REFERENCES issues (id) ON DELETE CASCADE,
        replyId INTEGER REFERENCES replies (id) ON DELETE CASCADE,
        position INTEGER,
        contentType TEXT NOT NULL,
        byteSize INTEGER NOT NULL CHECK (byteSize > 0),
        state TEXT NOT NULL CHECK (
            state IN (
                'reserved',
                'uploading',
                'uploaded',
                'active',
                'deleting',
                'deleted'
            )
        ),
        createdAt TEXT NOT NULL,
        checkedAt TEXT,
        CHECK (
            (
                state IN ('active', 'deleting', 'deleted')
                AND position IS NOT NULL
                AND position >= 0
                AND ((issueId IS NOT NULL) != (replyId IS NOT NULL))
            )
            OR (
                state != 'active'
                AND issueId IS NULL
                AND replyId IS NULL
                AND position IS NULL
            )
        )
    );

CREATE UNIQUE INDEX images_issue_position ON images (issueId, position)
WHERE
    issueId IS NOT NULL;

CREATE UNIQUE INDEX images_reply_position ON images (replyId, position)
WHERE
    replyId IS NOT NULL;

CREATE INDEX images_state ON images (state, createdAt);

CREATE INDEX images_check ON images (state, checkedAt, key);

CREATE TRIGGER images_reserve BEFORE INSERT ON images BEGIN
SELECT
    RAISE (ABORT, 'image_capacity_exceeded')
WHERE
    NEW.byteSize + (
        SELECT
            byteSize
        FROM
            image_capacity
        WHERE
            id = 1
    ) > 10000000000;

SELECT
    RAISE (ABORT, 'image_must_be_reserved')
WHERE
    NEW.state != 'reserved';

UPDATE image_capacity
SET
    byteSize = byteSize + NEW.byteSize
WHERE
    id = 1;

END;

CREATE TRIGGER images_release AFTER
UPDATE OF state ON images WHEN OLD.state != 'deleted'
AND NEW.state = 'deleted' BEGIN
UPDATE image_capacity
SET
    byteSize = byteSize - OLD.byteSize
WHERE
    id = 1;

END;

CREATE TRIGGER images_no_resurrection BEFORE
UPDATE OF state ON images WHEN (
    OLD.state = 'deleted'
    AND NEW.state != 'deleted'
)
OR (
    OLD.state = 'deleting'
    AND NEW.state NOT IN ('deleting', 'deleted')
) BEGIN
SELECT
    RAISE (ABORT, 'image_already_cleared');

END;

CREATE TRIGGER images_delete_guard BEFORE DELETE ON images WHEN OLD.state != 'deleted' BEGIN
SELECT
    RAISE (ABORT, 'image_delete_not_confirmed');

END;

CREATE TABLE
    auth_attempts (
        id INTEGER PRIMARY KEY,
        ipHash TEXT NOT NULL,
        attemptedAt INTEGER NOT NULL
    );

CREATE INDEX auth_attempts_ip_time ON auth_attempts (ipHash, attemptedAt);

CREATE INDEX auth_attempts_expiry ON auth_attempts (attemptedAt);

CREATE TABLE
    sessions (
        userId INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
        sid TEXT NOT NULL,
        expiresAt INTEGER NOT NULL
    );

CREATE TRIGGER users_revoke_session AFTER
UPDATE OF credentialVersion ON users WHEN NEW.credentialVersion != OLD.credentialVersion BEGIN
DELETE FROM sessions
WHERE
    userId = NEW.id;

END;

CREATE TABLE
    mutation_requests (
        userId INTEGER NOT NULL REFERENCES users (id),
        requestKey TEXT NOT NULL,
        route TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        resourceId INTEGER NOT NULL,
        createdAt TEXT NOT NULL,
        PRIMARY KEY (userId, requestKey)
    );

CREATE TABLE
    runtime_secrets (
        name TEXT PRIMARY KEY,
        value TEXT NOT NULL CHECK (length (value) >= 32),
        createdAt TEXT NOT NULL
    );

PRAGMA optimize;
