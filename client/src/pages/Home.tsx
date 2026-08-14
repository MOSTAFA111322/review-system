import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import DashboardLayout from "@/components/DashboardLayout";
import ReviewBoard from "@/pages/ReviewBoard";
import { trpc } from "@/lib/trpc";
import { Loader2, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

/**
 * All content in this page are only for example, replace with your own feature implementation
 * When building pages, remember your instructions in Frontend Workflow, Frontend Best Practices, Design Guide and Common Pitfalls
 */
export default function Home() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();
  const years = trpc.fiscalYears.list.useQuery(undefined, { enabled: Boolean(user) });
  const utils = trpc.useUtils();
  const bootstrap = trpc.setup.bootstrap.useMutation({ onSuccess: async () => { await years.refetch(); await utils.auth.me.invalidate(); toast.success("تمت تهيئة إعدادات النظام والسنة المالية الحالية."); } });
  const [activeYearId, setActiveYearId] = useState<number | null>(null);
  useEffect(() => { if (years.data?.length && !activeYearId) setActiveYearId(years.data.find(year => year.isCurrent)?.id ?? years.data[0].id); }, [years.data, activeYearId]);
  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-blue-700" /></div>;
  if (!user) return <div dir="rtl" className="min-h-screen flex items-center justify-center bg-slate-50 p-6"><Button onClick={() => setLocation("/login")} className="bg-blue-700">تسجيل الدخول</Button></div>;
  const activeYear = years.data?.find(year => year.id === activeYearId);
  return <DashboardLayout>{years.isLoading ? <div className="h-96 animate-pulse rounded-2xl bg-slate-100" /> : !activeYear ? <section dir="rtl" className="mx-auto flex min-h-[62vh] max-w-lg flex-col items-center justify-center text-center"><Settings2 className="h-10 w-10 text-blue-700" /><h1 className="mt-5 text-xl font-bold text-slate-800">يلزم إعداد مساحة العمل أولًا</h1><p className="mt-2 leading-7 text-slate-500">لا توجد سنة مالية متاحة لحسابك. يستطيع مدير النظام تهيئة الإعدادات الأساسية مرة واحدة.</p>{user.role === "admin" ? <Button disabled={bootstrap.isPending} onClick={() => bootstrap.mutate()} className="mt-6 bg-blue-700">{bootstrap.isPending ? "جارٍ التهيئة…" : "تهيئة النظام"}</Button> : <p className="mt-5 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">تواصل مع مدير النظام لمنحك الوصول إلى سنة مالية.</p>}</section> : <><div className="mb-5 flex justify-end"><select value={activeYearId ?? ""} onChange={event => setActiveYearId(Number(event.target.value))} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600">{years.data?.map(year => <option key={year.id} value={year.id}>{year.name}{year.isCurrent ? " — الحالية" : ""}</option>)}</select></div><ReviewBoard fiscalYearId={activeYear.id} fiscalYearName={activeYear.name} isClosed={activeYear.status === "closed"} /></>}</DashboardLayout>;
}
