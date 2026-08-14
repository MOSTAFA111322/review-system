import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { CalendarDays, LockKeyhole, Plus, RotateCcw, Star } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

export default function FiscalYearSettings() {
  const { user } = useAuth();
  const canManage = Boolean(user?.permissions?.includes("*") || user?.permissions?.includes("fiscal_years.manage"));
  const utils = trpc.useUtils();
  const years = trpc.fiscalYears.list.useQuery(undefined, { enabled: canManage });
  const currentYear = new Date().getFullYear();
  const [name, setName] = useState(`السنة المالية ${currentYear}`);
  const [year, setYear] = useState(currentYear);
  const [startDate, setStartDate] = useState(`${currentYear}-01-01`);
  const [endDate, setEndDate] = useState(`${currentYear}-12-31`);
  const [makeCurrent, setMakeCurrent] = useState(true);
  const refresh = () => utils.fiscalYears.list.invalidate();
  const create = trpc.fiscalYears.create.useMutation({ onSuccess: async () => { await refresh(); toast.success("تم إنشاء السنة المالية."); }, onError: error => toast.error(error.message) });
  const setCurrent = trpc.fiscalYears.setCurrent.useMutation({ onSuccess: refresh, onError: error => toast.error(error.message) });
  const close = trpc.fiscalYears.close.useMutation({ onSuccess: refresh, onError: error => toast.error(error.message) });
  const reopen = trpc.fiscalYears.reopen.useMutation({ onSuccess: refresh, onError: error => toast.error(error.message) });

  if (!canManage) return null;
  return <section dir="rtl" className="mt-8 space-y-6 border-t border-slate-200 pt-8"><div><p className="text-sm font-semibold text-blue-700">إدارة النطاق المالي</p><h2 className="mt-1 text-xl font-bold text-slate-900">السنوات المالية</h2><p className="mt-2 text-sm leading-6 text-slate-500">كل مراجعة مرتبطة بسنة واحدة. إغلاق السنة يمنع التعديل على بياناتها في الخادم وواجهات API.</p></div><Card className="rounded-2xl border-blue-100"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Plus className="h-4 w-4 text-blue-700" />سنة مالية جديدة</CardTitle><CardDescription>استخدم تاريخ بداية ونهاية واضحين، ثم اجعلها السنة الحالية عند الحاجة.</CardDescription></CardHeader><CardContent className="grid gap-3 md:grid-cols-5"><Input value={name} onChange={event => setName(event.target.value)} placeholder="اسم السنة" /><Input type="number" value={year} onChange={event => setYear(Number(event.target.value))} min={2000} max={2200} /><Input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} /><Input type="date" value={endDate} onChange={event => setEndDate(event.target.value)} /><div className="flex flex-col gap-2"><label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={makeCurrent} onChange={event => setMakeCurrent(event.target.checked)} />اجعلها الحالية</label><Button disabled={!name.trim() || !startDate || !endDate || create.isPending} onClick={() => create.mutate({ name: name.trim(), year, startDate, endDate, makeCurrent })} className="bg-blue-700 hover:bg-blue-800">إنشاء السنة</Button></div></CardContent></Card><Card className="rounded-2xl"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="h-4 w-4 text-blue-700" />السنوات المعرفة</CardTitle><CardDescription>لا تحذف السنة التاريخية؛ أغلقها للحفاظ على المراجعات وسجل التدقيق.</CardDescription></CardHeader><CardContent className="space-y-2">{years.isLoading ? <p className="p-4 text-sm text-slate-500">جارٍ تحميل السنوات…</p> : years.data?.length ? years.data.map(item => <div key={item.id} className="flex flex-col justify-between gap-3 rounded-xl border border-slate-100 px-4 py-3 sm:flex-row sm:items-center"><div><p className="font-semibold text-slate-800">{item.name} {item.isCurrent ? <span className="mr-2 inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-700"><Star className="h-3 w-3" />الحالية</span> : null}</p><p className="mt-1 text-xs text-slate-500">{item.year} · {isoDate(new Date(item.startDate))} — {isoDate(new Date(item.endDate))}</p></div><div className="flex flex-wrap gap-2"><span className={`rounded-md px-2 py-1 text-xs ${item.status === "closed" ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-700"}`}>{item.status === "closed" ? "مغلقة" : "مفتوحة"}</span>{!item.isCurrent ? <Button size="sm" variant="outline" onClick={() => setCurrent.mutate({ id: item.id })}>تعيين الحالية</Button> : null}{item.status === "open" ? <Button size="sm" variant="outline" className="text-amber-700" onClick={() => close.mutate({ id: item.id })}><LockKeyhole className="ml-1 h-3.5 w-3.5" />إغلاق</Button> : <Button size="sm" variant="outline" className="text-emerald-700" onClick={() => reopen.mutate({ id: item.id })}><RotateCcw className="ml-1 h-3.5 w-3.5" />إعادة فتح</Button>}</div></div>) : <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">لا توجد سنة مالية بعد. أنشئ أول سنة لتبدأ استخدام لوحة المراجعات والتقارير.</p>}</CardContent></Card></section>;
}
