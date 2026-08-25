export type DashboardPeriodPreset = "fiscalYear" | "last7" | "last30" | "custom";

export type DashboardDateRange = {
  startDate?: string;
  endDate?: string;
  label: string;
  isValid: boolean;
  error?: string;
};

type DateLike = Date | string | null | undefined;

export const OVERDUE_TASK_ESCALATION_THRESHOLD = 3;

export const dashboardPeriodOptions: Array<{ value: DashboardPeriodPreset; label: string }> = [
  { value: "fiscalYear", label: "السنة كاملة" },
  { value: "last7", label: "آخر 7 أيام" },
  { value: "last30", label: "آخر 30 يومًا" },
  { value: "custom", label: "فترة مخصصة" },
];

export function toDateInput(value: DateLike) {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
}

function addDays(dateText: string, days: number) {
  const date = new Date(`${dateText}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateInput(date)!;
}

function invalid(error: string): DashboardDateRange {
  return { label: "فترة غير صالحة", isValid: false, error };
}

export function resolveDashboardDateRange({
  preset,
  customStartDate,
  customEndDate,
  fiscalStartDate,
  fiscalEndDate,
  now = new Date(),
}: {
  preset: DashboardPeriodPreset;
  customStartDate: string;
  customEndDate: string;
  fiscalStartDate: DateLike;
  fiscalEndDate: DateLike;
  now?: Date;
}): DashboardDateRange {
  const fiscalStart = toDateInput(fiscalStartDate);
  const fiscalEnd = toDateInput(fiscalEndDate);
  if (!fiscalStart || !fiscalEnd) return invalid("تعذر تحديد نطاق السنة المالية المختارة.");
  if (fiscalStart > fiscalEnd) return invalid("نطاق السنة المالية غير صحيح.");

  if (preset === "fiscalYear") return { startDate: fiscalStart, endDate: fiscalEnd, label: "السنة المالية كاملة", isValid: true };

  if (preset === "custom") {
    if (!customStartDate || !customEndDate) return invalid("حدد تاريخ البداية والنهاية للفترة المخصصة.");
    if (customStartDate > customEndDate) return invalid("يجب أن يسبق تاريخ البداية تاريخ النهاية.");
    if (customStartDate < fiscalStart || customEndDate > fiscalEnd) return invalid("يجب أن تقع الفترة المخصصة ضمن السنة المالية المختارة.");
    return { startDate: customStartDate, endDate: customEndDate, label: "فترة مخصصة", isValid: true };
  }

  const today = toDateInput(now)!;
  const endDate = today < fiscalEnd ? today : fiscalEnd;
  const days = preset === "last7" ? 6 : 29;
  const startDate = addDays(endDate, -days) < fiscalStart ? fiscalStart : addDays(endDate, -days);
  return { startDate, endDate, label: preset === "last7" ? "آخر 7 أيام" : "آخر 30 يومًا", isValid: true };
}

export type DailyDelayAlert = {
  tone: "clear" | "monitor" | "escalate";
  title: string;
  description: string;
};

export function getDailyDelayAlert(overdue: number, unupdated: number, configuredThreshold = OVERDUE_TASK_ESCALATION_THRESHOLD): DailyDelayAlert {
  const threshold = Number.isFinite(configuredThreshold) && configuredThreshold >= 1 ? Math.floor(configuredThreshold) : OVERDUE_TASK_ESCALATION_THRESHOLD;
  if (overdue >= threshold) {
    return {
      tone: "escalate",
      title: "تجاوز حد التأخير التشغيلي",
      description: `${overdue} مهام متأخرة تجاوزت عتبة التصعيد (${threshold} مهام).`,
    };
  }
  if (overdue > 0 || unupdated > 0) {
    return {
      tone: "monitor",
      title: "تحتاج متابعة تشغيلية",
      description: `${overdue} مهام متأخرة و${unupdated} مهام بلا تحديث.`,
    };
  }
  return { tone: "clear", title: "لا توجد متأخرات تشغيلية", description: "لا توجد مهام متأخرة أو بلا تحديث ضمن الفترة المعروضة." };
}
