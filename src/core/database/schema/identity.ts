import { pgTable, text, uuid, primaryKey, jsonb, index, boolean, timestamp } from "drizzle-orm/pg-core";
import { id, createdAt, updatedAt } from "./_shared";

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const roles = pgTable("roles", {
  id: id(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
});

export const permissions = pgTable("permissions", {
  id: id(),
  key: text("key").notNull().unique(),
  description: text("description"),
});

export const userRoles = pgTable("user_roles", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.userId, t.roleId] })]);

export const rolePermissions = pgTable("role_permissions", {
  roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  permissionId: uuid("permission_id").notNull().references(() => permissions.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })]);

export const auditLogs = pgTable("audit_logs", {
  id: id(),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  metadata: jsonb("metadata"),
  createdAt: createdAt(),
}, (t) => [index("audit_entity_idx").on(t.entityType, t.entityId), index("audit_created_idx").on(t.createdAt)]);

/**
 * Failed sign-in attempts, used by the login rate limiter (Release 2C). Only keyed HMAC hashes are
 * stored (see src/core/auth/throttle.ts), never the raw email or IP address.
 */
export const loginAttempts = pgTable("login_attempts", {
  id: id(),
  emailHash: text("email_hash").notNull(),
  ipHash: text("ip_hash").notNull(),
  createdAt: createdAt(),
}, (t) => [
  index("login_attempts_email_idx").on(t.emailHash, t.createdAt),
  index("login_attempts_ip_idx").on(t.ipHash, t.createdAt),
]);
