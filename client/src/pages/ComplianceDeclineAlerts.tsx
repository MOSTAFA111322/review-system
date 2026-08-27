import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, CheckCircle2, Clock3, MessageSquareText, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type AlertStatus = "all" | "new" | "acknowledged";

const statusCopy = {
  new: { label: "بانتظار الإقرار", className: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200" },
  acknowledged: { label: "تم الإقرار", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200" },
};

export default function ComplianceDeclineAlerts() {
  const years = trpc.fiscalYears.list.useQuery();
  const utils = trpc.useUtils();
  const [fiscalYearId, setFiscalYearId] = useState<number | null>(null);
  const [filter, setFilter] = useState<AlertStatus>("all");
  const [notes, setNotes] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!fiscalYearId && years.data?.length) setFiscalYearId(years.data.find(year => year.isCurrent)?.id ?? years.data[0].id);
  }, [fiscalYearId, years.data]);

  const alerts = trpc.dailyTasks.complianceDeclineAlerts.list.useQuery({ fiscalYearId: fiscalYearId ?? 0, ...(filter === "all" ? {} : { status: filter }) }, { enabled: Boolean(fiscalYearId) });
  const acknowledge = trpc.dailyTasks.complianceDeclineAlerts.acknowledge.useMutation({
    onSuccess: () => {
      utils.dailyTasks.complianceDeclineAlerts.list.invalidate();
      toast.success("تم إقرار تنبيه التراجع وتسجيل المتابعة.");
    },
    onError: error => toast.error(error.message || "تعذر إقرار التنبيه."),
  });

  const handleAcknowledge = (id: number) => {
    const note = notes[id]?.trim();
    acknowledge.mutate({ id, ...(note ? { note } : {}) }, { onSuccess: () => setNotes(current => ({ ...current, [id]: "" })) });
  };

  return <DashboardLayout><section dir="rtl" className="mx-auto max-w-7xl space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-sm font-semibold text-violet-700">متابعة إدارية</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">سجل تنبيهات تراجع الالتزام</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">يعرض الوقائع الشهرية التي تجاوزت عتبة التراجع المعتمدة. يمكن للمدير توثيق الاستلام والملاحظة دون تعديل بيانات التقرير الأصلية.</p></div>
      <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" /><span className="text-xs font-semibold text-slate-500">محمي بالصلاحيات والسنة المالية</span></div>
    </div>

    <Card className="rounded-2xl border-violet-100 bg-violet-50/35 dark:border-violet-900/50 dark:bg-violet-950/20"><CardContent className="grid gap-3 p-5 md:grid-cols-3">
      <label className="space-y-1"><span className="block text-xs font-semibold text-slate-600 dark:text-slate-300">السنة المالية</span><select aria-label="السنة المالية لسجل التراجع" value={fiscalYearId ?? ""} onChange={event => setFiscalYearId(Number(event.target.value))} className="h-10 w-full rounded-xl border border-violet-200 bg-background px-3 text-sm dark:border-violet-900/50"><option value="" disabled>اختر السنة</option>{years.data?.map(year => <option key={year.id} value={year.id}>{year.name}</option>)}</select></label>
      <label className="space-y-1"><span className="block text-xs font-semibold text-slate-600 dark:text-slate-300">حالة المتابعة</span><select aria-label="حالة متابعة تنبيهات التراجع" value={filter} onChange={event => setFilter(event.target.value as AlertStatus)} className="h-10 w-full rounded-xl border border-violet-200 bg-background px-3 text-sm dark:border-violet-900/50"><option value="all">كل الحالات</option><option value="new">بانتظار الإقرار</option><option value="acknowledged">تم الإقرار</option></select></label>
      <div className="flex items-end"><Button variant="outline" className="w-full" onClick={() => alerts.refetch()} disabled={alerts.isFetching}><RefreshCw className={`h-4 w-4 ${alerts.isFetching ? "animate-spin" : ""}`} />تحديث السجل</Button></div>
    </CardContent></Card>

    {alerts.isLoading ? <Card className="rounded-2xl"><CardContent className="p-10 text-center text-sm text-slate-500">جارٍ تحميل سجل التنبيهات…</CardContent></Card> : alerts.isError ? <Card className="rounded-2xl border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30"><CardContent className="p-8 text-center"><AlertTriangle className="mx-auto h-7 w-7 text-red-600" /><p className="mt-3 font-semibold text-red-900 dark:text-red-100">لا يتوفر سجل التنبيهات لحسابك.</p><p className="mt-1 text-sm text-red-700 dark:text-red-200">يتطلب عرض السجل صلاحيات التقارير وإدارة المهام اليومية ضمن السنة المالية المحددة.</p></CardContent></Card> : alerts.data?.length ? <div className="space-y-4">{alerts.data.map(alert => <Card key={alert.id} className={`rounded-2xl ${alert.status === "new" ? "border-amber-200 dark:border-amber-900/50" : "border-emerald-100 dark:border-emerald-900/40"}`}><CardContent className="p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{alert.teamName}</h2><Badge className={statusCopy[alert.status].className}>{statusCopy[alert.status].label}</Badge><span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-200">تراجع {Math.abs(alert.completionRateDelta)} نقطة</span></div><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">النطاق من <strong>{new Date(alert.periodStart).toLocaleDateString("en-CA")}</strong> إلى <strong>{new Date(alert.periodEnd).toLocaleDateString("en-CA")}</strong> · سُجل في {new Date(alert.createdAt).toLocaleString("ar-SA")}</p><dl className="mt-4 grid gap-3 sm:grid-cols-4"><Detail label="الإنجاز الحالي" value={`${alert.completionRate}%`} /><Detail label="الإنجاز السابق" value={`${alert.previousCompletionRate}%`} /><Detail label="عتبة التراجع" value={`${alert.threshold}%`} /><Detail label="فرق الإنجاز" value={`${alert.completionRateDelta}%`} danger /></dl></div><div className="w-full lg:max-w-sm">{alert.status === "acknowledged" ? <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 text-sm dark:border-emerald-900/50 dark:bg-emerald-950/30"><p className="flex items-center gap-2 font-semibold text-emerald-800 dark:text-emerald-200"><CheckCircle2 className="h-4 w-4" />أقرّه {alert.acknowledgedByName || "مدير النظام"}</p><p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">{alert.acknowledgedAt ? new Date(alert.acknowledgedAt).toLocaleString("ar-SA") : ""}</p>{alert.acknowledgementNote ? <p className="mt-3 border-t border-emerald-100 pt-3 leading-6 text-emerald-950 dark:border-emerald-900/50 dark:text-emerald-100">{alert.acknowledgementNote}</p> : <p className="mt-3 text-xs text-emerald-700 dark:text-emerald-300">تم الإقرار دون ملاحظة.</p>}</div> : <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/50 dark:bg-amber-950/30"><label className="text-sm font-semibold text-amber-900 dark:text-amber-100">ملاحظة متابعة سريعة <span className="font-normal">(اختيارية)</span></label><Textarea aria-label={`ملاحظة متابعة تنبيه فريق ${alert.teamName}`} value={notes[alert.id] ?? ""} onChange={event => setNotes(current => ({ ...current, [alert.id]: event.target.value.slice(0, 1000) }))} placeholder="مثال: تمت مخاطبة الفريق ومراجعة أسباب التأخير." className="min-h-20 resize-y border-amber-200 bg-background dark:border-amber-900/50" /><div className="flex items-center justify-between gap-2"><span className="text-xs text-amber-700 dark:text-amber-300">{(notes[alert.id] ?? "").length}/1000</span><Button onClick={() => handleAcknowledge(alert.id)} disabled={acknowledge.isPending} className="bg-emerald-700 hover:bg-emerald-800"><CheckCircle2 className="h-4 w-4" />تأكيد الاستلام</Button></div></div>}</div></div></CardContent></Card>)}</div> : <Card className="rounded-2xl border-dashed"><CardContent className="p-10 text-center"><Clock3 className="mx-auto h-8 w-8 text-slate-400" /><p className="mt-3 font-semibold text-slate-700 dark:text-slate-200">لا توجد تنبيهات تراجع ضمن التصفية الحالية.</p><p className="mt-1 text-sm text-slate-500">ستظهر هنا الوقائع الجديدة عند انخفاض الالتزام وفق العتبة الإدارية المعتمدة.</p></CardContent></Card>}
  </section></DashboardLayout>;
}

function Detail({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return <div className="rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-slate-900/60"><dt className="text-xs text-slate-500">{label}</dt><dd className={`mt-1 text-base font-bold ${danger ? "text-red-700 dark:text-red-300" : "text-slate-800 dark:text-slate-100"}`}>{value}</dd></div>;
}
