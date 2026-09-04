CREATE TABLE issue_assignees (
    issueId INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('product', 'development', 'testing')),
    PRIMARY KEY (issueId, role, userId)
);
CREATE INDEX issue_assignees_user ON issue_assignees (userId, issueId);

INSERT INTO issue_assignees (issueId, userId, role)
SELECT issues.id, users.id, 'development' FROM issues JOIN users ON users.id = issues.assigneeId WHERE users.deletedAt IS NULL;
DROP INDEX issues_assignee;
ALTER TABLE issues DROP COLUMN assigneeId;

ALTER TABLE notifications ADD COLUMN assignmentRole TEXT CHECK (assignmentRole IN ('product', 'development', 'testing'));
