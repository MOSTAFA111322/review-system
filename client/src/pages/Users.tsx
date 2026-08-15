import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { History, KeyRound, MonitorSmartphone, ShieldCheck, UserPlus, UsersRound } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

const eventLabels = { login: "تسجيل دخول", logout: "تسجيل خروج", failed_login: "محاولة غير ناجحة" } as const;
const eventClasses = { login: "bg-emerald-50 text-emerald-700", logout: "bg-slate-100 text-slate-600", failed_login: "bg-red-50 text-red-700" } as const;
const localUsernamePattern = /^[A-Za-z0-9\u0600-\u06FF._-]{3,64}$/;
const usernameGuidance = "اسم المستخدم يجب أن يتكون من أحرف أو أرقام أو النقطة أو الشرطة فقط، من دون مسافات.";

function describeLocalAccountError(message: string) {
  if (message.includes("اسم المستخدم") || message.includes("invalid_format") || message.includes("username")) return usernameGuidance;
  if (message.includes("كلمة المرور") || message.includes("password")) return "كلمة المرور يجب أن تتكون من 8 أحرف على الأقل.";
  if (message.includes("مستخدم بالفعل") || message.includes("موجود بالفعل")) return "اسم المستخدم مستخدم بالفعل. اختر اسمًا مختلفًا.";
  return "تعذر إنشاء الحساب. راجع البيانات ثم أعد المحاولة.";
}

export default function Users() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const canManage = Boolean(user?.permissions?.includes("*") || user?.permissions?.includes("users.manage"));
  const activity = trpc.auth.activity.useQuery({ limit: 80 }, { enabled: canManage });
  const users = trpc.users.list.useQuery(undefined, { enabled: canManage });
  const options = trpc.users.accessOptions.useQuery(undefined, { enabled: canManage });
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState<number | null>(null);
  const [fiscalYearIds, setFiscalYearIds] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const createLocal = trpc.users.createLocal.useMutation({ onSuccess: async () => { setFeedback("تم إنشاء الحساب المحلي. بلّغ المستخدم باسم المستخدم وكلمة المرور عبر قناة آمنة."); setName(""); setUsername(""); setPassword(""); setRoleId(null); setFiscalYearIds([]); await utils.users.list.invalidate(); } });
  const resetPassword = trpc.users.resetLocalPassword.useMutation({ onSuccess: () => setFeedback("تمت إعادة تعيين كلمة المرور وإبطال الجلسات السابقة لهذا الحساب.") });
  const setActive = trpc.users.setActive.useMutation({ onSuccess: () => utils.users.list.invalidate() });
  if (!canManage) return <DashboardLayout><section dir="rtl" className="mx-auto max-w-4xl"><Card className="rounded-2xl"><CardContent className="p-8 text-center text-slate-500">ليس لديك صلاحية إدارة المستخدمين أو الاطلاع على السجل الأمني.</CardContent></Card></section></DashboardLayout>;

  const toggleFiscalYear = (id: number) => setFiscalYearIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);
    setFormError(null);
    if (!localUsernamePattern.test(username)) {
      setFormError(usernameGuidance);
      return;
    }
    if (password.length < 8) {
      setFormError("كلمة المرور يجب أن تتكون من 8 أحرف على الأقل.");
      return;
    }
    createLocal.mutate({ name, username, password, roleIds: roleId ? [roleId] : [], fiscalYearIds });
  };

  return <DashboardLayout><section dir="rtl" className="mx-auto max-w-6xl space-y-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div className="flex items-start gap-3"><div className="mt-1 rounded-xl bg-blue-100 p-2 text-blue-700"><ShieldCheck className="h-5 w-5" /></div><div><p className="text-sm font-semibold text-blue-700">إدارة الوصول</p><h1 className="mt-1 text-2xl font-bold text-slate-900">الحسابات وسجل الدخول</h1><p className="mt-2 text-sm leading-6 text-slate-500">أنشئ حسابات داخلية دون بريد إلكتروني، وحدد دورها ونطاق السنوات المالية من مكان واحد.</p></div></div><Button type="button" variant="outline" onClick={() => setLocation("/settings")} className="shrink-0 border-blue-200 text-blue-800 hover:bg-blue-50">تعديل أسماء الموظفين من دليل الموظفين</Button></div>
  <Card className="rounded-2xl"><CardHeader><CardTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5 text-blue-700" />إنشاء حساب محلي</CardTitle><CardDescription>كلمة المرور الأولية لا تُحفظ أو تُعرض بعد الإنشاء. سلّمها للمستخدم عبر وسيلة آمنة.</CardDescription></CardHeader><CardContent>{feedback ? <p className="mb-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">{feedback}</p> : null}<form noValidate onSubmit={submit} className="grid gap-5 md:grid-cols-2"><div className="space-y-2"><Label htmlFor="local-name">الاسم الظاهر</Label><Input id="local-name" value={name} onChange={event => { setName(event.target.value); setFormError(null); }} required /></div><div className="space-y-2"><Label htmlFor="local-username">اسم المستخدم</Label><Input id="local-username" dir="auto" value={username} onChange={event => { setUsername(event.target.value); setFormError(null); }} placeholder="مثال: علي.موظف" required /></div><div className="space-y-2"><Label htmlFor="local-password">كلمة المرور الأولية</Label><Input id="local-password" type="password" dir="ltr" value={password} onChange={event => { setPassword(event.target.value); setFormError(null); }} required /><p className="text-xs text-slate-500">8 أحرف على الأقل.</p></div><div className="space-y-2"><Label htmlFor="local-role">الدور</Label><select id="local-role" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={roleId ?? ""} onChange={event => setRoleId(event.target.value ? Number(event.target.value) : null)}><option value="">بدون دور (يُحدد لاحقًا)</option>{options.data?.roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></div><div className="space-y-3 md:col-span-2"><Label>نطاق السنوات المالية</Label><div className="flex flex-wrap gap-x-5 gap-y-3">{options.data?.fiscalYears.map(year => <label key={year.id} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700"><Checkbox checked={fiscalYearIds.includes(year.id)} onCheckedChange={() => toggleFiscalYear(year.id)} />{year.name} {year.status === "closed" ? "(مقفلة)" : ""}</label>)}</div></div><div className="md:col-span-2"><Button type="submit" disabled={createLocal.isPending} className="bg-blue-700 hover:bg-blue-800">{createLocal.isPending ? "جارٍ إنشاء الحساب…" : "إنشاء الحساب"}</Button>{formError || createLocal.error ? <p role="alert" className="mt-3 text-sm leading-6 text-red-600">{formError || describeLocalAccountError(createLocal.error?.message ?? "")}</p> : null}</div></form></CardContent></Card>
  <Card className="overflow-hidden rounded-2xl"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><UsersRound className="h-4 w-4 text-blue-700" />الحسابات</CardTitle><CardDescription>يُتاح تعطيل الحساب أو إعادة تعيين كلمة مرور الحسابات المحلية فقط. يؤدي التعطيل وإعادة التعيين إلى إبطال الجلسات السابقة.</CardDescription></CardHeader><CardContent className="p-0">{users.isLoading ? <p className="p-6 text-center text-sm text-slate-500">جارٍ تحميل الحسابات…</p> : users.data?.length ? <div className="divide-y divide-slate-100">{users.data.map(account => <AccountRow key={account.id} account={account} onToggle={() => setActive.mutate({ userId: account.id, isActive: !account.isActive })} onReset={nextPassword => resetPassword.mutate({ userId: account.id, password: nextPassword })} />)}</div> : <p className="p-6 text-center text-sm text-slate-500">لا توجد حسابات بعد.</p>}</CardContent></Card>
  <Card className="overflow-hidden rounded-2xl"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4 text-blue-700" />آخر الأحداث</CardTitle><CardDescription>سجل تدقيق خادمي لأحداث الدخول والخروج والمحاولات المرفوضة.</CardDescription></CardHeader><CardContent className="p-0">{activity.isLoading ? <p className="p-6 text-center text-sm text-slate-500">جارٍ تحميل السجل…</p> : activity.isError ? <p className="p-6 text-center text-sm text-red-600">تعذر تحميل السجل. أعد المحاولة لاحقًا.</p> : activity.data?.length ? <div className="divide-y divide-slate-100">{activity.data.map(item => <div key={item.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-center gap-3"><div className="rounded-lg bg-slate-100 p-2 text-slate-500"><MonitorSmartphone className="h-4 w-4" /></div><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{item.userName || "مستخدم النظام"}</p><p className="mt-1 truncate text-xs text-slate-400">{item.email || item.ipAddress || "عنوان غير متاح"}</p></div></div><div className="flex items-center justify-between gap-3 sm:justify-end"><time className="text-xs text-slate-500">{new Date(item.createdAt).toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" })}</time><Badge className={`border-0 ${eventClasses[item.event]}`}>{eventLabels[item.event]}</Badge></div></div>)}</div> : <p className="p-6 text-center text-sm text-slate-500">لا توجد أحداث مسجلة بعد.</p>}</CardContent></Card></section></DashboardLayout>;
}

