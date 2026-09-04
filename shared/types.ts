import type { AssignmentRole } from "./assignments";

export type User = { id: number; name: string; username: string; role: "user" | "admin" };
export type ManagedUser = User & { version: number };
export type Member = Pick<User, "id" | "name" | "username">;
export type Assignee = Member & { role: AssignmentRole };
export type IssueSummary = {
    id: number;
    title: string;
    priority: "Low" | "Medium" | "High";
    status: "Open" | "Closed";
    stateReason: "completed" | "not_planned" | null;
    createdAt: string;
    authorName: string | null;
    assignees: Pick<Assignee, "id" | "name" | "role">[];
};
export type Issue = Omit<IssueSummary, "assignees"> & {
    authorId: number | null; assignees: Assignee[];
    description: string; images: string[]; assignmentVersion: number; version: number;
};
export type Reply = {
    id: number; version: number; authorId: number; authorName: string;
    description: string; images: string[]; createdAt: string;
};
type Event = { id: number; actorName: string | null; createdAt: string };
type AssignmentSnapshot = { userId: number; role: AssignmentRole; name: string };
export type TimelineEntry = (Reply & { kind: "reply" })
    | (Event & { kind: "status"; details: { before: Issue["status"]; after: Issue["status"]; stateReason: Issue["stateReason"] } })
    | (Event & { kind: "priority"; details: { before: Issue["priority"]; after: Issue["priority"] } })
    | (Event & { kind: "reply_edited" | "reply_deleted"; details: { replyId: number } })
    | (Event & { kind: "assignment"; details: { before: AssignmentSnapshot[]; after: AssignmentSnapshot[] } });
export type LoginSession = { token: string; user: User; expiresAt: number };
export type Notification = {
    id: number; issueId: number; replyId: number | null; issueTitle: string; actorName: string;
    kind: "mention" | "assignment"; assignmentRole: AssignmentRole | null;
    createdAt: string; readAt: string | null;
};
export type NotificationsPage = { notifications: Notification[]; next: number | null };
export type OperationAction = "user_created" | "user_updated" | "user_deleted" | "password_reset" | "setup"
    | "issue_created" | "reply_created" | "reply_edited" | "reply_deleted" | "issue_status" | "issue_priority" | "issue_assignees";
export type OperationEvent = {
    id: number; actorId: number; actorName: string; targetId: number | null;
    action: OperationAction;
    details: Record<string, string | number | boolean>; createdAt: string;
};
