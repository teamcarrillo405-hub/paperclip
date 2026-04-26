import type { Db } from "@paperclipai/db";
import {
  authUsers,
  companyMemberships,
  activityLog,
  auditLog,
  issues,
  companies,
} from "@paperclipai/db";
import { and, eq, count as drizzleCount, sql } from "drizzle-orm";

export type ErasureResult = {
  userId: string;
  tablesAffected: string[];
  rowsDeleted: number;
  completedAt: string;
};

export type UserDataExport = {
  userId: string;
  email: string;
  name: string;
  createdAt: string;
  companies: Array<{ id: string; name: string; role: string; joinedAt: string }>;
  issuesCreated: number;
  activityCount: number;
  exportedAt: string;
};

export async function eraseUserData(db: Db, userId: string): Promise<ErasureResult> {
  const tablesAffected: string[] = [];
  let rowsDeleted = 0;

  // 1. Anonymize the user record in auth.user
  const userUpdate = await db
    .update(authUsers)
    .set({
      email: `deleted-${userId}@erased.local`,
      name: "Deleted User",
      image: null,
    })
    .where(eq(authUsers.id, userId))
    .returning({ id: authUsers.id });

  if (userUpdate.length > 0) {
    tablesAffected.push("user");
    // Anonymization counts as 1 affected row (not a deletion, but tracked)
    rowsDeleted += userUpdate.length;
  }

  // 2. Delete from companyMemberships (principalId = userId, principalType = 'user')
  const membershipDeletes = await db
    .delete(companyMemberships)
    .where(
      and(
        eq(companyMemberships.principalType, "user"),
        eq(companyMemberships.principalId, userId),
      ),
    )
    .returning({ id: companyMemberships.id });

  if (membershipDeletes.length > 0) {
    tablesAffected.push("company_memberships");
    rowsDeleted += membershipDeletes.length;
  }

  // 3. Delete from activityLog where actorId = userId and actorType = 'user'
  const activityDeletes = await db
    .delete(activityLog)
    .where(
      and(eq(activityLog.actorType, "user"), eq(activityLog.actorId, userId)),
    )
    .returning({ id: activityLog.id });

  if (activityDeletes.length > 0) {
    tablesAffected.push("activity_log");
    rowsDeleted += activityDeletes.length;
  }

  // 4. Delete from auditLog where userId = userId
  const auditDeletes = await db
    .delete(auditLog)
    .where(eq(auditLog.userId, userId))
    .returning({ id: auditLog.id });

  if (auditDeletes.length > 0) {
    tablesAffected.push("audit_log");
    rowsDeleted += auditDeletes.length;
  }

  return {
    userId,
    tablesAffected,
    rowsDeleted,
    completedAt: new Date().toISOString(),
  };
}

export async function exportUserData(db: Db, userId: string): Promise<UserDataExport> {
  // Fetch user record
  const [user] = await db.select().from(authUsers).where(eq(authUsers.id, userId)).limit(1);
  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  // Fetch company memberships with company info
  const memberships = await db
    .select({
      companyId: companyMemberships.companyId,
      membershipRole: companyMemberships.membershipRole,
      joinedAt: companyMemberships.createdAt,
      companyName: companies.name,
    })
    .from(companyMemberships)
    .leftJoin(companies, eq(companies.id, companyMemberships.companyId))
    .where(
      and(
        eq(companyMemberships.principalType, "user"),
        eq(companyMemberships.principalId, userId),
      ),
    );

  const companiesData = memberships.map((m) => ({
    id: m.companyId,
    name: m.companyName ?? "Unknown",
    role: m.membershipRole ?? "member",
    joinedAt:
      m.joinedAt instanceof Date ? m.joinedAt.toISOString() : String(m.joinedAt),
  }));

  // Count issues created by user
  const [issueRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(issues)
    .where(eq(issues.createdByUserId, userId));
  const issuesCreated = Number(issueRow?.total ?? 0);

  // Count activity log entries for user
  const [activityRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(activityLog)
    .where(and(eq(activityLog.actorType, "user"), eq(activityLog.actorId, userId)));
  const activityCount = Number(activityRow?.total ?? 0);

  return {
    userId,
    email: user.email,
    name: user.name,
    createdAt:
      user.createdAt instanceof Date ? user.createdAt.toISOString() : String(user.createdAt),
    companies: companiesData,
    issuesCreated,
    activityCount,
    exportedAt: new Date().toISOString(),
  };
}

// logGDPRAction requires a companyId for the auditLog schema — we use a sentinel
// company value ("gdpr-system") since GDPR ops are instance-level, not per-company.
// When the calling route has a real companyId in context it should pass it through.
export async function logGDPRAction(
  db: Db,
  action: "erasure" | "export" | "consent",
  userId: string,
  requestedBy: string,
  companyId = "00000000-0000-0000-0000-000000000000",
): Promise<void> {
  await db.insert(auditLog).values({
    companyId,
    userId: requestedBy,
    action: `gdpr.${action}`,
    resource: "user",
    resourceId: userId,
    details: {
      targetUserId: userId,
      requestedBy,
      action,
      timestamp: new Date().toISOString(),
    },
    outcome: "success",
    riskLevel: "high",
    piiDetected: false,
  });
}