function AccountRow({ account, onToggle, onReset }: { account: { id: number; name: string | null; username: string | null; loginMethod: string | null; hasLocalPassword: boolean; isActive: boolean; roles: { name: string }[] }; onToggle: () => void; onReset: (password: string) => void }) {
  const [editingPassword, setEditingPassword] = useState(false);
  const [nextPassword, setNextPassword] = useState("");
  return <div className="px-5 py-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-slate-800">{account.name || "مستخدم النظام"}</p><p dir="auto" className="mt-1 text-xs text-slate-500">{account.username || (account.loginMethod === "oauth" ? "حساب مانوس" : "—")}</p><div className="mt-2 flex flex-wrap gap-1.5">{account.roles.map(role => <Badge key={role.name} variant="secondary">{role.name}</Badge>)}{account.hasLocalPassword ? <Badge className="border-0 bg-blue-50 text-blue-700">حساب محلي</Badge> : <Badge className="border-0 bg-slate-100 text-slate-600">حساب مانوس</Badge>}</div></div><div className="flex flex-wrap items-center gap-2"><Badge className={account.isActive ? "border-0 bg-emerald-50 text-emerald-700" : "border-0 bg-red-50 text-red-700"}>{account.isActive ? "نشط" : "معطل"}</Badge><Button type="button" variant="outline" size="sm" onClick={onToggle}>{account.isActive ? "تعطيل" : "تفعيل"}</Button>{account.hasLocalPassword ? <Button type="button" variant="outline" size="sm" onClick={() => setEditingPassword(value => !value)}><KeyRound className="h-3.5 w-3.5" />إعادة تعيين</Button> : null}</div></div>{editingPassword ? <form className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row" onSubmit={event => { event.preventDefault(); onReset(nextPassword); setNextPassword(""); setEditingPassword(false); }}><Input aria-label={`كلمة المرور الجديدة لـ ${account.name || account.username}`} type="password" dir="ltr" minLength={8} value={nextPassword} onChange={event => setNextPassword(event.target.value)} placeholder="كلمة مرور جديدة، 8 أحرف على الأقل" required /><Button type="submit" size="sm">حفظ كلمة المرور</Button></form> : null}</div>;
}
