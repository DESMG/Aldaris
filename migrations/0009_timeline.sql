ALTER TABLE issues ADD COLUMN stateReason TEXT CHECK (stateReason IN ('completed', 'not_planned'));

CREATE TABLE issue_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issueId INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    actorId INTEGER REFERENCES users(id),
    kind TEXT NOT NULL CHECK (kind IN ('status', 'priority', 'assignment', 'reply_edited', 'reply_deleted')),
    details TEXT NOT NULL CHECK (json_valid(details)),
    createdAt TEXT NOT NULL
);
CREATE INDEX issue_events_issue_time ON issue_events (issueId, createdAt, id);
