export type AnalyticsReview = {
  id: number;
  internalRef: string;
  title: string;
  priority: "normal" | "urgent" | "critical";
  dueDate: Date | string | null;
  createdAt: Date;
  completedAt: Date | null;
  operationTypeName: string;
  reviewerStatusName: string;
  reviewerTerminal: boolean;
  employeeStatusName: string;
  employeeTerminal: boolean;
  employeeId: number | null;
  employeeName: string | null;
};

function dayDifference(from: Date, to: Date) {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 86_400_000));
}

function isOverdue(review: AnalyticsReview, now: Date) {
  if (!review.dueDate || review.completedAt) return false;
  return new Date(`${review.dueDate}T23:59:59.999Z`).getTime() < now.getTime();
}

export function calculateOverview(reviews: AnalyticsReview[], returnedReviewIds: Set<number>, now = new Date()) {
  const completed = reviews.filter(review => Boolean(review.completedAt));
  const overdue = reviews.filter(review => isOverdue(review, now));
  const totalAge = reviews.reduce((sum, review) => sum + dayDifference(review.createdAt, review.completedAt ?? now), 0);
  const priorities = ["normal", "urgent", "critical"] as const;
  const priorityBreakdown = priorities.map(priority => ({ priority, count: reviews.filter(review => review.priority === priority).length }));
  const statusMap = new Map<string, number>();
  const employeeMap = new Map<number, { id: number; name: string; total: number; completed: number; overdue: number; ageTotal: number }>();
  const trend = new Map<string, { created: number; completed: number }>();
  for (const review of reviews) {
    statusMap.set(review.reviewerStatusName, (statusMap.get(review.reviewerStatusName) ?? 0) + 1);
    const month = review.createdAt.toISOString().slice(0, 7);
    const monthItem = trend.get(month) ?? { created: 0, completed: 0 };
    monthItem.created += 1;
    if (review.completedAt) monthItem.completed += 1;
    trend.set(month, monthItem);
    if (review.employeeId) {
      const current = employeeMap.get(review.employeeId) ?? { id: review.employeeId, name: review.employeeName || "موظف غير مسمى", total: 0, completed: 0, overdue: 0, ageTotal: 0 };
      current.total += 1;
      if (review.completedAt) current.completed += 1;
      if (isOverdue(review, now)) current.overdue += 1;
      current.ageTotal += dayDifference(review.createdAt, review.completedAt ?? now);
      employeeMap.set(review.employeeId, current);
    }
  }
  return {
    metrics: {
      total: reviews.length,
      completed: completed.length,
      completionRate: reviews.length ? Math.round((completed.length / reviews.length) * 100) : 0,
      averageAgeDays: reviews.length ? Number((totalAge / reviews.length).toFixed(1)) : 0,
      overdue: overdue.length,
      rework: returnedReviewIds.size,
    },
    priorityBreakdown,
    statusBreakdown: Array.from(statusMap, ([name, count]) => ({ name, count })),
    trend: Array.from(trend, ([month, values]) => ({ month, ...values })).sort((left, right) => left.month.localeCompare(right.month)),
    employeePerformance: Array.from(employeeMap.values()).map(employee => ({ ...employee, completionRate: employee.total ? Math.round((employee.completed / employee.total) * 100) : 0, averageAgeDays: employee.total ? Number((employee.ageTotal / employee.total).toFixed(1)) : 0 })).sort((left, right) => right.total - left.total),
  };
}

export function reportRows(reviews: AnalyticsReview[], returnedReviewIds: Set<number>, now = new Date()) {
  return reviews.map(review => ({
    reference: review.internalRef,
    title: review.title,
    operationType: review.operationTypeName,
    reviewerStatus: review.reviewerStatusName,
    employeeStatus: review.employeeStatusName,
    employee: review.employeeName || "غير مكلف",
    priority: review.priority,
    dueDate: review.dueDate,
    createdAt: review.createdAt,
    completedAt: review.completedAt,
    ageDays: dayDifference(review.createdAt, review.completedAt ?? now),
    overdue: isOverdue(review, now),
    rework: returnedReviewIds.has(review.id),
  }));
}
