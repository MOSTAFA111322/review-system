import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { AlertCircle, Archive, ArrowLeft, Ban, ChevronLeft, ChevronRight, CirclePlus, ClipboardList, Filter, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type Props = { fiscalYearId: number; fiscalYearName: string; isClosed: boolean };

const priorityMeta = {
  normal: { label: "عادية", className: "bg-slate-100 text-slate-600" },
  urgent: { label: "مستعجلة", className: "bg-amber-50 text-amber-700 ring-1 ring-amber-200" },
  critical: { label: "عاجلة", className: "bg-red-50 text-red-700 ring-1 ring-red-200" },
} as const;

const filterControlClass = "h-10 max-w-full rounded-lg border border-orange-200 bg-orange-50 px-3 text-sm font-semibold text-orange-900 shadow-sm outline-none transition-colors focus:border-orange-500 focus:ring-2 focus:ring-orange-200 dark:border-orange-800 dark:bg-orange-950/35 dark:text-orange-100 dark:focus:border-orange-400 dark:focus:ring-orange-900";

const formatDate = (value: Date | string | null) => value ? new Intl.DateTimeFormat("ar-EG-u-ca-gregory", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "—";

export default function ReviewBoard({ fiscalYearId, fiscalYearName, isClosed }: Props) {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  const canCreate = Boolean(user?.permissions?.includes("*") || user?.permissions?.includes("reviews.create"));
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState<"all" | "normal" | "urgent" | "critical">("all");
  const [reviewerStatusId, setReviewerStatusId] = useState("all");
  const [employeeStatusId, setEmployeeStatusId] = useState("all");
  const [operationTypeId, setOperationTypeId] = useState("all");
  const [archiveScope, setArchiveScope] = useState<"active" | "archived" | "cancelled">("active");
  const [sortBy, setSortBy] = useState<"createdAt" | "dueDate" | "internalRef" | "priority">("createdAt");
  const [createOpen, setCreateOpen] = useState(false);
  const filters = useMemo(() => ({
    fiscalYearId, page, pageSize: 15, query: query || undefined,
    priorities: priority === "all" ? undefined : [priority],
    reviewerStatusIds: reviewerStatusId === "all" ? undefined : [Number(reviewerStatusId)],
    employeeStatusIds: employeeStatusId === "all" ? undefined : [Number(employeeStatusId)],
    operationTypeIds: operationTypeId === "all" ? undefined : [Number(operationTypeId)],
    archiveScope,
    sortBy, sortDirection: "desc" as const,
  }), [fiscalYearId, page, query, priority, reviewerStatusId, employeeStatusId, operationTypeId, archiveScope, sortBy]);
  const list = trpc.reviews.list.useQuery(filters);
  const options = trpc.reviews.filterOptions.useQuery({ fiscalYearId });
  const resetFilters = () => { setPage(1); setQuery(""); setPriority("all"); setReviewerStatusId("all"); setEmployeeStatusId("all"); setOperationTypeId("all"); setSortBy("createdAt"); };

  return (
    <section dir="rtl" className="mx-auto max-w-[1500px] space-y-5">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-blue-600" /><p className="text-sm font-medium text-slate-500">{fiscalYearName}</p>{isClosed ? <Badge className="bg-slate-700">سنة مغلقة</Badge> : null}</div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 md:text-3xl">{archiveScope === "archived" ? "أرشيف عمليات المراجعة" : archiveScope === "cancelled" ? "المراجعات الملغاة" : "عمليات المراجعة"}</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-300">{archiveScope === "archived" ? "عمليات مكتملة محفوظة بسجلها ومرفقاتها، ويمكن استرجاعها وفق الصلاحية." : archiveScope === "cancelled" ? "عمليات أُلغيت مع حفظ سبب الإلغاء والسجل والمرفقات، ولا تُحتسب ضمن العمل اليومي أو التحليلات." : "تابع الحالة والتكليفات والتواريخ المستهدفة من مكان واحد."}</p>
        </div>
        {canCreate && !isClosed && archiveScope === "active" ? <Button onClick={() => setCreateOpen(true)} className="h-11 gap-2 bg-blue-700 px-5 shadow-md shadow-blue-700/20 hover:bg-blue-800"><CirclePlus className="h-4 w-4" />إنشاء مراجعة</Button> : null}
      </div>

      <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900" role="tablist" aria-label="نطاق عرض المراجعات">
        <Button type="button" size="sm" variant={archiveScope === "active" ? "default" : "ghost"} onClick={() => { setPage(1); setArchiveScope("active"); }} className={archiveScope === "active" ? "bg-blue-700 hover:bg-blue-800" : "text-slate-600 dark:text-slate-200"}>قائمة العمل</Button>
        <Button type="button" size="sm" variant={archiveScope === "archived" ? "default" : "ghost"} onClick={() => { setPage(1); setArchiveScope("archived"); }} className={archiveScope === "archived" ? "bg-amber-700 hover:bg-amber-800" : "gap-2 text-slate-600 dark:text-slate-200"}><Archive className="h-3.5 w-3.5" />الأرشيف</Button>
        <Button type="button" size="sm" variant={archiveScope === "cancelled" ? "default" : "ghost"} onClick={() => { setPage(1); setArchiveScope("cancelled"); }} className={archiveScope === "cancelled" ? "bg-red-700 hover:bg-red-800" : "gap-2 text-slate-600 dark:text-slate-200"}><Ban className="h-3.5 w-3.5" />الملغاة</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label={archiveScope === "archived" ? "إجمالي المؤرشف" : archiveScope === "cancelled" ? "إجمالي الملغى" : "إجمالي النتائج"} value={list.data?.total ?? "—"} note="حسب الفلاتر الحالية" />
        <Metric label="السنة المالية" value={fiscalYearName.replace("السنة المالية ", "")} note={isClosed ? "مقفلة للتعديل" : "متاحة للتحديث"} blue />
        <Metric label="عرض القائمة" value={`${list.data?.items.length ?? 0}`} note="نتيجة في الصفحة الحالية" />
      </div>

      <Card className="overflow-hidden rounded-2xl border-slate-200 bg-white shadow-sm">
        <CardContent className="p-0">
          <div className="border-b border-slate-100 p-4 md:p-5">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
              <div className="relative min-w-0 flex-1"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={query} onChange={event => { setPage(1); setQuery(event.target.value); }} placeholder="ابحث برقم المراجعة أو العنوان أو السند…" className="h-10 border-slate-200 pr-10 text-right" /></div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                <FilterSelect label="النوع" value={operationTypeId} onChange={value => { setPage(1); setOperationTypeId(value); }} options={options.data?.operationTypes ?? []} />
                <FilterSelect label="حالة المراجع" value={reviewerStatusId} onChange={value => { setPage(1); setReviewerStatusId(value); }} options={options.data?.reviewerStatuses ?? []} />
                <FilterSelect label="حالة الموظف" value={employeeStatusId} onChange={value => { setPage(1); setEmployeeStatusId(value); }} options={options.data?.employeeStatuses ?? []} />
                <select aria-label="الأولوية" value={priority} onChange={event => { setPage(1); setPriority(event.target.value as typeof priority); }} className={filterControlClass}><option value="all">كل الأولويات</option><option value="normal">عادية</option><option value="urgent">مستعجلة</option><option value="critical">عاجلة</option></select>
                <select aria-label="الفرز" value={sortBy} onChange={event => setSortBy(event.target.value as typeof sortBy)} className={filterControlClass}><option value="createdAt">الأحدث أولاً</option><option value="dueDate">التاريخ المستهدف</option><option value="internalRef">رقم المراجعة</option><option value="priority">الأولوية</option></select>
                <Button variant="outline" onClick={resetFilters} className="h-10 gap-2 border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-100 dark:border-orange-800 dark:bg-orange-950/35 dark:text-orange-100 dark:hover:bg-orange-950/60"><SlidersHorizontal className="h-4 w-4" /><span className="hidden sm:inline">إعادة ضبط</span></Button>
              </div>
            </div>
          </div>
          {list.isError ? <QueryError onRetry={() => { void list.refetch(); }} /> : <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-right"><thead className="bg-slate-100 text-xs font-bold tracking-wide text-slate-800 dark:bg-slate-800 dark:text-slate-100"><tr><th className="px-5 py-4">المرجع</th><th className="px-4 py-4">العملية</th><th className="px-4 py-4">الأولوية</th><th className="px-4 py-4">حالة المراجع</th><th className="px-4 py-4">حالة الموظف</th><th className="px-4 py-4">المكلّف</th><th className="px-5 py-4">التاريخ المستهدف</th></tr></thead>
              <tbody>{list.isLoading ? <LoadingRows /> : list.data?.items.map(review => <tr key={review.id} onClick={() => setLocation(`/reviews/${review.id}`)} className="group cursor-pointer border-t border-slate-100 transition-colors hover:bg-blue-50/50"><td className="px-5 py-4"><p className="font-mono text-xs font-bold text-blue-700">{review.internalRef}</p><p className="mt-1 max-w-[235px] truncate text-sm font-semibold text-slate-700">{review.title}</p></td><td className="px-4 py-4"><span className="inline-flex items-center gap-2 text-sm text-slate-600"><i className="h-2 w-2 rounded-full" style={{ backgroundColor: review.operationTypeColor }} />{review.operationTypeName}</span></td><td className="px-4 py-4"><Badge className={priorityMeta[review.priority].className}>{priorityMeta[review.priority].label}</Badge></td><td className="px-4 py-4"><StatusPill name={review.reviewerStatusName} color={review.reviewerStatusColor} /></td><td className="px-4 py-4"><StatusPill name={review.employeeStatusName} color={review.employeeStatusColor} /></td><td className="px-4 py-4 text-sm text-slate-600">{review.assignedEmployeeName ?? "غير مكلّف"}</td><td className="px-5 py-4 text-sm text-slate-500">{formatDate(review.dueDate)}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="space-y-3 p-4 md:hidden">{list.isLoading ? <div className="h-48 animate-pulse rounded-xl bg-slate-100" /> : list.data?.items.map(review => <button key={review.id} onClick={() => setLocation(`/reviews/${review.id}`)} className="w-full rounded-xl border border-slate-200 p-4 text-right shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs font-bold text-blue-700">{review.internalRef}</p><p className="mt-1 font-semibold text-slate-800">{review.title}</p></div><Badge className={priorityMeta[review.priority].className}>{priorityMeta[review.priority].label}</Badge></div><div className="mt-4 flex flex-wrap gap-2"><StatusPill name={review.reviewerStatusName} color={review.reviewerStatusColor} /><StatusPill name={review.employeeStatusName} color={review.employeeStatusColor} /></div><div className="mt-3 flex justify-between text-xs text-slate-500"><span>{review.assignedEmployeeName ?? "غير مكلّف"}</span><span>{formatDate(review.dueDate)}</span></div></button>)}</div>
          {!list.isLoading && list.data?.items.length === 0 ? <EmptyState hasFilters={Boolean(query || priority !== "all" || reviewerStatusId !== "all" || employeeStatusId !== "all" || operationTypeId !== "all")} onReset={resetFilters} /> : null}
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 md:px-5"><p className="text-xs text-slate-500">{list.data ? `${list.data.total} نتيجة` : ""}</p><div className="flex items-center gap-2"><Button variant="outline" size="icon" disabled={page <= 1 || list.isFetching} onClick={() => setPage(current => current - 1)}><ChevronRight className="h-4 w-4" /></Button><span className="min-w-14 text-center text-xs font-medium text-slate-500">{page} / {list.data?.totalPages || 1}</span><Button variant="outline" size="icon" disabled={!list.data || page >= list.data.totalPages || list.isFetching} onClick={() => setPage(current => current + 1)}><ChevronLeft className="h-4 w-4" /></Button></div></div>
          </>}
        </CardContent>
      </Card>
      <CreateReviewDialog open={createOpen} onOpenChange={setCreateOpen} fiscalYearId={fiscalYearId} onCreated={() => utils.reviews.list.invalidate()} />
    </section>
  );
}

function Metric({ label, value, note, blue = false }: { label: string; value: string | number; note: string; blue?: boolean }) { return <Card className="rounded-2xl border-slate-200 bg-white shadow-sm"><CardContent className="p-4"><p className="text-xs font-medium text-slate-500">{label}</p><p className={`mt-2 text-2xl font-bold ${blue ? "text-blue-700" : "text-slate-800"}`}>{value}</p><p className="mt-1 text-xs text-slate-400">{note}</p></CardContent></Card>; }
function StatusPill({ name, color }: { name: string; color: string }) { return <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200"><i className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />{name}</span>; }
function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ id: number; name: string }> }) { return <select aria-label={label} value={value} onChange={event => onChange(event.target.value)} className={filterControlClass}><option value="all">كل {label}</option>{options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select>; }
function LoadingRows() { return <>{Array.from({ length: 6 }).map((_, index) => <tr key={index} className="border-t border-slate-100"><td colSpan={7} className="p-5"><div className="h-5 animate-pulse rounded bg-slate-100" /></td></tr>)}</>; }
function EmptyState({ hasFilters, onReset }: { hasFilters: boolean; onReset: () => void }) { return <div className="flex flex-col items-center justify-center px-5 py-16 text-center"><ClipboardList className="h-9 w-9 text-slate-300" /><h3 className="mt-4 font-bold text-slate-700">لا توجد مراجعات لعرضها</h3><p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">{hasFilters ? "لم تتطابق أي عملية مع الفلاتر الحالية." : "ابدأ بإنشاء أول عملية مراجعة ضمن هذه السنة المالية."}</p>{hasFilters ? <Button variant="outline" onClick={onReset} className="mt-4">مسح الفلاتر</Button> : null}</div>; }
function QueryError({ onRetry }: { onRetry: () => void }) { return <div role="alert" className="flex flex-col items-center justify-center px-5 py-16 text-center"><AlertCircle className="h-9 w-9 text-red-500" /><h3 className="mt-4 font-bold text-slate-700">تعذر تحميل المراجعات</h3><p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">تحقق من الاتصال ثم أعد المحاولة. لم يتغير أي من بيانات المراجعات.</p><Button variant="outline" onClick={onRetry} className="mt-4 border-slate-200">إعادة المحاولة</Button></div>; }

function CreateReviewDialog({ open, onOpenChange, fiscalYearId, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; fiscalYearId: number; onCreated: () => void }) {
  const options = trpc.reviews.formOptions.useQuery({ fiscalYearId }, { enabled: open });
  const [draft, setDraft] = useState({ title: "", voucherNumber: "", operationTypeId: "", reviewerStatusId: "", employeeStatusId: "", assignedEmployeeId: "none", priority: "normal" as "normal" | "urgent" | "critical", dueDate: "", problem: "", requiredAction: "", description: "" });
  const customDefinitions = trpc.customFields.forOperation.useQuery({ fiscalYearId, operationTypeId: Math.max(1, Number(draft.operationTypeId) || 1) }, { enabled: open && Boolean(draft.operationTypeId) });
  const [customValues, setCustomValues] = useState<Record<number, unknown>>({});
  const create = trpc.reviews.create.useMutation();
  const saveCustomValues = trpc.customFields.values.set.useMutation();
  useEffect(() => { if (open && options.data) setDraft(current => ({ ...current, operationTypeId: current.operationTypeId || String(options.data.operationTypes[0]?.id ?? ""), reviewerStatusId: current.reviewerStatusId || String(options.data.reviewerStatuses[0]?.id ?? ""), employeeStatusId: current.employeeStatusId || String(options.data.employeeStatuses[0]?.id ?? "") })); }, [open, options.data]);
  const update = (key: keyof typeof draft, value: string) => setDraft(current => ({ ...current, [key]: value }));
  const submit = async () => {
    if (!draft.title || !draft.operationTypeId || !draft.reviewerStatusId || !draft.employeeStatusId) { toast.error("يرجى استكمال الحقول الإلزامية."); return; }
    const missingCustom = (customDefinitions.data ?? []).some(field => {
      const value = customValues[field.id];
      return field.isRequired && (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0));
    });
    if (missingCustom) { toast.error("يرجى تعبئة الحقول المخصصة الإلزامية."); return; }
    try {
      const result = await create.mutateAsync({ fiscalYearId, title: draft.title, voucherNumber: draft.voucherNumber || null, operationTypeId: Number(draft.operationTypeId), reviewerStatusId: Number(draft.reviewerStatusId), employeeStatusId: Number(draft.employeeStatusId), assignedEmployeeId: draft.assignedEmployeeId === "none" ? null : Number(draft.assignedEmployeeId), priority: draft.priority, dueDate: draft.dueDate || null, problem: draft.problem || null, requiredAction: draft.requiredAction || null, description: draft.description || null });
      if (customDefinitions.data?.length) {
        await saveCustomValues.mutateAsync({
          reviewId: result.id,
          values: customDefinitions.data.map(field => ({ customFieldId: field.id, value: customValues[field.id] ?? null })),
        });
      }
      toast.success(`تم إنشاء المراجعة ${result.internalRef}`); onCreated(); onOpenChange(false); setCustomValues({});
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر إنشاء المراجعة."); }
  };
  const pending = create.isPending || saveCustomValues.isPending;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>إنشاء عملية مراجعة</DialogTitle><DialogDescription>سيُنشأ رقم مراجعة داخلي تلقائي عند الحفظ، وتظهر الحقول الإضافية حسب نوع المهمة.</DialogDescription></DialogHeader>
        {options.isLoading ? <div className="h-64 animate-pulse rounded-xl bg-slate-100" /> : (
          <div className="grid gap-4 py-3 md:grid-cols-2">
            <Field label="عنوان المراجعة *" className="md:col-span-2"><Input value={draft.title} onChange={event => update("title", event.target.value)} placeholder="مثال: مراجعة مستندات الصرف" /></Field>
            <Field label="رقم السند"><Input value={draft.voucherNumber} onChange={event => update("voucherNumber", event.target.value)} /></Field>
            <Field label="التاريخ المستهدف"><Input type="date" value={draft.dueDate} onChange={event => update("dueDate", event.target.value)} /></Field>
            <Field label="نوع العملية *"><NativeSelect value={draft.operationTypeId} onChange={value => { update("operationTypeId", value); setCustomValues({}); }} options={options.data?.operationTypes ?? []} /></Field>
            <Field label="الأولوية *"><select value={draft.priority} onChange={event => update("priority", event.target.value)} className="field-select"><option value="normal">عادية</option><option value="urgent">مستعجلة</option><option value="critical">عاجلة</option></select></Field>
            <Field label="حالة المراجع *"><NativeSelect value={draft.reviewerStatusId} onChange={value => update("reviewerStatusId", value)} options={options.data?.reviewerStatuses ?? []} /></Field>
            <Field label="حالة الموظف *"><NativeSelect value={draft.employeeStatusId} onChange={value => update("employeeStatusId", value)} options={options.data?.employeeStatuses ?? []} /></Field>
            <Field label="الموظف المكلّف"><select value={draft.assignedEmployeeId} onChange={event => update("assignedEmployeeId", event.target.value)} className="field-select"><option value="none">دون تكليف حاليًا</option>{options.data?.employees.map(employee => <option key={employee.id} value={employee.id}>{employee.displayName}{employee.department ? ` — ${employee.department}` : ""}</option>)}</select></Field>
            <div />
            {customDefinitions.isLoading ? <div className="h-16 animate-pulse rounded-xl bg-slate-100 md:col-span-2" /> : customDefinitions.data?.map(field => <CreateCustomField key={field.id} field={field} value={customValues[field.id]} onChange={(value: unknown) => setCustomValues(current => ({ ...current, [field.id]: value }))} />)}
            <Field label="المشكلة" className="md:col-span-2"><Textarea value={draft.problem} onChange={event => update("problem", event.target.value)} placeholder="وصف المشكلة أو الملاحظة محل المراجعة" /></Field>
            <Field label="المطلوب" className="md:col-span-2"><Textarea value={draft.requiredAction} onChange={event => update("requiredAction", event.target.value)} placeholder="الإجراء المطلوب من الموظف" /></Field>
            <Field label="تفاصيل إضافية" className="md:col-span-2"><Textarea value={draft.description} onChange={event => update("description", event.target.value)} /></Field>
            <div className="flex justify-end gap-2 pt-2 md:col-span-2"><Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button><Button disabled={pending} onClick={submit} className="bg-blue-700 hover:bg-blue-800">{pending ? "جارٍ الحفظ…" : "إنشاء المراجعة"}<ArrowLeft className="mr-1 h-4 w-4" /></Button></div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

type CreateFieldDefinition = { id: number; label: string; type: "text" | "textarea" | "number" | "currency" | "date" | "email" | "url" | "select" | "multi_select" | "boolean" | "employee" | "user" | "reviewer_status" | "employee_status"; helpText: string | null; isRequired: boolean; options: Array<{ label: string; value: string }>; referenceOptions: Array<{ id: number; label: string | null }> };

function CreateCustomField({ field, value, onChange }: { field: CreateFieldDefinition; value: unknown; onChange: (value: unknown) => void }) {
  const label = `${field.label}${field.isRequired ? " *" : ""}`;
  const scalarValue = typeof value === "string" || typeof value === "number" ? String(value) : "";
  const choices = field.type === "select" || field.type === "multi_select" ? field.options.map(option => ({ value: option.value, label: option.label })) : field.referenceOptions.map(option => ({ value: String(option.id), label: option.label || `#${option.id}` }));
  if (field.type === "boolean") return <Field label={label} className="md:col-span-2"><label className="flex min-h-10 items-center gap-3 rounded-lg border border-slate-200 px-3 text-sm text-slate-700"><input type="checkbox" checked={value === true} onChange={event => onChange(event.target.checked)} />{field.helpText || "حدد هذا الخيار عند انطباقه."}</label></Field>;
  if (field.type === "textarea") return <Field label={label} help={field.helpText} className="md:col-span-2"><Textarea value={scalarValue} onChange={event => onChange(event.target.value)} /></Field>;
  if (field.type === "multi_select") {
    const selected = Array.isArray(value) ? value.map(String) : [];
    return <Field label={label} help={field.helpText} className="md:col-span-2"><div className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-2">{choices.map(choice => <label key={choice.value} className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={selected.includes(choice.value)} onChange={event => onChange(event.target.checked ? [...selected, choice.value] : selected.filter(item => item !== choice.value))} />{choice.label}</label>)}</div></Field>;
  }
  if (field.type === "select" || field.type === "employee" || field.type === "user" || field.type === "reviewer_status" || field.type === "employee_status") return <Field label={label} help={field.helpText}><select value={scalarValue} onChange={event => onChange(event.target.value || null)} className="field-select"><option value="">اختر قيمة</option>{choices.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select></Field>;
  return <Field label={label} help={field.helpText}><Input type={field.type === "currency" || field.type === "number" ? "number" : field.type} value={scalarValue} onChange={event => onChange(event.target.value)} /></Field>;
}
function Field({ label, help, children, className = "" }: { label: string; help?: string | null; children: React.ReactNode; className?: string }) { return <div className={`grid gap-2 ${className}`}><Label className="text-right text-sm font-semibold text-slate-700">{label}</Label>{help ? <p className="text-xs text-slate-500">{help}</p> : null}{children}</div>; }
function NativeSelect({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: Array<{ id: number; name: string }> }) { return <select value={value} onChange={event => onChange(event.target.value)} className="field-select"><option value="" disabled>اختر…</option>{options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select>; }
