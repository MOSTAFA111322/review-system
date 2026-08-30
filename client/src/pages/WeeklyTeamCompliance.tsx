import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { jsPDF } from "jspdf";
import { AlertTriangle, Download, FileSpreadsheet, FileText, ShieldCheck, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const download = (content: string, name: string, type: string) => {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([content], { type }));
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
};

const escapeXml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

function downloadMonthlyPdf(data: { weekStart: string; weekEnd: string; summary: { total: number; completed: number; overdue: number; teamsAtRisk: number } }, rows: string[][]) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const canvasWidth = 1680;
  const canvasHeight = 1190;
  const margin = 64;
  const tableTop = 282;
  const rowHeight = 44;
  const header = rows[0] ?? [];
  const bodyRows = rows.slice(1);
  const pageCapacity = Math.max(1, Math.floor((canvasHeight - tableTop - 70) / rowHeight) - 1);
  const pages = Array.from({ length: Math.max(1, Math.ceil(bodyRows.length / pageCapacity)) }, (_, index) => bodyRows.slice(index * pageCapacity, (index + 1) * pageCapacity));

  pages.forEach((pageRows, pageIndex) => {
    if (pageIndex) doc.addPage();
    const canvas = document.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("تعذر تجهيز صفحة PDF.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvasWidth, canvasHeight);
    context.direction = "rtl";
    context.textAlign = "right";
    context.fillStyle = "#0f172a";
    context.font = "700 38px Arial";
    context.fillText("تقرير التزام الفرق الشهري", canvasWidth - margin, 78);
    context.fillStyle = "#475569";
    context.font = "400 20px Arial";
    context.fillText(`النطاق: ${data.weekStart} إلى ${data.weekEnd}`, canvasWidth - margin, 116);
    context.fillText("يُنشأ من بيانات المهام اليومية المتاحة وفق الصلاحيات والسنة المالية.", canvasWidth - margin, 148);

    const summaries = [["إجمالي المهام", String(data.summary.total), "#eff6ff", "#1d4ed8"], ["المكتملة", String(data.summary.completed), "#ecfdf5", "#047857"], ["المتأخرة", String(data.summary.overdue), "#fef2f2", "#b91c1c"], ["فرق تجاوزت العتبة", String(data.summary.teamsAtRisk), "#fff7ed", "#c2410c"]] as const;
    const summaryWidth = (canvasWidth - margin * 2 - 36) / summaries.length;
    summaries.forEach(([label, value, background, color], index) => {
      const x = canvasWidth - margin - (index + 1) * summaryWidth - index * 12;
      context.fillStyle = background;
      context.fillRect(x, 178, summaryWidth, 74);
      context.fillStyle = "#475569";
      context.font = "600 17px Arial";
      context.fillText(label, x + summaryWidth - 16, 205);
      context.fillStyle = color;
      context.font = "700 28px Arial";
      context.fillText(value, x + summaryWidth - 16, 238);
    });

    const columnWidth = (canvasWidth - margin * 2) / Math.max(header.length, 1);
    const drawRow = (values: string[], y: number, isHeader: boolean) => values.forEach((value, index) => {
      const x = margin + index * columnWidth;
      context.fillStyle = isHeader ? "#1d4ed8" : index % 2 ? "#f8fafc" : "#ffffff";
      context.fillRect(x, y, columnWidth, rowHeight);
      context.strokeStyle = "#cbd5e1";
      context.strokeRect(x, y, columnWidth, rowHeight);
      context.fillStyle = isHeader ? "#ffffff" : "#1e293b";
      context.font = isHeader ? "700 15px Arial" : "400 15px Arial";
      context.fillText(value, x + columnWidth - 10, y + 28, columnWidth - 20);
    });
    drawRow(header, tableTop, true);
    pageRows.forEach((row, rowIndex) => drawRow(row, tableTop + rowHeight * (rowIndex + 1), false));
    context.fillStyle = "#64748b";
    context.font = "400 16px Arial";
    context.fillText(`صفحة ${pageIndex + 1} من ${pages.length}`, canvasWidth - margin, canvasHeight - 36);
    doc.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 297, 210, undefined, "FAST");
  });
  doc.save(`التزام-الفرق-month-${data.weekStart}.pdf`);
}

