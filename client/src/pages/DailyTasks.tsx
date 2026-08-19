import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { CalendarDays, CheckCircle2, ClipboardList, Clock3, FileText, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

function formatDate(value: Date | string | null) {
  if (!value) return "غير محدد";
  return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(new Date(value));
}

const statusLabels = { pending: "معلقة", in_progress: "قيد التنفيذ", completed: "مكتملة", skipped: "متجاوزة" } as const;
const priorityLabels = { normal: "عادية", urgent: "مستعجلة", critical: "عاجلة" } as const;

export default function DailyTasks() {
  const years = trpc.fiscalYears.list.useQuery();
  const [fiscalYearId, setFiscalYearId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<"pending" | "in_progress" | "completed" | "skipped" | undefined>();
  const [reportOpen, setReportOpen] = useState(false);
  const [reportEmployeeId, setReportEmployeeId] = useState<number | undefined>();
  const utils = trpc.useUtils();
  useEffect(() => {
    if (!fiscalYearId && years.data?.length) setFiscalYearId(years.data.find(year => year.isCurrent)?.id ?? years.data[0].id);
  }, [fiscalYearId, years.data]);
  const tasks = trpc.dailyTasks.list.useQuery({ fiscalYearId: fiscalYearId ?? 0, status: statusFilter }, { enabled: Boolean(fiscalYearId) });
  const report = trpc.dailyTasks.unifiedReport.useQuery({ fiscalYearId: fiscalYearId ?? 0, employeeId: reportEmployeeId }, { enabled: Boolean(fiscalYearId && reportOpen) });
  const updateStatus = trpc.dailyTasks.updateStatus.useMutation({ onSuccess: () => { utils.dailyTasks.list.invalidate(); utils.dailyTasks.unifiedReport.invalidate(); } });

  return <DashboardLayout><main dir="rtl" className="mx-auto max-w-7xl space-y-6">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><p className="text-sm font-semibold text-blue-700">التشغيل اليومي</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">المهام اليومية</h1><p className="mt-2 text-sm text-slate-500">المهام التشغيلية اليومية المرتبطة بالموظفين، منفصلة عن مهام المراجعات وقابلة للعرض في تقرير موحد.</p></div>
      <select aria-label="اختيار السنة المالية" value={fiscalYearId ?? ""} onChange={event => setFiscalYearId(Number(event.target.value))} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm">{years.data?.map(year => <option key={year.id} value={year.id}>{year.name}{year.isCurrent ? " — الحالية" : ""}</option>)}</select>
    </header>
    <div className="grid gap-4 sm:grid-cols-4"><Card className="rounded-2xl"><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-slate-500">إجمالي المهام</p><p className="mt-1 text-3xl font-bold text-slate-900">{tasks.data?.length ?? 0}</p></div><ClipboardList className="h-6 w-6 text-blue-700" /></CardContent></Card><Card className="rounded-2xl"><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-slate-500">معلقة</p><p className="mt-1 text-3xl font-bold text-amber-700">{tasks.data?.filter(task => task.status === "pending").length ?? 0}</p></div><Clock3 className="h-6 w-6 text-amber-600" /></CardContent></Card><Card className="rounded-2xl"><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-slate-500">قيد التنفيذ</p><p className="mt-1 text-3xl font-bold text-blue-700">{tasks.data?.filter(task => task.status === "in_progress").length ?? 0}</p></div><CalendarDays className="h-6 w-6 text-blue-600" /></CardContent></Card><Card className="rounded-2xl"><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-slate-500">مكتملة</p><p className="mt-1 text-3xl font-bold text-emerald-700">{tasks.data?.filter(task => task.status === "completed").length ?? 0}</p></div><CheckCircle2 className="h-6 w-6 text-emerald-600" /></CardContent></Card></div>
    <Card className="rounded-2xl"><CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle className="text-base">قائمة المهام التشغيلية</CardTitle><CardDescription>لا توجد مهام مصطنعة؛ ستظهر البيانات بعد الإدخال اليدوي أو استيراد ملفات Excel الفعلية.</CardDescription></div><div className="flex flex-wrap gap-2"><Button variant={statusFilter === undefined ? "default" : "outline"} onClick={() => setStatusFilter(undefined)}>الكل</Button>{Object.entries(statusLabels).map(([value, label]) => <Button key={value} variant={statusFilter === value ? "default" : "outline"} onClick={() => setStatusFilter(value as typeof statusFilter)}>{label}</Button>)}<Button variant="outline" onClick={() => setReportOpen(open => !open)}><FileText className="ml-2 h-4 w-4" />تقرير موحد</Button></div></CardHeader><CardContent>{tasks.isLoading ? <div className="flex items-center justify-center p-10 text-slate-500"><Loader2 className="ml-2 h-5 w-5 animate-spin" />جاري التحميل</div> : tasks.isError ? <p className="p-6 text-sm text-red-700">تعذر تحميل المهام. تحقق من صلاحية الوصول والسنة المالية.</p> : tasks.data?.length ? <div className="space-y-3">{tasks.data.map(task => <div key={task.id} className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 p-4 md:flex-row md:items-center"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-900">{task.title}</h3><Badge className="border-0 bg-slate-100 text-slate-700">{priorityLabels[task.priority]}</Badge><Badge className="border-0 bg-blue-50 text-blue-700">{task.employeeName}</Badge></div><p className="mt-2 text-sm text-slate-500">{formatDate(task.taskDate)}{task.dueTime ? ` · ${task.dueTime}` : ""}{task.source === "review" ? " · مرتبطة بمراجعة" : ""}</p></div><div className="flex flex-wrap items-center gap-2"><Badge className="border-0 bg-amber-50 text-amber-800">{statusLabels[task.status]}</Badge>{task.status !== "completed" && <Button size="sm" disabled={updateStatus.isPending} onClick={() => updateStatus.mutate({ id: task.id, status: task.status === "pending" ? "in_progress" : "completed" })}>{updateStatus.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : task.status === "pending" ? "بدء التنفيذ" : "إكمال المهمة"}</Button>}</div></div>)}</div> : <div className="p-10 text-center"><ClipboardList className="mx-auto h-10 w-10 text-slate-300" /><h2 className="mt-4 font-bold text-slate-800">لا توجد مهام تشغيلية بعد</h2><p className="mt-2 text-sm text-slate-500">عند إرسال ملفات Excel الفعلية سنجهز الاستيراد والمعاينة قبل إنشاء المهام.</p></div>}</CardContent></Card>
    {reportOpen && <Card className="rounded-2xl border-blue-100 bg-blue-50/30"><CardHeader><CardTitle className="text-base">التقرير الموحد</CardTitle><CardDescription>يجمع المهام اليومية ومهام المراجعات في نطاق السنة المالية المحددة، وفق صلاحيتك.</CardDescription></CardHeader><CardContent>{report.isLoading ? <div className="p-6 text-sm text-slate-500">جاري إعداد التقرير...</div> : report.isError ? <div className="p-6 text-sm text-red-700">تعذر إعداد التقرير الموحد.</div> : <div className="grid gap-4 md:grid-cols-2"><div className="rounded-2xl bg-white p-4"><h3 className="font-bold text-slate-800">المهام اليومية ({report.data?.dailyTasks.length ?? 0})</h3><p className="mt-2 text-sm text-slate-500">المهام التشغيلية المضافة للموظف أو الناتجة من القوالب.</p></div><div className="rounded-2xl bg-white p-4"><h3 className="font-bold text-slate-800">مهام المراجعات ({report.data?.reviews.length ?? 0})</h3><p className="mt-2 text-sm text-slate-500">المراجعات المسندة ضمن نطاق الصلاحية والسنة المالية.</p></div></div>}</CardContent></Card>}
  </main></DashboardLayout>;
}
