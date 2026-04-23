import { pgTable, uuid, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const mobileDevices = pgTable(
  "mobile_devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    deviceToken: text("device_token").notNull(),
    platform: text("platform").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    deviceTokenUniqueIdx: uniqueIndex("mobile_devices_device_token_idx").on(table.deviceToken),
    userIdIdx: index("mobile_devices_user_id_idx").on(table.userId),
    companyIdIdx: index("mobile_devices_company_id_idx").on(table.companyId),
  }),
);
