import type { AssignmentRole } from "./assignments";

export type User = { id: number; name: string; username: string; role: "user" | "admin" };
export type ManagedUser = User & { version: number };
export type Member = Pick<User, "id" | "name" | "username">;
export type Assignee = Member & { role: AssignmentRole };
export type Mention = {
    index: number; username: string; userId: number; name: string;
    currentUsername: string; role: User['role']; deletedAt: string | null;
};
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
    description: string; images: string[]; clearedImages: string[]; mentions: Mention[]; assignmentVersion: number; version: number;
};
export type Reply = {
    id: number; version: number; authorId: number; authorName: string;
    description: string; images: string[]; clearedImages: string[]; mentions: Mention[]; createdAt: string;
};
type Event = { id: number; actorName: string | null; createdAt: string };
type AssignmentSnapshot = { userId: number; role: AssignmentRole; name: string };
export type TimelineEntry = (Reply & { kind: "reply" })
    | (Event & { kind: "status"; details: { before: Issue["status"]; after: Issue["status"]; stateReason: Issue["stateReason"] } })
    | (Event & { kind: "priority"; details: { before: Issue["priority"]; after: Issue["priority"] } })
    | (Event & { kind: "reply_edited" | "reply_deleted"; details: { replyId: number } })
    | (Event & { kind: "assignment"; details: { before: AssignmentSnapshot[]; after: AssignmentSnapshot[] } });
export type LoginSession = { token: string; user: User; expiresAt: number };
export type OperationDetails = {
    user_created: { username: string; name: string; role: User["role"] };
    user_updated: { previousName: string; name: string; previousUsername: string; username: string; passwordChanged: false };
    user_deleted: { username: string; name: string };
    password_reset: { previousName: string; name: string; previousUsername: string; username: string; passwordChanged: true }
        | { userId: number; self: true };
    issue_created: { resourceId: number };
    reply_created: { resourceId: number };
    reply_edited: { replyId: number; issueId: number };
    reply_deleted: { replyId: number; issueId: number };
    issue_status: { issueId: number; value: Issue["status"] };
    issue_priority: { issueId: number; value: Issue["priority"] };
    issue_assignees: { issueId: number };
};
export type OperationAction = keyof OperationDetails;
type OperationEventBase = { id: number; actorId: number; actorName: string; targetId: number | null; createdAt: string };
export type OperationEvent = {
    [Action in OperationAction]: OperationEventBase & { action: Action; details: OperationDetails[Action] }
}[OperationAction];
