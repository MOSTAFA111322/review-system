import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, CheckCircle2, Clock3, RotateCcw, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const priorityLabels = { normal: "عادية", urgent: "مستعجلة", critical: "عاجلة" };
const priorityColors = { normal: "#60a5fa", urgent: "#f59e0b", critical: "#ef4444" };

type OverviewData = {
  metrics: { total: number; completed: number; completionRate: number; averageAgeDays: number; overdue: number; rework: number };
  priorityBreakdown: Array<{ priority: keyof typeof priorityLabels; count: number }>;
  statusBreakdown: Array<{ name: string; count: number }>;
  trend: Array<{ month: string; created: number; completed: number }>;
  employeePerformance: Array<{ id: number; name: string; total: number; completed: number; overdue: number; ageTotal: number; completionRate: number; averageAgeDays: number }>;
};

function MetricCard({ title, value, suffix, icon: Icon, tone }: { title: string; value: string | number; suffix?: string; icon: typeof CheckCircle2; tone: "blue" | "green" | "amber" | "red" | "violet" }) {
  const tones = { blue: "bg-blue-50 text-blue-700", green: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700", red: "bg-red-50 text-red-700", violet: "bg-violet-50 text-violet-700" };
  return <Card className="rounded-2xl border-slate-200/80 shadow-sm"><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm font-medium text-slate-500">{title}</p><p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{value}<span className="mr-1 text-sm font-medium text-slate-400">{suffix}</span></p></div><div className={`rounded-2xl p-3 ${tones[tone]}`}><Icon className="h-5 w-5" /></div></CardContent></Card>;
}

function DashboardCharts({ data }: { data: OverviewData }) {
  return <>
    <div className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
      <Card className="rounded-2xl"><CardHeader><CardTitle className="text-base">نشاط المراجعات</CardTitle><CardDescription>المنشأ والمكتمل عبر الأشهر.</CardDescription></CardHeader><CardContent className="h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.trend}><CartesianGrid vertical={false} stroke="#e2e8f0" /><XAxis dataKey="month" tickFormatter={value => value.slice(5)} tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} /><Tooltip cursor={{ fill: "#f8fafc" }} /><Legend /><Bar dataKey="created" name="منشأة" fill="#2563eb" radius={[5, 5, 0, 0]} /><Bar dataKey="completed" name="مكتملة" fill="#10b981" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></CardContent></Card>
      <Card className="rounded-2xl"><CardHeader><CardTitle className="text-base">توزيع الأولوية</CardTitle><CardDescription>تركيبة عبء العمل الحالي.</CardDescription></CardHeader><CardContent className="h-80"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data.priorityBreakdown} dataKey="count" nameKey="priority" innerRadius={60} outerRadius={95} paddingAngle={4}>{data.priorityBreakdown.map(item => <Cell key={item.priority} fill={priorityColors[item.priority]} />)}</Pie><Tooltip /><Legend formatter={value => priorityLabels[value as keyof typeof priorityLabels]} /></PieChart></ResponsiveContainer></CardContent></Card>
    </div>
    <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
      <Card className="rounded-2xl"><CardHeader><CardTitle className="text-base">حالات المراجع</CardTitle><CardDescription>التوزيع الحالي بحسب آخر حالة للمراجع.</CardDescription></CardHeader><CardContent className="space-y-3">{data.statusBreakdown.length ? data.statusBreakdown.map(status => <div key={status.name} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3"><span className="text-sm font-medium text-slate-700">{status.name}</span><Badge variant="secondary" className="bg-white text-slate-600">{status.count}</Badge></div>) : <p className="py-10 text-center text-sm text-slate-500">لا توجد مراجعات ضمن الفترة المحددة.</p>}</CardContent></Card>
      <Card className="rounded-2xl"><CardHeader><CardTitle className="text-base">أداء الموظفين</CardTitle><CardDescription>مؤشرات موزعة حسب الموظف المكلف.</CardDescription></CardHeader><CardContent className="overflow-x-auto p-0"><table className="w-full min-w-[560px] text-right text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-5 py-3 font-medium">الموظف</th><th className="px-4 py-3 font-medium">المراجعات</th><th className="px-4 py-3 font-medium">الإنجاز</th><th className="px-4 py-3 font-medium">المتأخر</th><th className="px-4 py-3 font-medium">متوسط العمر</th></tr></thead><tbody>{data.employeePerformance.length ? data.employeePerformance.map(employee => <tr key={employee.id} className="border-t border-slate-100"><td className="px-5 py-3.5 font-medium text-slate-700">{employee.name}</td><td className="px-4 py-3.5 text-slate-600">{employee.total}</td><td className="px-4 py-3.5 text-emerald-700">{employee.completionRate}%</td><td className="px-4 py-3.5 text-red-600">{employee.overdue}</td><td className="px-4 py-3.5 text-slate-600">{employee.averageAgeDays} يوم</td></tr>) : <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-500">لا توجد عمليات مكلّفة ضمن الفترة المحددة.</td></tr>}</tbody></table></CardContent></Card>
    </div>
  </>;
}

export default function Dashboard() {
  const years = trpc.fiscalYears.list.useQuery();
  const [fiscalYearId, setFiscalYearId] = useState<number | null>(null);
  useEffect(() => { if (!fiscalYearId && years.data?.length) setFiscalYearId(years.data.find(year => year.isCurrent)?.id ?? years.data[0].id); }, [fiscalYearId, years.data]);
  const overview = trpc.analytics.overview.useQuery({ fiscalYearId: fiscalYearId ?? 0 }, { enabled: Boolean(fiscalYearId) });
  const data = overview.data;
  if (!years.isLoading && !fiscalYearId) return <DashboardLayout><section dir="rtl" className="mx-auto flex min-h-[62vh] max-w-xl items-center"><Card className="w-full rounded-3xl border-blue-100 bg-gradient-to-br from-white to-blue-50/60 text-center shadow-sm"><CardContent className="p-10"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-700 text-white"><TrendingUp className="h-6 w-6" /></div><h1 className="mt-5 text-xl font-bold text-slate-900">لا توجد سنة مالية ضمن نطاقك</h1><p className="mt-3 leading-7 text-slate-500">تُعرض مؤشرات الأداء من بيانات السنة المالية التي يسمح لك النظام بالوصول إليها. اطلب من مدير النظام تهيئة السنة أو إضافتك إلى نطاقها.</p></CardContent></Card></section></DashboardLayout>;
  return <DashboardLayout><section dir="rtl" className="mx-auto max-w-7xl space-y-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold text-blue-700">نظرة تنفيذية</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">لوحة الأداء</h1><p className="mt-2 text-sm text-slate-500">مؤشرات حية محسوبة من المراجعات المتاحة ضمن نطاق صلاحيتك.</p></div><select aria-label="اختيار السنة المالية" value={fiscalYearId ?? ""} onChange={event => setFiscalYearId(Number(event.target.value))} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm">{years.data?.map(year => <option key={year.id} value={year.id}>{year.name}{year.isCurrent ? " — الحالية" : ""}</option>)}</select></div>{overview.isLoading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-32 animate-pulse rounded-2xl bg-slate-200" />)}</div> : overview.isError ? <Card className="rounded-2xl border-red-100 bg-red-50"><CardContent className="p-6 text-sm text-red-700">تعذر عرض لوحة الأداء. تأكد من امتلاك صلاحية التقارير والوصول إلى السنة المالية.</CardContent></Card> : data ? <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><MetricCard title="إجمالي المراجعات" value={data.metrics.total} icon={TrendingUp} tone="blue" /><MetricCard title="معدل الإنجاز" value={data.metrics.completionRate} suffix="%" icon={CheckCircle2} tone="green" /><MetricCard title="متوسط العمر" value={data.metrics.averageAgeDays} suffix="يوم" icon={Clock3} tone="violet" /><MetricCard title="المتأخرات" value={data.metrics.overdue} icon={AlertTriangle} tone="red" /><MetricCard title="إعادة العمل" value={data.metrics.rework} icon={RotateCcw} tone="amber" /></div><DashboardCharts data={data} /></> : null}</section></DashboardLayout>;
}
