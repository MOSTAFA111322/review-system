import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Archive, ArchiveRestore, ArrowRight, Ban, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link, useLocation, useRoute } from "wouter";

type EditState = {
  title: string;
  operationTypeId: string;
  assignedEmployeeId: string;
  voucherNumber: string;
  priority: "normal" | "urgent" | "critical";
  problem: string;
  requiredAction: string;
  description: string;
  dueDate: string;
};

const emptyForm: EditState = { title: "", operationTypeId: "", assignedEmployeeId: "", voucherNumber: "", priority: "normal", problem: "", requiredAction: "", description: "", dueDate: "" };

export default function ReviewEdit() {
  const [, params] = useRoute("/reviews/:id/edit");
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const reviewId = Number(params?.id);
  const utils = trpc.useUtils();
  const review = trpc.reviews.get.useQuery({ id: reviewId }, { enabled: Number.isFinite(reviewId) && reviewId > 0 });
  const isArchived = Boolean(review.data?.archivedAt);
  const isCancelled = Boolean(review.data?.cancelledAt);
  const isReadOnly = isArchived || isCancelled;
  const options = trpc.reviews.editOptions.useQuery({ id: reviewId }, { enabled: Boolean(review.data) && !isReadOnly });
  const [form, setForm] = useState<EditState>(emptyForm);
  const [cancelling, setCancelling] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const canUpdate = Boolean(user?.permissions?.includes("*") || user?.permissions?.includes("reviews.update"));
  const canRestore = Boolean(user?.permissions?.includes("*") || user?.permissions?.includes("reviews.restore"));
  const canCancel = Boolean(user?.permissions?.includes("*") || user?.permissions?.includes("reviews.delete"));
  const invalidateReview = async () => {
    await Promise.all([utils.reviews.get.invalidate({ id: reviewId }), utils.reviews.list.invalidate(), utils.activity.list.invalidate({ reviewId })]);
  };
  const update = trpc.reviews.update.useMutation({
    onSuccess: async () => {
      await invalidateReview();
      toast.success("تم حفظ بيانات المراجعة وتوثيق التعديل.");
      navigate(`/reviews/${reviewId}`);
    },
    onError: error => toast.error(error.message || "تعذر حفظ التعديلات."),
  });
  const archive = trpc.reviews.archive.useMutation({
    onSuccess: async () => {
      await invalidateReview();
      toast.success("نُقلت المراجعة المكتملة إلى الأرشيف مع الاحتفاظ بسجلها ومرفقاتها.");
      navigate("/");
    },
    onError: error => toast.error(error.message || "تعذر أرشفة المراجعة."),
  });
  const restoreFromArchive = trpc.reviews.restoreFromArchive.useMutation({
    onSuccess: async () => {
      await invalidateReview();
      toast.success("أُعيدت المراجعة من الأرشيف إلى قائمة العمل.");
      navigate(`/reviews/${reviewId}`);
    },
    onError: error => toast.error(error.message || "تعذر استرجاع المراجعة."),
  });
  const cancelReview = trpc.reviews.cancel.useMutation({
    onSuccess: async () => {
      await invalidateReview();
      toast.success("تم إلغاء المراجعة وحفظ سبب الإلغاء وسجلها دون حذف البيانات.");
      navigate("/");
    },
    onError: error => toast.error(error.message || "تعذر إلغاء المراجعة."),
  });
  const restoreCancelled = trpc.reviews.restoreCancelled.useMutation({
    onSuccess: async () => {
      await invalidateReview();
      toast.success("أُعيدت المراجعة الملغاة إلى قائمة العمل.");
      navigate(`/reviews/${reviewId}`);
    },
    onError: error => toast.error(error.message || "تعذر استعادة المراجعة الملغاة."),
  });

  useEffect(() => {
    if (!review.data) return;
    setForm({
      title: review.data.title,
      operationTypeId: String(review.data.operationTypeId),
      assignedEmployeeId: review.data.assignedEmployeeId ? String(review.data.assignedEmployeeId) : "",
      voucherNumber: review.data.voucherNumber ?? "",
      priority: review.data.priority,
      problem: review.data.problem ?? "",
      requiredAction: review.data.requiredAction ?? "",
      description: review.data.description ?? "",
      dueDate: review.data.dueDate ? new Date(review.data.dueDate).toISOString().slice(0, 10) : "",
    });
  }, [review.data]);

  if (review.isLoading) return <div className="h-96 animate-pulse rounded-2xl bg-slate-100" />;
  if (review.isError) return <LoadError message="تعذر تحميل بيانات المراجعة." retry={() => review.refetch()} />;
  if (review.data && !isReadOnly && options.isLoading) return <div className="h-96 animate-pulse rounded-2xl bg-slate-100" />;
  if (review.data && !isReadOnly && options.isError) return <LoadError message="تعذر تحميل أنواع المهام والموظفين المتاحين." retry={() => options.refetch()} />;
  if (!review.data || (!canUpdate && !canRestore && !canCancel)) return <Card className="mx-auto max-w-xl text-center"><CardContent className="p-10"><p className="font-bold text-slate-700">لا تملك صلاحية إدارة هذه المراجعة أو لم تعد متاحة.</p><Link href={reviewId ? `/reviews/${reviewId}` : "/"}><Button className="mt-4">العودة</Button></Link></CardContent></Card>;

  const set = <K extends keyof EditState>(key: K, value: EditState[K]) => setForm(current => ({ ...current, [key]: value }));
  const submit = () => update.mutate({
    id: reviewId,
    title: form.title,
    operationTypeId: Number(form.operationTypeId),
    assignedEmployeeId: form.assignedEmployeeId ? Number(form.assignedEmployeeId) : null,
    voucherNumber: form.voucherNumber.trim() || null,
    priority: form.priority,
    problem: form.problem.trim() || null,
    requiredAction: form.requiredAction.trim() || null,
    description: form.description.trim() || null,
    dueDate: form.dueDate || null,
  });

  return <section dir="rtl" className="mx-auto max-w-4xl space-y-5">
    <Link href={`/reviews/${reviewId}`} className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-blue-700"><ArrowRight className="h-4 w-4" />العودة إلى التفاصيل</Link>
    <Card className="rounded-2xl border-slate-200">
      <CardHeader>
        <CardTitle>{isCancelled ? `مراجعة ملغاة ${review.data.internalRef}` : isArchived ? `مراجعة مؤرشفة ${review.data.internalRef}` : `تعديل المراجعة ${review.data.internalRef}`}</CardTitle>
        <p className="text-sm text-slate-500">{isCancelled ? "المراجعة للقراءة فقط بعد الإلغاء. يمكن لذوي صلاحية الاستعادة إعادتها إلى قائمة العمل." : isArchived ? "المراجعة للقراءة فقط في الأرشيف. يمكن لذوي صلاحية الاسترجاع إعادتها إلى قائمة العمل." : "تتحدد أنواع المهام والموظفون المتاحون من إعدادات السنة المالية والصلاحيات الخادمية."}</p>
      </CardHeader>
      <CardContent className="space-y-5">
        {isCancelled ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-950 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100"><p className="font-bold">هذه العملية ملغاة ولا يمكن تعديلها أو تنفيذها.</p><p className="mt-1">سبب الإلغاء: {review.data.cancellationReason || "لم يُسجل سبب."}</p></div> : isArchived ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">هذه العملية محفوظة في الأرشيف. لا يُسمح بتعديلها أو تغيير حالتها قبل استرجاعها.</div> : <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">تُنقل العملية إلى الأرشيف فقط عندما تكون حالتا المراجع والموظف مكتملتين. تبقى المرفقات والتعليقات وسجل النشاط محفوظة.</div>}
        {isCancelled ? canRestore ? <Button disabled={restoreCancelled.isPending} onClick={() => restoreCancelled.mutate({ id: reviewId })} className="gap-2 bg-red-700 hover:bg-red-800"><ArchiveRestore className="h-4 w-4" />{restoreCancelled.isPending ? "جارٍ الاستعادة…" : "استعادة إلى قائمة العمل"}</Button> : null : isArchived ? canRestore ? <Button disabled={restoreFromArchive.isPending} onClick={() => restoreFromArchive.mutate({ id: reviewId })} className="gap-2 bg-amber-700 hover:bg-amber-800"><ArchiveRestore className="h-4 w-4" />{restoreFromArchive.isPending ? "جارٍ الاسترجاع…" : "استرجاع إلى قائمة العمل"}</Button> : null : <div className="flex flex-wrap gap-2">{canUpdate ? <Button variant="outline" disabled={archive.isPending} onClick={() => archive.mutate({ id: reviewId })} className="gap-2 border-amber-300 text-amber-900 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-100 dark:hover:bg-amber-950/50"><Archive className="h-4 w-4" />{archive.isPending ? "جارٍ النقل…" : "نقل إلى الأرشيف"}</Button> : null}{canCancel ? <Button variant="outline" onClick={() => setCancelling(value => !value)} className="gap-2 border-red-300 text-red-800 hover:bg-red-50 dark:border-red-800 dark:text-red-200 dark:hover:bg-red-950/50"><Ban className="h-4 w-4" />إلغاء العملية</Button> : null}</div>}
        {cancelling && !isReadOnly ? <form className="rounded-xl border border-red-200 bg-red-50/60 p-4" onSubmit={event => { event.preventDefault(); cancelReview.mutate({ id: reviewId, reason: cancellationReason.trim() }); }}><label className="grid gap-2 text-sm font-semibold text-red-950 dark:text-red-100"><span>سبب الإلغاء *</span><Textarea value={cancellationReason} onChange={event => setCancellationReason(event.target.value)} minLength={3} maxLength={1000} required placeholder="اكتب سبب الإلغاء بوضوح؛ سيظهر في السجل ولا يمكن تعديل العملية بعد الإلغاء." className="min-h-24 bg-white dark:bg-slate-950" /></label><div className="mt-3 flex flex-wrap gap-2"><Button type="submit" disabled={cancelReview.isPending || cancellationReason.trim().length < 3} className="bg-red-700 hover:bg-red-800">{cancelReview.isPending ? "جارٍ الإلغاء…" : "تأكيد إلغاء العملية"}</Button><Button type="button" variant="outline" onClick={() => { setCancelling(false); setCancellationReason(""); }}>تراجع</Button></div></form> : null}
        {!isReadOnly && canUpdate ? <div className="grid gap-5 md:grid-cols-2">
          <Field label="عنوان المراجعة" required><Input value={form.title} onChange={event => set("title", event.target.value)} /></Field>
          <Field label="نوع المهمة" required><select value={form.operationTypeId} onChange={event => set("operationTypeId", event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">اختر النوع</option>{options.data?.operationTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}</select></Field>
          <Field label="الموظف المكلّف"><select value={form.assignedEmployeeId} onChange={event => set("assignedEmployeeId", event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">غير مكلّف</option>{options.data?.employees.map(employee => <option key={employee.id} value={employee.id}>{employee.displayName}</option>)}</select></Field>
          <Field label="رقم السند"><Input value={form.voucherNumber} onChange={event => set("voucherNumber", event.target.value)} /></Field>
          <Field label="الأولوية"><select value={form.priority} onChange={event => set("priority", event.target.value as EditState["priority"])} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="normal">عادية</option><option value="urgent">مستعجلة</option><option value="critical">عاجلة</option></select></Field>
          <Field label="التاريخ المستهدف"><Input type="date" value={form.dueDate} onChange={event => set("dueDate", event.target.value)} /></Field>
          <Field label="المشكلة"><Textarea value={form.problem} onChange={event => set("problem", event.target.value)} className="min-h-28" /></Field>
          <Field label="الإجراء المطلوب"><Textarea value={form.requiredAction} onChange={event => set("requiredAction", event.target.value)} className="min-h-28" /></Field>
          <div className="md:col-span-2"><Field label="تفاصيل إضافية"><Textarea value={form.description} onChange={event => set("description", event.target.value)} className="min-h-28" /></Field></div>
          <div className="flex justify-end gap-3 md:col-span-2"><Link href={`/reviews/${reviewId}`}><Button type="button" variant="outline">إلغاء</Button></Link><Button type="button" disabled={update.isPending || !form.title.trim() || !form.operationTypeId} onClick={submit} className="gap-2 bg-blue-700 hover:bg-blue-800"><Save className="h-4 w-4" />{update.isPending ? "جارٍ الحفظ…" : "حفظ التعديلات"}</Button></div>
        </div> : null}
      </CardContent>
    </Card>
  </section>;
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <label className="grid gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200"><span>{label}{required ? " *" : ""}</span>{children}</label>;
}

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return <Card className="mx-auto max-w-xl text-center"><CardContent className="space-y-4 p-10"><p className="font-bold text-slate-700">{message}</p><Button onClick={retry}>إعادة المحاولة</Button></CardContent></Card>;
}
