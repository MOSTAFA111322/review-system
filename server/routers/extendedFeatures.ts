import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { extname } from "node:path";
import { z } from "zod";
import { attachments, customFieldOptions, customFields, customFieldValues, notifications, operationTypeFields, operationTypes, reviewActivityLog, reviews, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { PERMISSIONS, requireFiscalYearAccess, requirePermission } from "../rbac";
import { storageGetSignedUrl, storagePut } from "../storage";
import { protectedProcedure, router } from "../_core/trpc";
import { enforceReviewVisibility } from "./reviews";

const fieldType = z.enum(["text", "number", "date", "select", "boolean"]);
const allowedMimeTypes = new Set([
  "application/pdf", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg", "image/png", "image/webp",
]);

const extensionsByMimeType: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};

function contentMatchesMimeType(bytes: Buffer, mimeType: string) {
  const startsWith = (...signature: number[]) => bytes.subarray(0, signature.length).every((byte, index) => byte === signature[index]);
  if (mimeType === "application/pdf") return bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  if (mimeType === "image/jpeg") return startsWith(0xff, 0xd8, 0xff);
  if (mimeType === "image/png") return startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  if (mimeType === "image/webp") return bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  if (mimeType === "application/vnd.ms-excel" || mimeType === "application/msword") return startsWith(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
  return startsWith(0x50, 0x4b, 0x03, 0x04);
}

async function database() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة حاليًا." });
  return db;
}

async function resolveReview(user: Parameters<typeof requirePermission>[0], reviewId: number, write = false) {
  const db = await database();
  const [review] = await db.select().from(reviews).where(and(eq(reviews.id, reviewId), isNull(reviews.deletedAt))).limit(1);
  if (!review) throw new TRPCError({ code: "NOT_FOUND", message: "المراجعة غير موجودة." });
  await requireFiscalYearAccess(user, review.fiscalYearId, write);
  await enforceReviewVisibility(user, review);
  return review;
}

