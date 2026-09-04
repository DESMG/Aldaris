CREATE TABLE runtime_secrets (
    name TEXT PRIMARY KEY,
    value TEXT NOT NULL CHECK (length(value) >= 32),
    createdAt TEXT NOT NULL
);
