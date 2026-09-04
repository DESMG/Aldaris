ALTER TABLE issues ADD COLUMN assigneeId INTEGER REFERENCES users(id);
CREATE INDEX issues_assignee ON issues (assigneeId, id DESC);

CREATE TABLE notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actorId INTEGER NOT NULL REFERENCES users(id),
    issueId INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    replyId INTEGER REFERENCES replies(id) ON DELETE SET NULL,
    kind TEXT NOT NULL CHECK (kind IN ('mention', 'assignment')),
    source TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    readAt TEXT,
    UNIQUE (userId, kind, source)
);
CREATE INDEX notifications_user ON notifications (userId, id DESC);
CREATE INDEX notifications_unread ON notifications (userId, id DESC) WHERE readAt IS NULL;
