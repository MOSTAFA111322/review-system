import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardList, Clock3 } from "lucide-react";
import { Link } from "wouter";
import { useEffect, useState } from "react";

function formatDate(value: Date | string | null) {
  if (!value) return "غير محدد";
  return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(new Date(value));
}

function dueLabel(value: Date | string | null) {
  if (!value) return { text: "دون تاريخ استحقاق", className: "bg-slate-100 text-slate-600" };
  const due = new Date(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (days < 0) return { text: `متأخرة ${Math.abs(days)} ${Math.abs(days) === 1 ? "يوم" : "أيام"}`, className: "bg-red-100 text-red-700" };
  if (days === 0) return { text: "مستحقة اليوم", className: "bg-amber-100 text-amber-800" };
  if (days <= 3) return { text: `خلال ${days} ${days === 1 ? "يوم" : "أيام"}`, className: "bg-orange-100 text-orange-800" };
  return { text: "ضمن الموعد", className: "bg-emerald-100 text-emerald-700" };
}

export default function MyTasks() {
  const years = trpc.fiscalYears.list.useQuery();
  const [fiscalYearId, setFiscalYearId] = useState<number | null>(null);
  useEffect(() => {
    if (!fiscalYearId && years.data?.length) setFiscalYearId(years.data.find(year => year.isCurrent)?.id ?? years.data[0].id);
  }, [fiscalYearId, years.data]);
  const tasks = trpc.reviews.myTasks.useQuery({ fiscalYearId: fiscalYearId ?? 0 }, { enabled: Boolean(fiscalYearId) });

  return <DashboardLayout><main dir="rtl" className="mx-auto max-w-6xl space-y-6">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><p className="text-sm font-semibold text-blue-700">مساحة العمل الشخصية</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">مهامي</h1><p className="mt-2 text-sm text-slate-500">المراجعات المفتوحة المسندة إليك فقط، مرتبة حسب أقرب استحقاق.</p></div>
      <select aria-label="اختيار السنة المالية" value={fiscalYearId ?? ""} onChange={event => setFiscalYearId(Number(event.target.value))} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm">{years.data?.map(year => <option key={year.id} value={year.id}>{year.name}{year.isCurrent ? " — الحالية" : ""}</option>)}</select>
    </header>
    {tasks.isLoading ? <div className="grid gap-4 sm:grid-cols-3">{[1, 2, 3].map(item => <div key={item} className="h-28 animate-pulse rounded-2xl bg-slate-200" />)}</div> : tasks.isError ? <Card className="rounded-2xl border-red-100 bg-red-50"><CardContent className="p-6 text-sm text-red-700">تعذر تحميل مهامك. تحقق من صلاحية الوصول إلى المراجعات المسندة.</CardContent></Card> : <>
      <div className="grid gap-4 sm:grid-cols-3"><Card className="rounded-2xl"><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-slate-500">إجمالي مهامي</p><p className="mt-1 text-3xl font-bold text-slate-900">{tasks.data?.total ?? 0}</p></div><ClipboardList className="h-6 w-6 text-blue-700" /></CardContent></Card><Card className="rounded-2xl"><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-slate-500">متأخرة</p><p className="mt-1 text-3xl font-bold text-red-700">{tasks.data?.overdue ?? 0}</p></div><AlertTriangle className="h-6 w-6 text-red-600" /></CardContent></Card><Card className="rounded-2xl"><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-slate-500">قريبة الاستحقاق</p><p className="mt-1 text-3xl font-bold text-orange-700">{tasks.data?.dueSoon ?? 0}</p></div><CalendarClock className="h-6 w-6 text-orange-600" /></CardContent></Card></div>
      {!tasks.data?.employee ? <Card className="rounded-2xl"><CardContent className="p-10 text-center"><ClipboardList className="mx-auto h-10 w-10 text-slate-300" /><h2 className="mt-4 font-bold text-slate-800">لا يوجد ملف موظف مرتبط بحسابك</h2><p className="mt-2 text-sm text-slate-500">اطلب من مدير النظام ربط حسابك بملف الموظف الصحيح.</p></CardContent></Card> : tasks.data.items.length === 0 ? <Card className="rounded-2xl"><CardContent className="p-10 text-center"><CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" /><h2 className="mt-4 font-bold text-slate-800">لا توجد مهام مفتوحة</h2><p className="mt-2 text-sm text-slate-500">أحسنت، لا توجد مراجعات مفتوحة مسندة إليك في هذه السنة.</p></CardContent></Card> : <Card className="rounded-2xl"><CardHeader><CardTitle className="text-base">قائمة المهام</CardTitle><CardDescription>لا تشمل الأرشيف أو العمليات الملغاة أو المحذوفة.</CardDescription></CardHeader><CardContent className="space-y-3">{tasks.data.items.map(task => { const due = dueLabel(task.dueDate); return <Link key={task.id} href={`/reviews/${task.id}`} className="block rounded-2xl border border-slate-200 p-4 transition hover:border-blue-300 hover:bg-blue-50/40 focus:outline-none focus:ring-2 focus:ring-blue-500"><div className="flex flex-col justify-between gap-3 md:flex-row md:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-bold text-blue-700">{task.internalRef}</span><Badge className="border-0 bg-slate-100 text-slate-700">{task.priority === "critical" ? "عاجلة" : task.priority === "urgent" ? "مستعجلة" : "عادية"}</Badge></div><h3 className="mt-2 font-semibold text-slate-900">{task.title}</h3><p className="mt-1 text-sm text-slate-500">{task.operationTypeName} · حالة الموظف: {task.employeeStatusName}</p></div><div className="flex shrink-0 items-center gap-3"><Badge className={`border-0 ${due.className}`}>{due.text}</Badge><span className="flex items-center gap-1 text-xs text-slate-500"><Clock3 className="h-3.5 w-3.5" />{formatDate(task.dueDate)}</span></div></div></Link>; })}</CardContent></Card>}
    </>}
  </main></DashboardLayout>;
}