export default function WeeklyTeamCompliance() {
  const years = trpc.fiscalYears.list.useQuery();
  const [fiscalYearId, setFiscalYearId] = useState<number | null>(null);
  const [weekStart, setWeekStart] = useState("");
  const [weekEnd, setWeekEnd] = useState("");
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [teamName, setTeamName] = useState("");

  useEffect(() => {
    if (!fiscalYearId && years.data?.length) setFiscalYearId(years.data.find(year => year.isCurrent)?.id ?? years.data[0].id);
  }, [fiscalYearId, years.data]);

  const periodLabel = period === "month" ? "شهري" : "أسبوعي";
  const periodDaysLabel = period === "month" ? "ثلاثين يومًا" : "سبعة أيام";
  const input = useMemo(() => ({ fiscalYearId: fiscalYearId ?? 0, period, ...(weekStart ? { weekStart } : {}), ...(weekEnd ? { weekEnd } : {}), ...(teamName ? { teamName } : {}) }), [fiscalYearId, period, teamName, weekEnd, weekStart]);
  const report = trpc.dailyTasks.weeklyTeamCompliance.useQuery(input, { enabled: Boolean(fiscalYearId) });
  const exported = trpc.dailyTasks.weeklyTeamComplianceExport.useQuery(input, { enabled: false });
  const teamOptions = useMemo(() => Array.from(new Set([...(report.data?.teams.map(team => team.teamName) ?? []), ...(teamName ? [teamName] : [])])).sort((a, b) => a.localeCompare(b, "ar")), [report.data?.teams, teamName]);

  const exportReport = async (kind: "csv" | "xls" | "pdf") => {
    try {
      if (kind === "pdf" && period !== "month") return toast.info("يتوفر تصدير PDF لتقرير الالتزام الشهري فقط.");
      const result = await exported.refetch();
      if (!result.data) return toast.error("تعذر تجهيز ملف التقرير. تحقق من صلاحية التصدير.");
      const data = result.data;
      if (!data.teams.length) return toast.info(`لا توجد مهام ضمن النطاق ${periodLabel} المحدد لتصديرها.`);
      const comparisonByTeam = new Map(data.comparison.map(item => [item.teamName, item]));
      const rows = [["الفريق", "إجمالي المهام", "المكتملة", "نسبة الإنجاز الحالية", "نسبة الإنجاز السابقة", "فرق الإنجاز", "المتأخرة الحالية", "المتأخرة السابقة", "فرق التأخر", "غير المحدثة", "عتبة التأخر", "تجاوز العتبة"], ...data.teams.map(team => {
        const comparison = comparisonByTeam.get(team.teamName);
        return [team.teamName, String(team.total), String(team.completed), `${team.completionRate}%`, `${comparison?.previousCompletionRate ?? 0}%`, `${comparison?.completionRateDelta ?? 0}%`, String(team.overdue), String(comparison?.previousOverdue ?? 0), String(comparison?.overdueDelta ?? 0), String(team.unupdated), String(team.threshold), team.exceedsThreshold ? "نعم" : "لا"];
      })];
      if (kind === "csv") {
        const csv = rows.map(row => row.map(value => `"${value.replaceAll('"', '""')}"`).join(",")).join("\n");
        download(`\uFEFF${csv}`, `التزام-الفرق-${period}-${data.weekStart}.csv`, "text/csv;charset=utf-8");
      } else if (kind === "pdf") downloadMonthlyPdf(data, rows);
      else {
        const cells = (row: string[]) => row.map(value => `<Cell><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`).join("");
        const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="التزام الفرق"><Table>${rows.map(row => `<Row>${cells(row)}</Row>`).join("")}</Table></Worksheet></Workbook>`;
        download(xml, `التزام-الفرق-${period}-${data.weekStart}.xls`, "application/vnd.ms-excel");
      }
      toast.success(`تم تصدير تقرير الالتزام ${periodLabel} بصيغة ${kind === "csv" ? "CSV" : kind === "pdf" ? "PDF" : "Excel"}.`);
    } catch {
      toast.error(`تعذر تصدير التقرير ${periodLabel}.`);
    }
  };

  return <DashboardLayout><section dir="rtl" className="weekly-compliance-print mx-auto max-w-7xl space-y-6">
    <div className="print-exclude flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-sm font-semibold text-blue-700">تقرير إداري</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">تقرير التزام الفرق {periodLabel}</h1><p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">يجمع الأداء الفعلي للمهام اليومية حسب قسم الموظف ضمن السنة المالية وصلاحياتك، ولا يعرض أسماء الموظفين أو بيانات خارج النطاق.</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => window.print()}><FileText className="h-4 w-4" />طباعة</Button><Button variant="outline" disabled={exported.isFetching || !report.data?.teams.length} onClick={() => exportReport("csv")}><Download className="h-4 w-4" />{period === "month" ? "CSV شهري" : "CSV"}</Button>{period === "month" ? <Button variant="outline" disabled={exported.isFetching || !report.data?.teams.length} onClick={() => exportReport("pdf")}><FileText className="h-4 w-4" />PDF شهري</Button> : null}<Button className="bg-emerald-700 hover:bg-emerald-800" disabled={exported.isFetching || !report.data?.teams.length} onClick={() => exportReport("xls")}><FileSpreadsheet className="h-4 w-4" />Excel</Button></div>
    </div>
    <Card className="print-exclude rounded-2xl border-blue-100 bg-blue-50/40 dark:border-blue-900/40 dark:bg-blue-950/20"><CardContent className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-6">
      <Field label="السنة المالية"><select aria-label="السنة المالية للتقرير" value={fiscalYearId ?? ""} onChange={event => { setFiscalYearId(Number(event.target.value)); setTeamName(""); }} className="field-select"><option value="" disabled>اختر السنة</option>{years.data?.map(year => <option key={year.id} value={year.id}>{year.name}</option>)}</select></Field>
      <Field label="فترة المقارنة"><select aria-label="فترة مقارنة الالتزام" value={period} onChange={event => { setPeriod(event.target.value as "week" | "month"); setWeekStart(""); setWeekEnd(""); }} className="field-select"><option value="week">أسبوعي — 7 أيام</option><option value="month">شهري — 30 يومًا</option></select></Field>
      <Field label="فريق العمل" hint="تُطبق التصفية على العرض والتصدير."><select aria-label="فريق العمل للتقرير" value={teamName} onChange={event => setTeamName(event.target.value)} className="field-select"><option value="">كل الفرق</option>{teamOptions.map(team => <option key={team} value={team}>{team}</option>)}</select></Field>
      <Field label="بداية النطاق" hint={`فارغ = آخر ${periodDaysLabel} منقضية ضمن السنة.`}><input aria-label="بداية نطاق التقرير" type="date" value={weekStart} onChange={event => setWeekStart(event.target.value)} className="field-select" /></Field>
      <Field label="نهاية النطاق" hint="اختر البداية والنهاية لتقرير مخصص قبل التصدير."><input aria-label="نهاية نطاق التقرير" type="date" value={weekEnd} min={weekStart || undefined} onChange={event => setWeekEnd(event.target.value)} className="field-select" /></Field>
      <div className="flex items-end"><Button variant="outline" className="w-full" onClick={() => { setWeekStart(""); setWeekEnd(""); setTeamName(""); }}>إعادة الضبط</Button></div>
    </CardContent></Card>
    {report.data ? <div className="hidden print:block print:pb-5"><h1 className="text-xl font-bold text-black">تقرير التزام الفرق {periodLabel}</h1><p className="mt-1 text-sm text-slate-700">النطاق من {report.data.weekStart} إلى {report.data.weekEnd}{teamName ? `؛ الفريق: ${teamName}` : "؛ جميع الفرق"}.</p></div> : null}
    {report.isLoading ? <Card className="rounded-2xl"><CardContent className="p-10 text-center text-sm text-slate-500">جارٍ إعداد تقرير التزام الفرق…</CardContent></Card> : report.isError ? <DeniedReport /> : report.data ? <ReportData data={report.data} period={period} teamName={teamName} /> : null}
  </section></DashboardLayout>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="space-y-1"><span className="block text-xs font-semibold text-slate-600 dark:text-slate-300">{label}</span>{children}{hint ? <span className="block text-xs text-slate-500">{hint}</span> : null}</label>;
}

function DeniedReport() {
  return <Card className="rounded-2xl border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30"><CardContent className="p-8 text-center"><AlertTriangle className="mx-auto h-7 w-7 text-red-600" /><p className="mt-3 font-semibold text-red-900 dark:text-red-100">لا يتوفر هذا التقرير لحسابك.</p><p className="mt-1 text-sm text-red-700 dark:text-red-200">يتطلب التقرير صلاحية عرض التقارير وإدارة المهام اليومية والوصول إلى السنة المحددة.</p></CardContent></Card>;
}

function ReportData({ data, period, teamName }: { data: { summary: { total: number; completed: number; overdue: number; unupdated: number; teamsAtRisk: number }; comparison: Array<{ teamName: string; completionRate: number; previousCompletionRate: number; completionRateDelta: number; overdue: number; previousOverdue: number; overdueDelta: number }>; previousWeekStart: string | null; previousWeekEnd: string | null; weekStart: string; weekEnd: string; teams: Array<{ teamName: string; total: number; completed: number; completionRate: number; overdue: number; unupdated: number; threshold: number; exceedsThreshold: boolean }> }, period: "week" | "month"; teamName: string }) {
  const periodLabel = period === "month" ? "شهري" : "أسبوعي";
  return <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><Metric label="إجمالي المهام" value={data.summary.total} /><Metric label="المكتملة" value={data.summary.completed} tone="green" /><Metric label="المتأخرة" value={data.summary.overdue} tone="red" /><Metric label="غير المحدثة" value={data.summary.unupdated} tone="amber" /><Metric label="فرق تجاوزت العتبة" value={data.summary.teamsAtRisk} tone="red" /></div><ComplianceComparisonChart comparison={data.comparison} previousWeekStart={data.previousWeekStart} previousWeekEnd={data.previousWeekEnd} period={period} /><Card className="overflow-hidden rounded-2xl"><CardHeader><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle className="flex items-center gap-2 text-base"><UsersRound className="h-4 w-4 text-blue-700" />التفاصيل حسب فريق العمل</CardTitle><CardDescription>النطاق من {data.weekStart} إلى {data.weekEnd}{teamName ? `؛ التصفية: ${teamName}` : "؛ الترتيب يبدأ بالفرق المتجاوزة للعتبة."}</CardDescription></div><span className="flex items-center gap-1 text-xs text-slate-500"><ShieldCheck className="h-4 w-4 text-emerald-600" />يطبق عزل السنة والصلاحيات في الخادم</span></div></CardHeader><CardContent className="overflow-x-auto p-0">{data.teams.length ? <table className="w-full min-w-[860px] text-right text-sm"><thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-900"><tr><th className="px-5 py-3">الفريق</th><th className="px-4 py-3">الإجمالي</th><th className="px-4 py-3">المكتملة</th><th className="px-4 py-3">نسبة الإنجاز</th><th className="px-4 py-3">المتأخرة</th><th className="px-4 py-3">غير المحدثة</th><th className="px-4 py-3">العتبة</th><th className="px-4 py-3">الحالة</th></tr></thead><tbody>{data.teams.map(team => <tr key={team.teamName} className="border-t border-slate-100 dark:border-slate-800"><td className="px-5 py-4 font-semibold text-slate-800 dark:text-slate-100">{team.teamName}</td><td className="px-4 py-4">{team.total}</td><td className="px-4 py-4 text-emerald-700 dark:text-emerald-300">{team.completed}</td><td className="px-4 py-4 font-semibold">{team.completionRate}%</td><td className="px-4 py-4 text-red-700 dark:text-red-300">{team.overdue}</td><td className="px-4 py-4 text-amber-700 dark:text-amber-300">{team.unupdated}</td><td className="px-4 py-4">{team.threshold}</td><td className="px-4 py-4">{team.exceedsThreshold ? <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800 dark:bg-red-950/50 dark:text-red-200">تجاوز العتبة</span> : <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">ضمن العتبة</span>}</td></tr>)}</tbody></table> : <div className="p-10 text-center text-sm text-slate-500">لا توجد مهام يومية ضمن النطاق {periodLabel} المحدد.</div>}</CardContent></Card></>;
}

function ComplianceComparisonChart({ comparison, previousWeekStart, previousWeekEnd, period }: { comparison: Array<{ teamName: string; completionRate: number; previousCompletionRate: number; completionRateDelta: number; overdue: number; previousOverdue: number; overdueDelta: number }>; previousWeekStart: string | null; previousWeekEnd: string | null; period: "week" | "month" }) {
  const [activeTeam, setActiveTeam] = useState<string | null>(null);
  const periodLabel = period === "month" ? "الشهر" : "الأسبوع";
  return <Card className="rounded-2xl border-violet-100 bg-violet-50/30 dark:border-violet-900/40 dark:bg-violet-950/20"><CardHeader><CardTitle className="text-base">مقارنة الإنجاز بـ{periodLabel} السابق</CardTitle><CardDescription>{previousWeekStart && previousWeekEnd ? `الأعمدة البنفسجية للفترة الحالية، والرمادية للفترة من ${previousWeekStart} إلى ${previousWeekEnd}. مرّر المؤشر فوق أي فريق أو ركّزه بلوحة المفاتيح لعرض تفاصيله الدقيقة.` : "لا توجد فترة سابقة مكتملة ضمن السنة المالية للمقارنة."}</CardDescription></CardHeader><CardContent>{previousWeekStart && comparison.length ? <div className="space-y-4" role="list" aria-label={`رسم مقارنة نسب إنجاز فرق العمل في ${periodLabel} الحالي والسابق`}>{comparison.map(item => <div key={item.teamName} role="listitem" tabIndex={0} aria-describedby={`comparison-detail-${item.teamName}`} onMouseEnter={() => setActiveTeam(item.teamName)} onMouseLeave={() => setActiveTeam(null)} onFocus={() => setActiveTeam(item.teamName)} onBlur={() => setActiveTeam(null)} className="relative rounded-xl border border-violet-100 bg-background p-3 outline-none transition focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-violet-900/40"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><p className="font-semibold text-slate-800 dark:text-slate-100">{item.teamName}</p><p className={`text-xs font-semibold ${item.completionRateDelta >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>{item.completionRateDelta >= 0 ? "+" : ""}{item.completionRateDelta}% إنجاز · {item.overdueDelta > 0 ? `+${item.overdueDelta} متأخرة` : item.overdueDelta < 0 ? `${item.overdueDelta} متأخرة` : "لا تغير في التأخر"}</p></div><div className="space-y-2 text-xs"><ProgressRow label="الحالي" value={item.completionRate} color="bg-violet-600" /><ProgressRow label="السابق" value={item.previousCompletionRate} color="bg-slate-400" /></div>{activeTeam === item.teamName ? <div id={`comparison-detail-${item.teamName}`} role="tooltip" className="mt-3 grid gap-2 rounded-lg border border-violet-200 bg-violet-50 p-3 text-xs text-violet-950 shadow-sm dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-100 sm:grid-cols-2"><p>الإنجاز الحالي: <strong>{item.completionRate}%</strong></p><p>الإنجاز السابق: <strong>{item.previousCompletionRate}%</strong></p><p>فرق الإنجاز: <strong>{item.completionRateDelta >= 0 ? "+" : ""}{item.completionRateDelta}%</strong></p><p>المتأخرة: <strong>{item.overdue}</strong> حاليًا مقابل <strong>{item.previousOverdue}</strong> سابقًا ({item.overdueDelta >= 0 ? "+" : ""}{item.overdueDelta})</p></div> : null}</div>)}</div> : <p className="rounded-xl border border-dashed border-violet-200 p-5 text-center text-sm text-slate-500 dark:border-violet-900/50">اختر نطاق {periodLabel} لاحقًا داخل السنة المالية لتظهر المقارنة مع الفترة السابقة.</p>}</CardContent></Card>;
}

function ProgressRow({ label, value, color }: { label: string; value: number; color: string }) {
  return <div className="flex items-center gap-3"><span className="w-14 shrink-0 text-slate-500">{label}</span><div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} /></div><span className="w-9 text-left font-bold text-slate-600 dark:text-slate-300">{value}%</span></div>;
}

function Metric({ label, value, tone = "blue" }: { label: string; value: number; tone?: "blue" | "green" | "red" | "amber" }) {
  const classes = { blue: "border-blue-100 bg-blue-50/50 text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200", green: "border-emerald-100 bg-emerald-50/50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200", red: "border-red-100 bg-red-50/50 text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200", amber: "border-amber-100 bg-amber-50/50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200" };
  return <Card className={`rounded-2xl ${classes[tone]}`}><CardContent className="p-4"><p className="text-xs font-medium opacity-80">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></CardContent></Card>;
}
