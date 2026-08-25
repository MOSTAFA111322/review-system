import { inArray } from "drizzle-orm";
import { userPreferences } from "../drizzle/schema";
import { getDb } from "./db";

type PreferenceRecord = Record<string, unknown>;
type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

function asRecord(value: unknown): PreferenceRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as PreferenceRecord : {};
}

/** يعيد وقت انتهاء الكتم فقط إذا كان قيمة ISO صحيحة. */
export function readNotificationMuteUntil(value: unknown): Date | null {
  const muteUntil = asRecord(value).notificationMuteUntil;
  if (typeof muteUntil !== "string") return null;
  const parsed = new Date(muteUntil);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isNotificationMuted(value: unknown, referenceDate = new Date()) {
  const muteUntil = readNotificationMuteUntil(value);
  return Boolean(muteUntil && muteUntil.getTime() > referenceDate.getTime());
}

/** يحدّد الحسابات المكتومة حاليًا كي لا ينتج الخادم تنبيهات جديدة لها. */
export async function findMutedUserIds(db: Database, userIds: number[], referenceDate = new Date()) {
  const uniqueUserIds = Array.from(new Set(userIds));
  if (!uniqueUserIds.length) return new Set<number>();
  const rows = await db.select({ userId: userPreferences.userId, preferences: userPreferences.preferences })
    .from(userPreferences)
    .where(inArray(userPreferences.userId, uniqueUserIds));
  return new Set(rows.filter(row => isNotificationMuted(row.preferences, referenceDate)).map(row => row.userId));
}
