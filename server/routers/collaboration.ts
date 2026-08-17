import { TRPCError } from "@trpc/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { reviewActivityLog, reviewComments, reviews, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { PERMISSIONS, requireFiscalYearAccess, requirePermission } from "../rbac";
import { protectedProcedure, router } from "../_core/trpc";
import { enforceReviewVisibility } from "./reviews";

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
  if (write && review.cancelledAt) throw new TRPCError({ code: "CONFLICT", message: "لا يمكن تعديل مراجعة ملغاة. استعدها أولًا." });
  return review;
}

export const commentsRouter = router({
  list: protectedProcedure.input(z.object({ reviewId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    await resolveReview(ctx.user, input.reviewId, false);
    const db = await database();
    return db.select({
      id: reviewComments.id,
      reviewId: reviewComments.reviewId,
      parentCommentId: reviewComments.parentCommentId,
      body: reviewComments.body,
      createdAt: reviewComments.createdAt,
      updatedAt: reviewComments.updatedAt,
      authorId: users.id,
      authorName: users.name,
    }).from(reviewComments).innerJoin(users, eq(reviewComments.createdByUserId, users.id)).where(and(eq(reviewComments.reviewId, input.reviewId), isNull(reviewComments.deletedAt))).orderBy(asc(reviewComments.createdAt));
  }),

  create: protectedProcedure.input(z.object({ reviewId: z.number().int().positive(), body: z.string().trim().min(1).max(8000), parentCommentId: z.number().int().positive().nullable().optional() })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx.user, PERMISSIONS.COMMENTS_CREATE);
    await resolveReview(ctx.user, input.reviewId, true);
    const db = await database();
    if (input.parentCommentId) {
      const [parent] = await db.select({ id: reviewComments.id }).from(reviewComments).where(and(eq(reviewComments.id, input.parentCommentId), eq(reviewComments.reviewId, input.reviewId), isNull(reviewComments.deletedAt))).limit(1);
      if (!parent) throw new TRPCError({ code: "BAD_REQUEST", message: "لا ينتمي التعليق الأب إلى هذه المراجعة." });
    }
    const result = await db.insert(reviewComments).values({ reviewId: input.reviewId, body: input.body, parentCommentId: input.parentCommentId ?? null, createdByUserId: ctx.user.id });
    const id = Number(result[0].insertId);
    await db.insert(reviewActivityLog).values({ reviewId: input.reviewId, actorUserId: ctx.user.id, action: input.parentCommentId ? "comment.replied" : "comment.created", metadata: { commentId: id } });
    return { id };
  }),
});

export const activityRouter = router({
  list: protectedProcedure.input(z.object({ reviewId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    await resolveReview(ctx.user, input.reviewId, false);
    const db = await database();
    return db.select({
      id: reviewActivityLog.id,
      action: reviewActivityLog.action,
      field: reviewActivityLog.field,
      beforeValue: reviewActivityLog.beforeValue,
      afterValue: reviewActivityLog.afterValue,
      metadata: reviewActivityLog.metadata,
      createdAt: reviewActivityLog.createdAt,
      actorId: users.id,
      actorName: users.name,
    }).from(reviewActivityLog).leftJoin(users, eq(reviewActivityLog.actorUserId, users.id)).where(eq(reviewActivityLog.reviewId, input.reviewId)).orderBy(asc(reviewActivityLog.createdAt));
  }),
});
