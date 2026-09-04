export const assignmentRoles = ["product", "development", "testing"] as const;
export type AssignmentRole = typeof assignmentRoles[number];
export const assignmentLabels = { product: "产品", development: "开发", testing: "测试" };
