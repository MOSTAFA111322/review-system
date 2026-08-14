import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { AlertCircle, ArrowLeft, ChevronLeft, ChevronRight, CirclePlus, ClipboardList, Filter, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type Props = { fiscalYearId: number; fiscalYearName: string; isClosed: boolean };

const priorityMeta = {
  normal: { label: "عادية", className: "bg-slate-100 text-slate-600" },
  urgent: { label: "مستعجلة", className: "bg-amber-50 text-amber-700 ring-1 ring-amber-200" },
  critical: { label: "عاجلة", className: "bg-red-50 text-red-700 ring-1 ring-red-200" },
} as const;

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
  const [sortBy, setSortBy] = useState<"createdAt" | "dueDate" | "internalRef" | "priority">("createdAt");
  const [createOpen, setCreateOpen] = useState(false);
  const filters = useMemo(() => ({
    fiscalYearId, page, pageSize: 15, query: query || undefined,
    priorities: priority === "all" ? undefined : [priority],
    reviewerStatusIds: reviewerStatusId === "all" ? undefined : [Number(reviewerStatusId)],
    employeeStatusIds: employeeStatusId === "all" ? undefined : [Number(employeeStatusId)],
    operationTypeIds: operationTypeId === "all" ? undefined : [Number(operationTypeId)],
    sortBy, sortDirection: "desc" as const,
  }), [fiscalYearId, page, query, priority, reviewerStatusId, employeeStatusId, operationTypeId, sortBy]);
  const list = trpc.reviews.list.useQuery(filters);
  const options = trpc.reviews.filterOptions.useQuery({ fiscalYearId });
  const resetFilters = () => { setPage(1); setQuery(""); setPriority("all"); setReviewerStatusId("all"); setEmployeeStatusId("all"); setOperationTypeId("all"); setSortBy("createdAt"); };

  return (
    <section dir="rtl" className="mx-auto max-w-[1500px] space-y-5">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-blue-600" /><p className="text-sm font-medium text-slate-500">{fiscalYearName}</p>{isClosed ? <Badge className="bg-slate-700">سنة مغلقة</Badge> : null}</div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">عمليات المراجعة</h1>
          <p className="mt-2 text-sm text-slate-500">تابع الحالة والتكليفات والتواريخ المستهدفة من مكان واحد.</p>
        </div>
        {canCreate && !isClosed ? <Button onClick={() => setCreateOpen(true)} className="h-11 gap-2 bg-blue-700 px-5 shadow-md shadow-blue-700/20 hover:bg-blue-800"><CirclePlus className="h-4 w-4" />إنشاء مراجعة</Button> : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="إجمالي النتائج" value={list.data?.total ?? "—"} note="حسب الفلاتر الحالية" />
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
                <select aria-label="الأولوية" value={priority} onChange={event => { setPage(1); setPriority(event.target.value as typeof priority); }} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none focus:border-blue-500"><option value="all">كل الأولويات</option><option value="normal">عادية</option><option value="urgent">مستعجلة</option><option value="critical">عاجلة</option></select>
                <select aria-label="الفرز" value={sortBy} onChange={event => setSortBy(event.target.value as typeof sortBy)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none focus:border-blue-500"><option value="createdAt">الأحدث أولاً</option><option value="dueDate">التاريخ المستهدف</option><option value="internalRef">رقم المراجعة</option><option value="priority">الأولوية</option></select>
                <Button variant="outline" onClick={resetFilters} className="h-10 gap-2 border-slate-200 text-slate-600 hover:bg-slate-50"><SlidersHorizontal className="h-4 w-4" /><span className="hidden sm:inline">إعادة ضبط</span></Button>
              </div>
            </div>
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-right"><thead className="bg-slate-50/80 text-xs text-slate-500"><tr><th className="px-5 py-4 font-semibold">المرجع</th><th className="px-4 py-4 font-semibold">العملية</th><th className="px-4 py-4 font-semibold">الأولوية</th><th className="px-4 py-4 font-semibold">حالة المراجع</th><th className="px-4 py-4 font-semibold">حالة الموظف</th><th className="px-4 py-4 font-semibold">المكلّف</th><th className="px-5 py-4 font-semibold">التاريخ المستهدف</th></tr></thead>
              <tbody>{list.isLoading ? <LoadingRows /> : list.data?.items.map(review => <tr key={review.id} onClick={() => setLocation(`/reviews/${review.id}`)} className="group cursor-pointer border-t border-slate-100 transition-colors hover:bg-blue-50/50"><td className="px-5 py-4"><p className="font-mono text-xs font-bold text-blue-700">{review.internalRef}</p><p className="mt-1 max-w-[235px] truncate text-sm font-semibold text-slate-700">{review.title}</p></td><td className="px-4 py-4"><span className="inline-flex items-center gap-2 text-sm text-slate-600"><i className="h-2 w-2 rounded-full" style={{ backgroundColor: review.operationTypeColor }} />{review.operationTypeName}</span></td><td className="px-4 py-4"><Badge className={priorityMeta[review.priority].className}>{priorityMeta[review.priority].label}</Badge></td><td className="px-4 py-4"><StatusPill name={review.reviewerStatusName} color={review.reviewerStatusColor} /></td><td className="px-4 py-4"><StatusPill name={review.employeeStatusName} color={review.employeeStatusColor} /></td><td className="px-4 py-4 text-sm text-slate-600">{review.assignedEmployeeName ?? "غير مكلّف"}</td><td className="px-5 py-4 text-sm text-slate-500">{formatDate(review.dueDate)}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="space-y-3 p-4 md:hidden">{list.isLoading ? <div className="h-48 animate-pulse rounded-xl bg-slate-100" /> : list.data?.items.map(review => <button key={review.id} onClick={() => setLocation(`/reviews/${review.id}`)} className="w-full rounded-xl border border-slate-200 p-4 text-right shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs font-bold text-blue-700">{review.internalRef}</p><p className="mt-1 font-semibold text-slate-800">{review.title}</p></div><Badge className={priorityMeta[review.priority].className}>{priorityMeta[review.priority].label}</Badge></div><div className="mt-4 flex flex-wrap gap-2"><StatusPill name={review.reviewerStatusName} color={review.reviewerStatusColor} /><StatusPill name={review.employeeStatusName} color={review.employeeStatusColor} /></div><div className="mt-3 flex justify-between text-xs text-slate-500"><span>{review.assignedEmployeeName ?? "غير مكلّف"}</span><span>{formatDate(review.dueDate)}</span></div></button>)}</div>
          {!list.isLoading && list.data?.items.length === 0 ? <EmptyState hasFilters={Boolean(query || priority !== "all" || reviewerStatusId !== "all" || employeeStatusId !== "all" || operationTypeId !== "all")} onReset={resetFilters} /> : null}
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 md:px-5"><p className="text-xs text-slate-500">{list.data ? `${list.data.total} نتيجة` : ""}</p><div className="flex items-center gap-2"><Button variant="outline" size="icon" disabled={page <= 1 || list.isFetching} onClick={() => setPage(current => current - 1)}><ChevronRight className="h-4 w-4" /></Button><span className="min-w-14 text-center text-xs font-medium text-slate-500">{page} / {list.data?.totalPages || 1}</span><Button variant="outline" size="icon" disabled={!list.data || page >= list.data.totalPages || list.isFetching} onClick={() => setPage(current => current + 1)}><ChevronLeft className="h-4 w-4" /></Button></div></div>
        </CardContent>
      </Card>
      <CreateReviewDialog open={createOpen} onOpenChange={setCreateOpen} fiscalYearId={fiscalYearId} onCreated={() => utils.reviews.list.invalidate()} />
    </section>
  );
}

function Metric({ label, value, note, blue = false }: { label: string; value: string | number; note: string; blue?: boolean }) { return <Card className="rounded-2xl border-slate-200 bg-white shadow-sm"><CardContent className="p-4"><p className="text-xs font-medium text-slate-500">{label}</p><p className={`mt-2 text-2xl font-bold ${blue ? "text-blue-700" : "text-slate-800"}`}>{value}</p><p className="mt-1 text-xs text-slate-400">{note}</p></CardContent></Card>; }
function StatusPill({ name, color }: { name: string; color: string }) { return <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200"><i className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />{name}</span>; }
function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ id: number; name: string }> }) { return <select aria-label={label} value={value} onChange={event => onChange(event.target.value)} className="h-10 max-w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none focus:border-blue-500"><option value="all">كل {label}</option>{options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select>; }
function LoadingRows() { return <>{Array.from({ length: 6 }).map((_, index) => <tr key={index} className="border-t border-slate-100"><td colSpan={7} className="p-5"><div className="h-5 animate-pulse rounded bg-slate-100" /></td></tr>)}</>; }
function EmptyState({ hasFilters, onReset }: { hasFilters: boolean; onReset: () => void }) { return <div className="flex flex-col items-center justify-center px-5 py-16 text-center"><ClipboardList className="h-9 w-9 text-slate-300" /><h3 className="mt-4 font-bold text-slate-700">لا توجد مراجعات لعرضها</h3><p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">{hasFilters ? "لم تتطابق أي عملية مع الفلاتر الحالية." : "ابدأ بإنشاء أول عملية مراجعة ضمن هذه السنة المالية."}</p>{hasFilters ? <Button variant="outline" onClick={onReset} className="mt-4">مسح الفلاتر</Button> : null}</div>; }

function CreateReviewDialog({ open, onOpenChange, fiscalYearId, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; fiscalYearId: number; onCreated: () => void }) {
  const options = trpc.reviews.formOptions.useQuery({ fiscalYearId }, { enabled: open });
  const create = trpc.reviews.create.useMutation({ onSuccess: result => { toast.success(`تم إنشاء المراجعة ${result.internalRef}`); onCreated(); onOpenChange(false); } });
  const [draft, setDraft] = useState({ title: "", voucherNumber: "", operationTypeId: "", reviewerStatusId: "", employeeStatusId: "", assignedEmployeeId: "none", priority: "normal" as "normal" | "urgent" | "critical", dueDate: "", problem: "", requiredAction: "", description: "" });
  useEffect(() => { if (open && options.data) setDraft(current => ({ ...current, operationTypeId: current.operationTypeId || String(options.data.operationTypes[0]?.id ?? ""), reviewerStatusId: current.reviewerStatusId || String(options.data.reviewerStatuses[0]?.id ?? ""), employeeStatusId: current.employeeStatusId || String(options.data.employeeStatuses[0]?.id ?? "") })); }, [open, options.data]);
  const update = (key: keyof typeof draft, value: string) => setDraft(current => ({ ...current, [key]: value }));
  const submit = () => { if (!draft.title || !draft.operationTypeId || !draft.reviewerStatusId || !draft.employeeStatusId) { toast.error("يرجى استكمال الحقول الإلزامية."); return; } create.mutate({ fiscalYearId, title: draft.title, voucherNumber: draft.voucherNumber || null, operationTypeId: Number(draft.operationTypeId), reviewerStatusId: Number(draft.reviewerStatusId), employeeStatusId: Number(draft.employeeStatusId), assignedEmployeeId: draft.assignedEmployeeId === "none" ? null : Number(draft.assignedEmployeeId), priority: draft.priority, dueDate: draft.dueDate || null, problem: draft.problem || null, requiredAction: draft.requiredAction || null, description: draft.description || null }); };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent dir="rtl" className="max-h-[92vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>إنشاء عملية مراجعة</DialogTitle><DialogDescription>سيُنشأ رقم مراجعة داخلي تلقائي عند الحفظ.</DialogDescription></DialogHeader>{options.isLoading ? <div className="h-64 animate-pulse rounded-xl bg-slate-100" /> : <div className="grid gap-4 py-3 md:grid-cols-2"><Field label="عنوان المراجعة *" className="md:col-span-2"><Input value={draft.title} onChange={event => update("title", event.target.value)} placeholder="مثال: مراجعة مستندات الصرف" /></Field><Field label="رقم السند"><Input value={draft.voucherNumber} onChange={event => update("voucherNumber", event.target.value)} /></Field><Field label="التاريخ المستهدف"><Input type="date" value={draft.dueDate} onChange={event => update("dueDate", event.target.value)} /></Field><Field label="نوع العملية *"><NativeSelect value={draft.operationTypeId} onChange={value => update("operationTypeId", value)} options={options.data?.operationTypes ?? []} /></Field><Field label="الأولوية *"><select value={draft.priority} onChange={event => update("priority", event.target.value)} className="field-select"><option value="normal">عادية</option><option value="urgent">مستعجلة</option><option value="critical">عاجلة</option></select></Field><Field label="حالة المراجع *"><NativeSelect value={draft.reviewerStatusId} onChange={value => update("reviewerStatusId", value)} options={options.data?.reviewerStatuses ?? []} /></Field><Field label="حالة الموظف *"><NativeSelect value={draft.employeeStatusId} onChange={value => update("employeeStatusId", value)} options={options.data?.employeeStatuses ?? []} /></Field><Field label="الموظف المكلّف"><select value={draft.assignedEmployeeId} onChange={event => update("assignedEmployeeId", event.target.value)} className="field-select"><option value="none">دون تكليف حاليًا</option>{options.data?.employees.map(employee => <option key={employee.id} value={employee.id}>{employee.displayName}{employee.department ? ` — ${employee.department}` : ""}</option>)}</select></Field><div /><Field label="المشكلة" className="md:col-span-2"><Textarea value={draft.problem} onChange={event => update("problem", event.target.value)} placeholder="وصف المشكلة أو الملاحظة محل المراجعة" /></Field><Field label="المطلوب" className="md:col-span-2"><Textarea value={draft.requiredAction} onChange={event => update("requiredAction", event.target.value)} placeholder="الإجراء المطلوب من الموظف" /></Field><Field label="تفاصيل إضافية" className="md:col-span-2"><Textarea value={draft.description} onChange={event => update("description", event.target.value)} /></Field><div className="flex justify-end gap-2 pt-2 md:col-span-2"><Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button><Button disabled={create.isPending} onClick={submit} className="bg-blue-700 hover:bg-blue-800">{create.isPending ? "جارٍ الحفظ…" : "إنشاء المراجعة"}<ArrowLeft className="mr-1 h-4 w-4" /></Button></div></div>}</DialogContent></Dialog>;
}
function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) { return <div className={`grid gap-2 ${className}`}><Label className="text-right text-sm font-semibold text-slate-700">{label}</Label>{children}</div>; }
function NativeSelect({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: Array<{ id: number; name: string }> }) { return <select value={value} onChange={event => onChange(event.target.value)} className="field-select"><option value="" disabled>اختر…</option>{options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select>; }
