import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "@/lib/aws/clients";
import { config } from "@/lib/config";

/**
 * Platform roles.
 *
 * "student" is the default and needs no stored record. "mentor" and "admin"
 * are assigned to a user's PROFILE item by scripts/set-role.ts. Role checks
 * run on the Node runtime only (API routes and server components); middleware
 * stays role-free because the AWS SDK is not available on the edge runtime.
 */
export type UserRole = "student" | "mentor" | "admin";

export const USER_ROLES: readonly UserRole[] = ["student", "mentor", "admin"];

export function isUserRole(value: unknown): value is UserRole {
  return value === "student" || value === "mentor" || value === "admin";
}

/** Read the user's role from their profile item. Defaults to "student". */
export async function getRole(userId: string): Promise<UserRole> {
  try {
    const res = await ddb().send(
      new GetCommand({
        TableName: config.storage.tableName,
        Key: { PK: `USER#${userId}`, SK: "PROFILE" },
        ProjectionExpression: "#r",
        ExpressionAttributeNames: { "#r": "role" },
      }),
    );
    return isUserRole(res.Item?.role) ? (res.Item.role as UserRole) : "student";
  } catch {
    // A role lookup failure must never block a student.
    return "student";
  }
}

/** Check-and-return helper for API routes and server components. */
export async function hasRole(userId: string, ...allowed: UserRole[]): Promise<boolean> {
  const role = await getRole(userId);
  return allowed.includes(role);
}
