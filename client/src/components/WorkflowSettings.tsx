import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { ArrowRightLeft, CircleDot, Pencil, Plus, Power } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type WorkflowSide = "reviewer" | "employee";

const defaultColor = "#2563eb";

export default function WorkflowSettings() {
  const { user } = useAuth();
  const canManage = Boolean(user?.permissions?.includes("*") || user?.permissions?.includes("settings.manage"));
  const utils = trpc.useUtils();
  const operationTypes = trpc.settings.operationTypes.list.useQuery(undefined, { enabled: canManage });
  const reviewerStatuses = trpc.settings.reviewerStatuses.list.useQuery(undefined, { enabled: canManage });
  const employeeStatuses = trpc.settings.employeeStatuses.list.useQuery(undefined, { enabled: canManage });
  const transitions = trpc.settings.transitions.list.useQuery(undefined, { enabled: canManage });
  const permissionOptions = trpc.settings.transitions.permissionOptions.useQuery(undefined, { enabled: canManage });
  const [typeName, setTypeName] = useState("");
  const [typeDescription, setTypeDescription] = useState("");
  const [statusSide, setStatusSide] = useState<WorkflowSide>("reviewer");
  const [statusName, setStatusName] = useState("");
  const [statusCode, setStatusCode] = useState("");
  const [terminal, setTerminal] = useState(false);
  const [transitionSide, setTransitionSide] = useState<WorkflowSide>("reviewer");
  const [fromStatusId, setFromStatusId] = useState<number | null>(null);
  const [toStatusId, setToStatusId] = useState<number | null>(null);
  const [requiredPermission, setRequiredPermission] = useState("");

  const refresh = () => Promise.all([
    utils.settings.operationTypes.list.invalidate(),
    utils.settings.reviewerStatuses.list.invalidate(),
    utils.settings.employeeStatuses.list.invalidate(),
    utils.settings.transitions.list.invalidate(),
  ]);
  const createType = trpc.settings.operationTypes.create.useMutation({ onSuccess: async () => { setTypeName(""); setTypeDescription(""); await refresh(); toast.success("تمت إضافة نوع العملية."); }, onError: error => toast.error(error.message) });
  const updateType = trpc.settings.operationTypes.update.useMutation({ onSuccess: refresh, onError: error => toast.error(error.message) });
  const setTypeActive = trpc.settings.operationTypes.setActive.useMutation({ onSuccess: refresh, onError: error => toast.error(error.message) });
  const createReviewerStatus = trpc.settings.reviewerStatuses.create.useMutation({ onSuccess: async () => { setStatusName(""); setStatusCode(""); setTerminal(false); await refresh(); toast.success("تمت إضافة حالة المراجع."); }, onError: error => toast.error(error.message) });
  const createEmployeeStatus = trpc.settings.employeeStatuses.create.useMutation({ onSuccess: async () => { setStatusName(""); setStatusCode(""); setTerminal(false); await refresh(); toast.success("تمت إضافة حالة الموظف."); }, onError: error => toast.error(error.message) });
  const updateReviewerStatus = trpc.settings.reviewerStatuses.update.useMutation({ onSuccess: refresh, onError: error => toast.error(error.message) });
  const updateEmployeeStatus = trpc.settings.employeeStatuses.update.useMutation({ onSuccess: refresh, onError: error => toast.error(error.message) });
  const setReviewerActive = trpc.settings.reviewerStatuses.setActive.useMutation({ onSuccess: refresh, onError: error => toast.error(error.message) });
  const setEmployeeActive = trpc.settings.employeeStatuses.setActive.useMutation({ onSuccess: refresh, onError: error => toast.error(error.message) });
  const createTransition = trpc.settings.transitions.create.useMutation({ onSuccess: async () => { await refresh(); toast.success("تمت إضافة قاعدة انتقال الحالة."); }, onError: error => toast.error(error.message) });
  const setTransitionActive = trpc.settings.transitions.setActive.useMutation({ onSuccess: refresh, onError: error => toast.error(error.message) });

  const transitionStatuses = transitionSide === "reviewer" ? reviewerStatuses.data ?? [] : employeeStatuses.data ?? [];
  useEffect(() => {
    if (!requiredPermission && permissionOptions.data?.[0]) setRequiredPermission(permissionOptions.data[0].code);
  }, [permissionOptions.data, requiredPermission]);
  useEffect(() => {
    if (!transitionStatuses.length) { setFromStatusId(null); setToStatusId(null); return; }
    setFromStatusId(previous => transitionStatuses.some(item => item.id === previous) ? previous : transitionStatuses[0].id);
    setToStatusId(previous => transitionStatuses.some(item => item.id === previous) ? previous : transitionStatuses[Math.min(1, transitionStatuses.length - 1)].id);
  }, [transitionSide, transitionStatuses]);

  if (!canManage) return null;
  const statusItems = statusSide === "reviewer" ? reviewerStatuses.data ?? [] : employeeStatuses.data ?? [];
  const createStatus = () => {
    const input = { name: statusName.trim(), code: statusCode.trim().toLowerCase(), color: defaultColor, isTerminal: terminal, sortOrder: statusItems.length };
    if (!input.name || !input.code) return;
    if (statusSide === "reviewer") createReviewerStatus.mutate(input); else createEmployeeStatus.mutate(input);
  };
  const editType = (item: NonNullable<typeof operationTypes.data>[number]) => {
    const name = window.prompt("اسم نوع العملية", item.name)?.trim();
    if (!name) return;
    const description = window.prompt("وصف مختصر (اختياري)", item.description ?? "");
    updateType.mutate({ id: item.id, name, description: description?.trim() || null, color: item.color, sortOrder: item.sortOrder, isActive: item.isActive });
  };
  const editStatus = (side: WorkflowSide, item: NonNullable<typeof reviewerStatuses.data>[number]) => {
    const name = window.prompt("اسم الحالة", item.name)?.trim();
    if (!name) return;
    const code = window.prompt("الرمز التقني", item.code)?.trim().toLowerCase();
    if (!code) return;
    const input = { id: item.id, name, code, color: item.color, isTerminal: item.isTerminal, sortOrder: item.sortOrder, isActive: item.isActive };
    if (side === "reviewer") updateReviewerStatus.mutate(input); else updateEmployeeStatus.mutate(input);
  };

  return <section dir="rtl" className="mt-8 space-y-6 border-t border-slate-200 pt-8">
    <div><p className="text-sm font-semibold text-blue-700">سير العمل الديناميكي</p><h2 className="mt-1 text-xl font-bold text-slate-900">أنواع المراجعات والحالات</h2><p className="mt-2 text-sm leading-6 text-slate-500">تُدار المرجعيات وقواعد الانتقال من البيانات؛ لا يلزم تعديل الكود لإضافة مسار عمل جديد أو تعطيل مرجع قديم.</p></div>
    <Card className="rounded-2xl"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Plus className="h-4 w-4 text-blue-700" />أنواع العمليات</CardTitle><CardDescription>النوع يصنف المراجعة ويحدد حقولها المخصصة المرتبطة.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 md:grid-cols-[1fr_1.5fr_auto]"><Input value={typeName} onChange={event => setTypeName(event.target.value)} placeholder="مثل: تدقيق مستند" /><Input value={typeDescription} onChange={event => setTypeDescription(event.target.value)} placeholder="وصف مختصر (اختياري)" /><Button disabled={!typeName.trim() || createType.isPending} onClick={() => createType.mutate({ name: typeName.trim(), description: typeDescription.trim() || undefined, color: defaultColor, sortOrder: operationTypes.data?.length ?? 0 })} className="bg-blue-700 hover:bg-blue-800">إضافة النوع</Button></div><div className="grid gap-2 md:grid-cols-2">{operationTypes.data?.map(item => <div key={item.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-3"><div className="min-w-0"><p className="font-medium text-slate-800">{item.name}</p><p className="mt-1 truncate text-xs text-slate-500">{item.description || "لا يوجد وصف"}</p></div><div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => editType(item)} aria-label={`تعديل ${item.name}`}><Pencil className="h-3.5 w-3.5" /></Button><Button size="sm" variant="ghost" className={item.isActive ? "text-amber-700" : "text-emerald-700"} onClick={() => setTypeActive.mutate({ id: item.id, isActive: !item.isActive })}>{item.isActive ? "تعطيل" : "تفعيل"}</Button></div></div>)}</div></CardContent></Card>
    <Card className="rounded-2xl"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><CircleDot className="h-4 w-4 text-blue-700" />حالات المراجع والموظف</CardTitle><CardDescription>الحالة النهائية تدخل في احتساب اكتمال المراجعة؛ ولا تكتمل العملية إلا عند تحقق الحالتين النهائيتين.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 md:grid-cols-[150px_1fr_1fr_auto]"><select value={statusSide} onChange={event => setStatusSide(event.target.value as WorkflowSide)} className="field-select"><option value="reviewer">حالة المراجع</option><option value="employee">حالة الموظف</option></select><Input value={statusName} onChange={event => setStatusName(event.target.value)} placeholder="اسم الحالة" /><Input value={statusCode} onChange={event => setStatusCode(event.target.value.replace(/[^a-z0-9_]/g, ""))} placeholder="status_code" dir="ltr" /><Button disabled={!statusName.trim() || !statusCode.trim()} onClick={createStatus} className="bg-blue-700 hover:bg-blue-800">إضافة الحالة</Button></div><label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={terminal} onChange={event => setTerminal(event.target.checked)} />حالة نهائية</label><div className="grid gap-2 md:grid-cols-2">{statusItems.map(item => <div key={item.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-3"><div><p className="font-medium text-slate-800">{item.name} {item.isTerminal ? <span className="mr-1 rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-700">نهائية</span> : null}</p><p className="mt-1 font-mono text-xs text-slate-400" dir="ltr">{item.code}</p></div><div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => editStatus(statusSide, item)} aria-label={`تعديل ${item.name}`}><Pencil className="h-3.5 w-3.5" /></Button><Button size="sm" variant="ghost" className={item.isActive ? "text-amber-700" : "text-emerald-700"} onClick={() => statusSide === "reviewer" ? setReviewerActive.mutate({ id: item.id, isActive: !item.isActive }) : setEmployeeActive.mutate({ id: item.id, isActive: !item.isActive })}><Power className="ml-1 h-3.5 w-3.5" />{item.isActive ? "تعطيل" : "تفعيل"}</Button></div></div>)}</div></CardContent></Card>
    <Card className="rounded-2xl"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><ArrowRightLeft className="h-4 w-4 text-blue-700" />قواعد انتقال الحالة</CardTitle><CardDescription>يفرض الخادم هذه القواعد قبل قبول أي تغيير للحالة؛ إخفاء زر في الواجهة لا يغني عنها.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 md:grid-cols-4"><select value={transitionSide} onChange={event => setTransitionSide(event.target.value as WorkflowSide)} className="field-select"><option value="reviewer">مسار المراجع</option><option value="employee">مسار الموظف</option></select><select value={fromStatusId ?? ""} onChange={event => setFromStatusId(Number(event.target.value))} className="field-select">{transitionStatuses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select value={toStatusId ?? ""} onChange={event => setToStatusId(Number(event.target.value))} className="field-select">{transitionStatuses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select value={requiredPermission} onChange={event => setRequiredPermission(event.target.value)} className="field-select">{permissionOptions.data?.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</select></div><Button disabled={!fromStatusId || !toStatusId || !requiredPermission || createTransition.isPending} onClick={() => createTransition.mutate({ side: transitionSide, fromStatusId: fromStatusId!, toStatusId: toStatusId!, requiredPermission })} className="bg-blue-700 hover:bg-blue-800">إضافة قاعدة انتقال</Button><div className="space-y-2">{transitions.data?.map(item => <div key={item.id} className="flex flex-col justify-between gap-3 rounded-xl border border-slate-100 px-3 py-3 sm:flex-row sm:items-center"><p className="text-sm text-slate-700">{item.side === "reviewer" ? "المراجع" : "الموظف"} · انتقال محكوم بصلاحية <span className="font-mono text-xs text-blue-700">{item.requiredPermission}</span></p><Button size="sm" variant="outline" onClick={() => setTransitionActive.mutate({ id: item.id, isActive: !item.isActive })}>{item.isActive ? "تعطيل" : "تفعيل"}</Button></div>)}</div></CardContent></Card>
  </section>;
}
