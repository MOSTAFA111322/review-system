import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { History, MonitorSmartphone, ShieldCheck } from "lucide-react";

const eventLabels = { login: "تسجيل دخول", logout: "تسجيل خروج", failed_login: "محاولة غير ناجحة" } as const;
const eventClasses = { login: "bg-emerald-50 text-emerald-700", logout: "bg-slate-100 text-slate-600", failed_login: "bg-red-50 text-red-700" } as const;

export default function Users() {
  const { user } = useAuth();
  const canManage = Boolean(user?.permissions?.includes("*") || user?.permissions?.includes("users.manage"));
  const activity = trpc.auth.activity.useQuery({ limit: 80 }, { enabled: canManage });
  if (!canManage) return <DashboardLayout><section dir="rtl" className="mx-auto max-w-4xl"><Card className="rounded-2xl"><CardContent className="p-8 text-center text-slate-500">ليس لديك صلاحية إدارة المستخدمين أو الاطلاع على السجل الأمني.</CardContent></Card></section></DashboardLayout>;

  return <DashboardLayout><section dir="rtl" className="mx-auto max-w-6xl space-y-6"><div className="flex items-start gap-3"><div className="mt-1 rounded-xl bg-blue-100 p-2 text-blue-700"><ShieldCheck className="h-5 w-5" /></div><div><p className="text-sm font-semibold text-blue-700">إدارة الوصول</p><h1 className="mt-1 text-2xl font-bold text-slate-900">سجل تسجيل الدخول</h1><p className="mt-2 text-sm leading-6 text-slate-500">سجل تدقيق خادمي لأحداث الدخول والخروج المرتبطة بالحسابات الموثقة في النظام.</p></div></div><Card className="overflow-hidden rounded-2xl"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4 text-blue-700" />آخر الأحداث</CardTitle><CardDescription>يقتصر الاطلاع على هذا السجل على المستخدمين المخولين بإدارة المستخدمين.</CardDescription></CardHeader><CardContent className="p-0">{activity.isLoading ? <p className="p-6 text-center text-sm text-slate-500">جارٍ تحميل السجل…</p> : activity.isError ? <p className="p-6 text-center text-sm text-red-600">تعذر تحميل السجل. أعد المحاولة لاحقًا.</p> : activity.data?.length ? <div className="divide-y divide-slate-100">{activity.data.map(item => <div key={item.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-center gap-3"><div className="rounded-lg bg-slate-100 p-2 text-slate-500"><MonitorSmartphone className="h-4 w-4" /></div><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{item.userName || "مستخدم النظام"}</p><p className="mt-1 truncate text-xs text-slate-400">{item.email || item.ipAddress || "عنوان غير متاح"}</p></div></div><div className="flex items-center justify-between gap-3 sm:justify-end"><time className="text-xs text-slate-500">{new Date(item.createdAt).toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" })}</time><Badge className={`border-0 ${eventClasses[item.event]}`}>{eventLabels[item.event]}</Badge></div></div>)}</div> : <p className="p-6 text-center text-sm text-slate-500">لا توجد أحداث مسجلة بعد.</p>}</CardContent></Card></section></DashboardLayout>;
}
