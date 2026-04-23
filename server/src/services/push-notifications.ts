import type { Db } from "@paperclipai/db";
import { mobileDevices } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import { logger } from "../middleware/logger.js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  sound?: "default";
  data?: Record<string, unknown>;
  priority?: "default" | "normal" | "high";
}

export function pushNotificationService(db: Db) {
  async function getTokensForCompany(companyId: string): Promise<string[]> {
    const rows = await db
      .select({ deviceToken: mobileDevices.deviceToken })
      .from(mobileDevices)
      .where(eq(mobileDevices.companyId, companyId));
    return rows.map((r) => r.deviceToken).filter((t): t is string => typeof t === "string" && t.length > 0);
  }

  async function sendPushNotification(
    companyId: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<{ sent: number; failed: number }> {
    const tokens = await getTokensForCompany(companyId);
    if (tokens.length === 0) {
      return { sent: 0, failed: 0 };
    }

    const messages: ExpoPushMessage[] = tokens.map((to) => ({
      to,
      title,
      body,
      sound: "default",
      priority: "high",
      data: data ?? {},
    }));

    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
        },
        body: JSON.stringify(messages),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "<no body>");
        logger.warn({ status: res.status, text, companyId }, "push-notifications: Expo API returned non-OK");
        return { sent: 0, failed: tokens.length };
      }
      return { sent: tokens.length, failed: 0 };
    } catch (err) {
      logger.error({ err, companyId }, "push-notifications: failed to deliver to Expo");
      return { sent: 0, failed: tokens.length };
    }
  }

  return {
    sendPushNotification,
    getTokensForCompany,
  };
}

export type PushNotificationService = ReturnType<typeof pushNotificationService>;
