import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { ClipboardCheck, KeyRound, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";

export default function Login() {
  const [, setLocation] = useLocation();
  const { user, loading } = useAuth();
  const utils = trpc.useUtils();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const localLogin = trpc.auth.localLogin.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      setLocation("/");
    },
    onError: issue => setError(issue.message || "تعذر تسجيل الدخول. تحقق من بياناتك ثم أعد المحاولة."),
  });

  useEffect(() => {
    if (user) setLocation("/");
  }, [setLocation, user]);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    localLogin.mutate({ username, password });
  };

  if (loading || user) return <main className="min-h-screen bg-slate-50" />;

  return (
    <main dir="rtl" className="min-h-screen bg-[radial-gradient(circle_at_top_right,#dbeafe,transparent_38%),linear-gradient(135deg,#f8fafc,#eef6ff)] px-4 py-10 sm:py-16">
      <section className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/70 bg-white/90 shadow-2xl shadow-slate-900/10 backdrop-blur lg:grid-cols-[1.05fr_.95fr]">
        <div className="bg-gradient-to-br from-blue-800 via-blue-700 to-indigo-800 p-8 text-white sm:p-11">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 shadow-lg"><ClipboardCheck className="h-7 w-7" /></div>
          <p className="mt-9 text-sm font-semibold text-blue-100">مساحة عمل محمية</p>
          <h1 className="mt-3 text-3xl font-bold leading-tight">نظام المراجعة المبسط</h1>
          <p className="mt-5 max-w-md leading-8 text-blue-100">ادخل بحساب العمل الذي أنشأه مدير النظام. تُطبَّق الصلاحيات ونطاق السنوات المالية من الخادم بعد التحقق من الجلسة.</p>
          <div className="mt-10 flex items-start gap-3 rounded-2xl border border-white/15 bg-white/10 p-4 text-sm leading-6 text-blue-50"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />لا تشارك كلمة المرور أو جلسة الدخول مع أي مستخدم آخر.</div>
        </div>
        <div className="p-7 sm:p-11">
          <Card className="border-0 bg-transparent shadow-none">
            <CardHeader className="px-0 pt-0"><CardTitle className="text-2xl text-slate-900">تسجيل الدخول</CardTitle><CardDescription className="mt-2 leading-6">استخدم اسم المستخدم وكلمة المرور المخصصة لك.</CardDescription></CardHeader>
            <CardContent className="px-0 pb-0">
              <form className="space-y-5" onSubmit={submit}>
                <div className="space-y-2"><Label htmlFor="username">اسم المستخدم</Label><Input id="username" autoComplete="username" dir="auto" value={username} onChange={event => setUsername(event.target.value)} placeholder="مثال: أحمد.مراجعة" required /></div>
                <div className="space-y-2"><Label htmlFor="password">كلمة المرور</Label><Input id="password" type="password" autoComplete="current-password" dir="ltr" value={password} onChange={event => setPassword(event.target.value)} required /></div>
                {error ? <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">{error}</p> : null}
                <Button type="submit" size="lg" className="w-full bg-blue-700 hover:bg-blue-800" disabled={localLogin.isPending}>{localLogin.isPending ? "جارٍ التحقق…" : <><KeyRound className="h-4 w-4" />دخول آمن</>}</Button>
              </form>
              <div className="my-7 flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" />أو<span className="h-px flex-1 bg-slate-200" /></div>
              <Button type="button" variant="outline" className="w-full" onClick={startLogin}>الدخول باستخدام حساب مانوس</Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