export const customFieldsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    await requirePermission(ctx.user, PERMISSIONS.SETTINGS_MANAGE);
    const db = await database();
    const fields = await db.select().from(customFields).orderBy(asc(customFields.sortOrder), asc(customFields.label));
    const fieldIds = fields.map(field => field.id);
    if (!fieldIds.length) return [];
    const [options, mappings] = await Promise.all([
      db.select().from(customFieldOptions).where(inArray(customFieldOptions.customFieldId, fieldIds)).orderBy(asc(customFieldOptions.sortOrder)),
      db.select({ customFieldId: operationTypeFields.customFieldId, operationTypeId: operationTypeFields.operationTypeId, operationTypeName: operationTypes.name, isRequiredOverride: operationTypeFields.isRequiredOverride }).from(operationTypeFields).innerJoin(operationTypes, eq(operationTypeFields.operationTypeId, operationTypes.id)).where(inArray(operationTypeFields.customFieldId, fieldIds)),
    ]);
    return fields.map(field => ({ ...field, options: options.filter(option => option.customFieldId === field.id), operationTypes: mappings.filter(mapping => mapping.customFieldId === field.id) }));
  }),

  create: protectedProcedure.input(z.object({ key: z.string().trim().regex(/^[a-z][a-z0-9_]{1,79}$/), label: z.string().trim().min(2).max(160), type: fieldType, helpText: z.string().trim().max(1000).nullable().optional(), isRequired: z.boolean().default(false), sortOrder: z.number().int().min(0).max(10000).default(0) })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx.user, PERMISSIONS.SETTINGS_MANAGE);
    const db = await database();
    const result = await db.insert(customFields).values(input);
    return { id: Number(result[0].insertId) };
  }),

  update: protectedProcedure.input(z.object({ id: z.number().int().positive(), label: z.string().trim().min(2).max(160).optional(), helpText: z.string().trim().max(1000).nullable().optional(), isRequired: z.boolean().optional(), sortOrder: z.number().int().min(0).max(10000).optional() })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx.user, PERMISSIONS.SETTINGS_MANAGE);
    const db = await database();
    const { id, ...changes } = input;
    await db.update(customFields).set(changes).where(eq(customFields.id, id));
    return { success: true };
  }),

  setActive: protectedProcedure.input(z.object({ id: z.number().int().positive(), isActive: z.boolean() })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx.user, PERMISSIONS.SETTINGS_MANAGE);
    const db = await database();
    await db.update(customFields).set({ isActive: input.isActive }).where(eq(customFields.id, input.id));
    return { success: true };
  }),

  setOptions: protectedProcedure.input(z.object({ customFieldId: z.number().int().positive(), options: z.array(z.object({ label: z.string().trim().min(1).max(160), value: z.string().trim().min(1).max(160), sortOrder: z.number().int().min(0).max(10000).default(0), isActive: z.boolean().default(true) })).max(100) })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx.user, PERMISSIONS.SETTINGS_MANAGE);
    const db = await database();
    const [field] = await db.select().from(customFields).where(eq(customFields.id, input.customFieldId)).limit(1);
    if (!field || field.type !== "select") throw new TRPCError({ code: "BAD_REQUEST", message: "الخيارات متاحة للحقول من نوع قائمة فقط." });
    await db.transaction(async tx => {
      await tx.delete(customFieldOptions).where(eq(customFieldOptions.customFieldId, input.customFieldId));
      if (input.options.length) await tx.insert(customFieldOptions).values(input.options.map(option => ({ ...option, customFieldId: input.customFieldId })));
    });
    return { success: true };
  }),

  setOperationTypes: protectedProcedure.input(z.object({ customFieldId: z.number().int().positive(), mappings: z.array(z.object({ operationTypeId: z.number().int().positive(), isRequiredOverride: z.boolean().nullable().optional(), sortOrder: z.number().int().min(0).max(10000).default(0) })).max(100) })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx.user, PERMISSIONS.SETTINGS_MANAGE);
    const db = await database();
    await db.transaction(async tx => {
      await tx.delete(operationTypeFields).where(eq(operationTypeFields.customFieldId, input.customFieldId));
      if (input.mappings.length) await tx.insert(operationTypeFields).values(input.mappings.map(mapping => ({ ...mapping, customFieldId: input.customFieldId, isRequiredOverride: mapping.isRequiredOverride ?? null })));
    });
    return { success: true };
  }),

  values: router({
    list: protectedProcedure.input(z.object({ reviewId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const review = await resolveReview(ctx.user, input.reviewId);
      const db = await database();
      const fields = await db.select({ id: customFields.id, key: customFields.key, label: customFields.label, type: customFields.type, helpText: customFields.helpText, isRequired: customFields.isRequired, isRequiredOverride: operationTypeFields.isRequiredOverride, sortOrder: operationTypeFields.sortOrder }).from(operationTypeFields).innerJoin(customFields, eq(operationTypeFields.customFieldId, customFields.id)).where(and(eq(operationTypeFields.operationTypeId, review.operationTypeId), eq(customFields.isActive, true))).orderBy(asc(operationTypeFields.sortOrder));
      if (!fields.length) return [];
      const ids = fields.map(field => field.id);
      const [values, options] = await Promise.all([
        db.select().from(customFieldValues).where(and(eq(customFieldValues.reviewId, review.id), inArray(customFieldValues.customFieldId, ids))),
        db.select().from(customFieldOptions).where(and(inArray(customFieldOptions.customFieldId, ids), eq(customFieldOptions.isActive, true))).orderBy(asc(customFieldOptions.sortOrder)),
      ]);
      return fields.map(field => ({ ...field, isRequired: field.isRequiredOverride ?? field.isRequired, value: values.find(value => value.customFieldId === field.id)?.value ?? null, options: options.filter(option => option.customFieldId === field.id) }));
    }),
    set: protectedProcedure.input(z.object({ reviewId: z.number().int().positive(), values: z.array(z.object({ customFieldId: z.number().int().positive(), value: z.unknown() })).max(100) })).mutation(async ({ ctx, input }) => {
      await requirePermission(ctx.user, PERMISSIONS.REVIEWS_UPDATE);
      const review = await resolveReview(ctx.user, input.reviewId, true);
      const db = await database();
      const definitions = await db.select({ id: customFields.id, type: customFields.type, isRequired: customFields.isRequired, isRequiredOverride: operationTypeFields.isRequiredOverride }).from(operationTypeFields).innerJoin(customFields, eq(operationTypeFields.customFieldId, customFields.id)).where(and(eq(operationTypeFields.operationTypeId, review.operationTypeId), eq(customFields.isActive, true)));
      const definitionById = new Map(definitions.map(field => [field.id, field]));
      const valuesById = new Map(input.values.map(value => [value.customFieldId, value.value]));
      if (valuesById.size !== input.values.length || input.values.some(value => !definitionById.has(value.customFieldId))) throw new TRPCError({ code: "BAD_REQUEST", message: "أحد الحقول المخصصة غير مرتبط بنوع هذه المراجعة." });
      const selectFieldIds = definitions.filter(field => field.type === "select").map(field => field.id);
      const selectOptions = selectFieldIds.length ? await db.select({ customFieldId: customFieldOptions.customFieldId, value: customFieldOptions.value }).from(customFieldOptions).where(and(inArray(customFieldOptions.customFieldId, selectFieldIds), eq(customFieldOptions.isActive, true))) : [];
      const activeSelectValues = new Map<number, Set<string>>();
      for (const option of selectOptions) {
        const values = activeSelectValues.get(option.customFieldId) ?? new Set<string>();
        values.add(option.value);
        activeSelectValues.set(option.customFieldId, values);
      }
      for (const field of definitions) {
        const value = valuesById.get(field.id);
        const required = field.isRequiredOverride ?? field.isRequired;
        if (required && (value === null || value === undefined || value === "")) throw new TRPCError({ code: "BAD_REQUEST", message: "يرجى تعبئة جميع الحقول المخصصة الإلزامية." });
        if (value === null || value === undefined || value === "") continue;
        const valid = (field.type === "text" || field.type === "select") ? typeof value === "string" : field.type === "number" ? typeof value === "number" && Number.isFinite(value) : field.type === "date" ? typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) : typeof value === "boolean";
        if (!valid) throw new TRPCError({ code: "BAD_REQUEST", message: "قيمة أحد الحقول المخصصة لا تطابق نوع الحقل." });
        if (field.type === "select" && !activeSelectValues.get(field.id)?.has(String(value))) throw new TRPCError({ code: "BAD_REQUEST", message: "القيمة المحددة غير متاحة ضمن خيارات هذا الحقل." });
      }
      await db.transaction(async tx => {
        for (const entry of input.values) await tx.insert(customFieldValues).values({ reviewId: review.id, customFieldId: entry.customFieldId, value: entry.value }).onDuplicateKeyUpdate({ set: { value: entry.value } });
      });
      await db.insert(reviewActivityLog).values({ reviewId: review.id, actorUserId: ctx.user.id, action: "customFields.updated" });
      return { success: true };
    }),
  }),
});

