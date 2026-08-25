import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Archive, Bell, BellOff, CheckCheck, Clock3, Filter, History, Info, RotateCcw, Search, ShieldAlert, Sparkles, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type Importance = "normal" | "warning" | "critical";

const importanceMeta: Record<Importance, { label: string; icon: typeof Info; className: string }> = {
  normal: { label: "عادي", icon: Info, className: "border-slate-200 bg-slate-100 text-slate-700" },
  warning: { label: "تنبيه", icon: TriangleAlert, className: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200" },
  critical: { label: "عاجل", icon: ShieldAlert, className: "border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200" },
};

const toLocalDateTimeValue = (value: Date) => {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
};

export default function Notifications() {
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [archivedOnly, setArchivedOnly] = useState(false);
  const [importance, setImportance] = useState<Importance | "all">("all");
  const [teamName, setTeamName] = useState("all");
  const [archiveSearch, setArchiveSearch] = useState("");
  const [customMuteUntil, setCustomMuteUntil] = useState(() => toLocalDateTimeValue(new Date(Date.now() + 60 * 60 * 1000)));

  const input = useMemo(() => ({
    unreadOnly,
    archivedOnly,
    ...(importance !== "all" ? { importance } : {}),
    ...(teamName !== "all" ? { teamName } : {}),
    ...(archivedOnly && archiveSearch.trim() ? { search: archiveSearch.trim() } : {}),
    limit: 200,
  }), [archiveSearch, archivedOnly, importance, teamName, unreadOnly]);
  const notifications = trpc.notifications.list.useQuery(input);
  const allInput = useMemo(() => ({ archivedOnly, limit: 200 }), [archivedOnly]);
  const allNotifications = trpc.notifications.list.useQuery(allInput);
  const summary = trpc.notifications.summary.useQuery();
  const muteStatus = trpc.notifications.muteStatus.useQuery();
  const archiveHistory = trpc.dashboardPreferences.archiveSearchHistory.get.useQuery(undefined, { enabled: archivedOnly });

  const markRead = trpc.notifications.markRead.useMutation({ onSuccess: () => { utils.notifications.list.invalidate(); utils.notifications.summary.invalidate(); } });
  const markAllRead = trpc.notifications.markAllRead.useMutation({ onSuccess: () => { utils.notifications.list.invalidate(); utils.notifications.summary.invalidate(); toast.success("تم تعليم الإشعارات المعروضة كمقروءة."); } });
  const archiveOlder = trpc.notifications.archiveOlderThan30Days.useMutation({ onSuccess: result => { utils.notifications.list.invalidate(); utils.notifications.summary.invalidate(); toast.success(result.archived ? `تمت أرشفة ${result.archived} إشعارًا قديمًا.` : "لا توجد إشعارات مؤهلة للأرشفة."); } });
  const restoreArchived = trpc.notifications.restoreArchived.useMutation({ onSuccess: result => { utils.notifications.list.invalidate(); utils.notifications.summary.invalidate(); toast.success(result.restored ? "تمت استعادة الإشعار إلى القائمة النشطة." : "تعذر استعادة الإشعار المطلوب."); } });
  const setMute = trpc.notifications.setMute.useMutation({ onSuccess: () => { utils.notifications.muteStatus.invalidate(); toast.success("تم كتم التنبيهات مؤقتًا للحساب الحالي."); } });
  const clearMute = trpc.notifications.clearMute.useMutation({ onSuccess: () => { utils.notifications.muteStatus.invalidate(); toast.success("تم إلغاء كتم التنبيهات."); } });
  const recordArchiveSearch = trpc.dashboardPreferences.archiveSearchHistory.record.useMutation({
    onSuccess: () => utils.dashboardPreferences.archiveSearchHistory.get.invalidate(),
    onError: error => toast.error(error.message),
  });

  const teamNames = useMemo(() => Array.from(new Set((allNotifications.data ?? []).map(item => item.teamName).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b, "ar")), [allNotifications.data]);
  const archiveSuggestions = useMemo(() => {
    const recent = archiveHistory.data ?? [];
    const deduplicated = Array.from(new Map([...recent, ...teamNames].map(item => [item.toLocaleLowerCase("ar"), item])).values());
    const term = archiveSearch.trim().toLocaleLowerCase("ar");
    return deduplicated.filter(item => !term || item.toLocaleLowerCase("ar").includes(term)).slice(0, 8);
  }, [archiveHistory.data, archiveSearch, teamNames]);
  const mutedUntilText = muteStatus.data?.muteUntil ? new Date(muteStatus.data.muteUntil).toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" }) : null;
  const applyMute = (until: Date) => setMute.mutate({ muteUntil: until.toISOString() }, { onError: error => toast.error(error.message) });
  const commitArchiveSearch = (value = archiveSearch) => {
    const term = value.trim();
    if (term.length >= 2) recordArchiveSearch.mutate(term);
  };
  const chooseArchiveSuggestion = (value: string) => {
    setArchiveSearch(value);
    commitArchiveSearch(value);
  };
  const toggleArchive = () => {
    setArchivedOnly(value => !value);
    setUnreadOnly(false);
    setArchiveSearch("");
  };

  return <DashboardLayout><section dir="rtl" className="mx-auto max-w-6xl space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-sm font-semibold text-blue-700">مركز شخصي</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">مركز الإشعارات</h1><p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">راجع تنبيهات حسابك، صفِّها حسب الأهمية أو فريق العمل، واضبط كتمًا أو أرشفة آمنة عند الحاجة.</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={archivedOnly || markAllRead.isPending || !notifications.data?.some(item => !item.readAt)} onClick={() => markAllRead.mutate({ ...(importance !== "all" ? { importance } : {}), ...(teamName !== "all" ? { teamName } : {}) })}><CheckCheck className="h-4 w-4" />تعليم المعروض كمقروء</Button><Button variant="outline" className="border-amber-200 text-amber-800 hover:bg-amber-50 dark:border-amber-900/50 dark:text-amber-200" disabled={archiveOlder.isPending || !summary.data?.archivableOlderThan30Days} onClick={() => archiveOlder.mutate()}><Archive className="h-4 w-4" />أرشفة الأقدم من 30 يومًا ({summary.data?.archivableOlderThan30Days ?? 0})</Button></div>
    </div>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="rounded-2xl">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><CardTitle className="flex items-center gap-2 text-base"><Bell className="h-4 w-4 text-blue-700" />{archivedOnly ? "أرشيف الإشعارات الشخصي" : "تنبيهات الحساب"}</CardTitle><CardDescription>{archivedOnly ? "ابحث في عنوان الإشعار أو محتواه أو فريقه، ثم استعده إلى القائمة النشطة عند الحاجة." : `${notifications.data?.filter(item => !item.readAt).length ?? 0} غير مقروءة في العرض الحالي${summary.data?.criticalUnread ? ` · ${summary.data.criticalUnread} عاجلة` : ""}.`}</CardDescription></div>
            <div className="flex flex-wrap gap-2"><Button size="sm" variant={unreadOnly ? "default" : "outline"} className={unreadOnly ? "bg-blue-700 hover:bg-blue-800" : ""} disabled={archivedOnly} onClick={() => setUnreadOnly(value => !value)}>{unreadOnly ? "غير المقروءة" : "كل الإشعارات"}</Button><Button size="sm" variant={archivedOnly ? "default" : "outline"} className={archivedOnly ? "bg-slate-700 hover:bg-slate-800" : ""} onClick={toggleArchive}>{archivedOnly ? "الأرشيف" : "النشطة"}</Button><select aria-label="تصفية حسب الأهمية" value={importance} onChange={event => setImportance(event.target.value as Importance | "all")} className="h-9 rounded-lg border border-slate-200 bg-background px-2 text-xs dark:border-slate-700"><option value="all">كل المستويات</option><option value="critical">عاجل</option><option value="warning">تنبيه</option><option value="normal">عادي</option></select><select aria-label="تصفية حسب الفريق" value={teamName} onChange={event => setTeamName(event.target.value)} className="h-9 max-w-40 rounded-lg border border-slate-200 bg-background px-2 text-xs dark:border-slate-700"><option value="all">كل الفرق</option>{teamNames.map(team => <option key={team} value={team}>{team}</option>)}</select></div>
          </div>
          {archivedOnly ? <div className="mt-3 space-y-3">
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 dark:border-slate-700 dark:bg-slate-900"><Search className="h-4 w-4 text-slate-400" /><input aria-label="بحث نصي في أرشيف الإشعارات" value={archiveSearch} onChange={event => setArchiveSearch(event.target.value)} onBlur={() => commitArchiveSearch()} onKeyDown={event => { if (event.key === "Enter") { event.currentTarget.blur(); } }} placeholder="ابحث بالعنوان أو المحتوى أو الفريق…" className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" /></label>
            {archiveSuggestions.length ? <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 dark:border-blue-900/50 dark:bg-blue-950/20"><p className="flex items-center gap-1.5 text-xs font-semibold text-blue-800 dark:text-blue-200">{archiveHistory.data?.length ? <History className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}{archiveSearch.trim() ? "اقتراحات البحث" : "عملياتك الأخيرة واقتراحات الفرق"}</p><div className="mt-2 flex flex-wrap gap-2">{archiveSuggestions.map(value => <button type="button" key={value} onClick={() => chooseArchiveSuggestion(value)} className="rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-medium text-blue-800 transition hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-blue-800 dark:bg-slate-900 dark:text-blue-200 dark:hover:bg-blue-950">{value}</button>)}</div></div> : null}
          </div> : null}
        </CardHeader>
        <CardContent className="p-0">
          {notifications.isLoading ? <p className="p-8 text-center text-sm text-slate-500">جارٍ تحميل الإشعارات…</p> : notifications.isError ? <p className="p-8 text-center text-sm text-red-700">تعذر تحميل الإشعارات. أعد المحاولة لاحقًا.</p> : notifications.data?.length ? <ul className="divide-y divide-slate-100 dark:divide-slate-800">{notifications.data.map(item => {
            const meta = importanceMeta[item.importance]; const Icon = meta.icon;
            return <li key={item.id} className={item.readAt ? "opacity-70" : "bg-blue-50/40 dark:bg-blue-950/20"}><div className="flex items-stretch"><button type="button" onClick={() => { if (!item.readAt) markRead.mutate({ id: item.id }); if (item.link) setLocation(item.link); }} className="block min-w-0 flex-1 px-5 py-4 text-right transition hover:bg-slate-50 dark:hover:bg-slate-900/60"><div className="flex items-start gap-3"><span className={`mt-0.5 rounded-lg border p-1.5 ${meta.className}`}><Icon className="h-4 w-4" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-800 dark:text-slate-100">{item.title}</p><Badge variant="outline" className={meta.className}>{meta.label}</Badge>{item.teamName ? <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200">{item.teamName}</Badge> : null}{item.archivedAt ? <Badge variant="outline" className="border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">مؤرشف</Badge> : null}{!item.readAt ? <span className="h-2 w-2 rounded-full bg-blue-700" aria-label="غير مقروء" /> : null}</div>{item.body ? <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{item.body}</p> : null}<p className="mt-2 text-xs text-slate-400">{new Date(item.createdAt).toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" })}</p></div></div></button>{archivedOnly ? <div className="flex shrink-0 items-center border-r border-slate-100 px-3 dark:border-slate-800"><Button size="sm" variant="outline" disabled={restoreArchived.isPending} onClick={() => restoreArchived.mutate({ id: item.id })}><RotateCcw className="h-3.5 w-3.5" />استعادة</Button></div> : null}</div></li>;
          })}</ul> : <div className="p-10 text-center"><Filter className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-3 text-sm font-medium text-slate-600 dark:text-slate-300">لا توجد إشعارات مطابقة للفلاتر الحالية.</p></div>}
        </CardContent>
      </Card>
      <Card className="h-fit rounded-2xl border-indigo-100 bg-indigo-50/40 dark:border-indigo-900/40 dark:bg-indigo-950/20"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><BellOff className="h-4 w-4 text-indigo-700" />كتم مؤقت</CardTitle><CardDescription>يخفي تنبيه التأخر المرئي لهذا الحساب ويمنع إنشاء تنبيهات مهام جديدة له حتى انتهاء المدة، دون حذف السجل.</CardDescription></CardHeader><CardContent className="space-y-3">{muteStatus.data?.muted ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100"><p className="font-semibold">الكتم نشط</p><p className="mt-1 text-xs leading-5">ينتهي في {mutedUntilText}.</p><Button size="sm" variant="outline" className="mt-3 border-amber-300" disabled={clearMute.isPending} onClick={() => clearMute.mutate()}><Bell className="h-3.5 w-3.5" />إلغاء الكتم</Button></div> : <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200">التنبيهات مفعلة لهذا الحساب.</p>}<div className="grid grid-cols-2 gap-2"><Button size="sm" variant="outline" onClick={() => applyMute(new Date(Date.now() + 60 * 60 * 1000))}><Clock3 className="h-3.5 w-3.5" />ساعة</Button><Button size="sm" variant="outline" onClick={() => applyMute(new Date(Date.now() + 24 * 60 * 60 * 1000))}><Clock3 className="h-3.5 w-3.5" />24 ساعة</Button><Button size="sm" variant="outline" className="col-span-2" onClick={() => { const end = new Date(); end.setHours(23, 59, 59, 999); applyMute(end); }}><Clock3 className="h-3.5 w-3.5" />حتى نهاية اليوم</Button></div><div className="border-t border-indigo-100 pt-3 dark:border-indigo-900/40"><label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">وقت مخصص</label><div className="flex gap-2"><input type="datetime-local" value={customMuteUntil} onChange={event => setCustomMuteUntil(event.target.value)} className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-background px-2 text-xs dark:border-slate-700" /><Button size="sm" className="bg-indigo-700 hover:bg-indigo-800" disabled={setMute.isPending} onClick={() => { const value = new Date(customMuteUntil); if (Number.isNaN(value.getTime())) return toast.error("اختر وقتًا صالحًا للكتم."); applyMute(value); }}>تطبيق</Button></div></div><p className="border-t border-indigo-100 pt-3 text-xs leading-5 text-slate-500 dark:border-indigo-900/40 dark:text-slate-400">الأرشفة متاحة للإشعارات الأقدم من 30 يومًا، ولا تحذفها نهائيًا؛ افتح الأرشيف ثم استخدم زر الاستعادة عند الحاجة.</p></CardContent></Card>
    </div>
  </section></DashboardLayout>;
}
