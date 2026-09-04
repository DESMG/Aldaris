CREATE TABLE issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    priority TEXT NOT NULL CHECK (priority IN ('Low', 'Medium', 'High')),
    status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Closed')),
    images TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(images)),
    createdAt TEXT NOT NULL
);

CREATE INDEX issues_status_id ON issues (status, id DESC);
