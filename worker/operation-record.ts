import type { OperationAction, User } from "../shared/types";

// Place immediately after the mutation whose changes() result is being recorded.
export function recordOperation(db: D1Database, actor: User, action: OperationAction, details: Record<string, string | number | boolean>) {
    return db.prepare(`
        INSERT INTO events (actorId, action, details, createdAt)
        SELECT ?, ?, ?, ? WHERE changes() > 0 AND ? = 'admin'
    `).bind(actor.id, action, JSON.stringify(details), new Date().toISOString(), actor.role);
}