export const attachmentsRouter = router({
  list: protectedProcedure.input(z.object({ reviewId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    await resolveReview(ctx.user, input.reviewId);
    const db = await database();
    return db.select({ id: attachments.id, fileName: attachments.fileName, mimeType: attachments.mimeType, sizeBytes: attachments.sizeBytes, createdAt: attachments.createdAt, uploadedByUserId: attachments.uploadedByUserId, uploadedByName: users.name }).from(attachments).innerJoin(users, eq(attachments.uploadedByUserId, users.id)).where(and(eq(attachments.reviewId, input.reviewId), isNull(attachments.deletedAt))).orderBy(asc(attachments.createdAt));
  }),

  upload: protectedProcedure.input(z.object({ reviewId: z.number().int().positive(), fileName: z.string().trim().min(1).max(255), mimeType: z.string().max(120), base64: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/).min(4).max(14_000_000) })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx.user, PERMISSIONS.ATTACHMENTS_MANAGE);
    const review = await resolveReview(ctx.user, input.reviewId, true);
    if (!allowedMimeTypes.has(input.mimeType)) throw new TRPCError({ code: "BAD_REQUEST", message: "صيغة الملف غير مدعومة. المسموح: PDF والصور وExcel وWord." });
    const extension = extname(input.fileName).toLowerCase();
    if (!extensionsByMimeType[input.mimeType]?.includes(extension)) throw new TRPCError({ code: "BAD_REQUEST", message: "امتداد الملف لا يتطابق مع نوعه المعلن." });
    const bytes = Buffer.from(input.base64, "base64");
    if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "حجم المرفق يجب أن يكون بين 1 بايت و10 ميجابايت." });
    if (!contentMatchesMimeType(bytes, input.mimeType)) throw new TRPCError({ code: "BAD_REQUEST", message: "محتوى الملف لا يتطابق مع نوعه المعلن." });
    const safeName = input.fileName.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 180);
    const uploaded = await storagePut(`reviews/${review.fiscalYearId}/${review.id}/${nanoid(14)}-${safeName}`, bytes, input.mimeType);
    const db = await database();
    const result = await db.insert(attachments).values({ reviewId: review.id, storageKey: uploaded.key, fileName: safeName, mimeType: input.mimeType, sizeBytes: bytes.length, uploadedByUserId: ctx.user.id });
    const id = Number(result[0].insertId);
    await db.insert(reviewActivityLog).values({ reviewId: review.id, actorUserId: ctx.user.id, action: "attachment.uploaded", metadata: { attachmentId: id, fileName: safeName } });
    return { id };
  }),

  getAccessUrl: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const db = await database();
    const [attachment] = await db.select().from(attachments).where(and(eq(attachments.id, input.id), isNull(attachments.deletedAt))).limit(1);
    if (!attachment) throw new TRPCError({ code: "NOT_FOUND", message: "المرفق غير موجود." });
    await resolveReview(ctx.user, attachment.reviewId);
    return { url: await storageGetSignedUrl(attachment.storageKey), fileName: attachment.fileName };
  }),

  remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx.user, PERMISSIONS.ATTACHMENTS_MANAGE);
    const db = await database();
    const [attachment] = await db.select().from(attachments).where(and(eq(attachments.id, input.id), isNull(attachments.deletedAt))).limit(1);
    if (!attachment) throw new TRPCError({ code: "NOT_FOUND", message: "المرفق غير موجود." });
    await resolveReview(ctx.user, attachment.reviewId, true);
    await db.update(attachments).set({ deletedAt: new Date() }).where(eq(attachments.id, input.id));
    await db.insert(reviewActivityLog).values({ reviewId: attachment.reviewId, actorUserId: ctx.user.id, action: "attachment.removed", metadata: { attachmentId: input.id, fileName: attachment.fileName } });
    return { success: true };
  }),
});

export const notificationsRouter = router({
  list: protectedProcedure.input(z.object({ unreadOnly: z.boolean().default(false) }).optional()).query(async ({ ctx, input }) => {
    const db = await database();
    const conditions = [eq(notifications.userId, ctx.user.id)];
    if (input?.unreadOnly) conditions.push(isNull(notifications.readAt));
    return db.select().from(notifications).where(and(...conditions)).orderBy(asc(notifications.createdAt));
  }),
  markRead: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await database();
    await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, input.id), eq(notifications.userId, ctx.user.id)));
    return { success: true };
  }),
  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await database();
    await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, ctx.user.id), isNull(notifications.readAt)));
    return { success: true };
  }),
});
