import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import FiscalYearSettings from "@/components/FiscalYearSettings";
import WorkflowSettings from "@/components/WorkflowSettings";
import { Link2, ListPlus, Pencil, Power, SlidersHorizontal, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type FieldType = "text" | "number" | "date" | "select" | "boolean";

const fieldTypeLabels: Record<FieldType, string> = {
  text: "نص",
  number: "رقم",
  date: "تاريخ",
  select: "قائمة",
  boolean: "نعم / لا",
};

export default function Settings() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const canManage = Boolean(user?.permissions?.includes("*") || user?.permissions?.includes("settings.manage"));
  const fields = trpc.customFields.list.useQuery(undefined, { enabled: canManage });
  const operationTypes = trpc.settings.operationTypes.list.useQuery(undefined, { enabled: canManage });
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const [selectedFieldId, setSelectedFieldId] = useState<number | null>(null);
  const [optionLabel, setOptionLabel] = useState("");
  const [optionValue, setOptionValue] = useState("");
  const [editingOptionId, setEditingOptionId] = useState<number | null>(null);
  const [editingOptionLabel, setEditingOptionLabel] = useState("");
  const [editingOptionValue, setEditingOptionValue] = useState("");

  const refresh = () => utils.customFields.list.invalidate();
  const create = trpc.customFields.create.useMutation({
    onSuccess: async () => {
      setLabel("");
      setKey("");
      await refresh();
      toast.success("تم إنشاء الحقل المخصص.");
    },
    onError: error => toast.error(error.message),
  });
  const setActive = trpc.customFields.setActive.useMutation({ onSuccess: refresh, onError: error => toast.error(error.message) });
  const setOptions = trpc.customFields.setOptions.useMutation({ onSuccess: async () => { setOptionLabel(""); setOptionValue(""); setEditingOptionId(null); await refresh(); toast.success("تم تحديث خيارات القائمة."); }, onError: error => toast.error(error.message) });
  const setOperationTypes = trpc.customFields.setOperationTypes.useMutation({ onSuccess: refresh, onError: error => toast.error(error.message) });
  const selectedField = fields.data?.find(field => field.id === selectedFieldId) ?? null;

  if (!canManage) {
    return <section dir="rtl" className="mx-auto max-w-4xl"><Card className="rounded-2xl"><CardContent className="p-8 text-center text-slate-500">ليس لديك صلاحية إدارة الإعدادات.</CardContent></Card></section>;
  }

  const toggleOperationType = (operationTypeId: number) => {
    if (!selectedField) return;
    const current = selectedField.operationTypes.map(mapping => ({ operationTypeId: mapping.operationTypeId, isRequiredOverride: mapping.isRequiredOverride, sortOrder: 0 }));
    const exists = current.some(mapping => mapping.operationTypeId === operationTypeId);
    const mappings = exists ? current.filter(mapping => mapping.operationTypeId !== operationTypeId) : [...current, { operationTypeId, isRequiredOverride: null, sortOrder: current.length }];
    setOperationTypes.mutate({ customFieldId: selectedField.id, mappings });
  };

  const addSelectOption = () => {
    if (!selectedField || !optionLabel.trim() || !optionValue.trim()) return;
    const options = [...selectedField.options.map(option => ({ label: option.label, value: option.value, sortOrder: option.sortOrder, isActive: option.isActive })), { label: optionLabel.trim(), value: optionValue.trim(), sortOrder: selectedField.options.length, isActive: true }];
    setOptions.mutate({ customFieldId: selectedField.id, options });
  };

  const saveOptions = (options: Array<{ label: string; value: string; sortOrder: number; isActive: boolean }>) => {
    if (selectedField) setOptions.mutate({ customFieldId: selectedField.id, options });
  };

  return (
    <section dir="rtl" className="mx-auto max-w-5xl space-y-6">
      <div>
        <p className="text-sm font-semibold text-blue-700">إعدادات قابلة للتوسعة</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">الحقول المخصصة</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">أضف بيانات إضافية إلى عمليات المراجعة، واربط كل حقل بأنواع العمليات المناسبة دون أي تعديل في هيكل قاعدة البيانات.</p>
      </div>

      <Card className="rounded-2xl border-blue-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><ListPlus className="h-4 w-4 text-blue-700" />حقل جديد</CardTitle>
          <CardDescription>المعرّف التقني فريد ويستخدم أحرفًا إنجليزية صغيرة وأرقامًا وشرطة سفلية فقط.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <Input value={label} onChange={event => setLabel(event.target.value)} placeholder="اسم الحقل الظاهر" />
          <Input value={key} onChange={event => setKey(event.target.value)} placeholder="technical_key" dir="ltr" />
          <select value={type} onChange={event => setType(event.target.value as FieldType)} className="field-select"><option value="text">نص</option><option value="number">رقم</option><option value="date">تاريخ</option><option value="select">قائمة</option><option value="boolean">نعم / لا</option></select>
          <Button disabled={!label.trim() || !key.trim() || create.isPending} onClick={() => create.mutate({ label: label.trim(), key: key.trim(), type })} className="gap-2 bg-blue-700 hover:bg-blue-800"><SlidersHorizontal className="h-4 w-4" />{create.isPending ? "جارٍ الإضافة…" : "إضافة الحقل"}</Button>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader><CardTitle className="text-base">الحقول المعرفة</CardTitle><CardDescription>التعطيل يبقي القيم التاريخية محفوظة ولا يظهر الحقل في النماذج الجديدة.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {fields.isLoading ? <p className="p-4 text-sm text-slate-500">جارٍ تحميل الحقول…</p> : fields.data?.length ? fields.data.map(field => (
            <div key={field.id} className={`flex flex-col justify-between gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center ${selectedField?.id === field.id ? "border-blue-300 bg-blue-50/40" : "border-slate-100"}`}>
              <button onClick={() => setSelectedFieldId(field.id)} className="min-w-0 text-right"><p className="font-semibold text-slate-800">{field.label} <span className="mr-2 text-xs font-normal text-slate-400">({fieldTypeLabels[field.type]})</span></p><p className="mt-1 font-mono text-xs text-slate-400" dir="ltr">{field.key}</p></button>
              <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setSelectedFieldId(field.id)}><Link2 className="ml-1 h-3.5 w-3.5" />تخصيص</Button><Button variant="outline" size="sm" onClick={() => setActive.mutate({ id: field.id, isActive: !field.isActive })} className={field.isActive ? "text-amber-700" : "text-emerald-700"}><Power className="ml-1 h-3.5 w-3.5" />{field.isActive ? "تعطيل" : "تفعيل"}</Button></div>
            </div>
          )) : <div className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">لم تُنشأ حقول مخصصة بعد.</div>}
        </CardContent>
      </Card>

      {selectedField ? <Card className="rounded-2xl border-indigo-100">
        <CardHeader><CardTitle className="text-base">تخصيص: {selectedField.label}</CardTitle><CardDescription>حدّد أنواع العمليات التي سيظهر فيها الحقل. يتم حفظ كل تغيير فورًا.</CardDescription></CardHeader>
        <CardContent className="space-y-6">
          <div><p className="mb-3 text-sm font-semibold text-slate-700">ربط بأنواع العمليات</p><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{operationTypes.data?.filter(item => item.isActive).map(item => { const checked = selectedField.operationTypes.some(mapping => mapping.operationTypeId === item.id); return <label key={item.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"><input type="checkbox" checked={checked} onChange={() => toggleOperationType(item.id)} disabled={setOperationTypes.isPending} />{item.name}</label>; })}</div>{operationTypes.data?.length === 0 ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">أنشئ نوع عملية واحدًا على الأقل من إعدادات سير العمل قبل الربط.</p> : null}</div>
          {selectedField.type === "select" ? <div className="border-t border-slate-100 pt-5"><p className="mb-3 text-sm font-semibold text-slate-700">خيارات القائمة</p><div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]"><Input value={optionLabel} onChange={event => setOptionLabel(event.target.value)} placeholder="النص الظاهر" /><Input value={optionValue} onChange={event => setOptionValue(event.target.value)} placeholder="القيمة التقنية" dir="ltr" /><Button disabled={!optionLabel.trim() || !optionValue.trim() || setOptions.isPending} onClick={addSelectOption} className="bg-blue-700 hover:bg-blue-800">إضافة خيار</Button></div><div className="mt-4 space-y-2">{selectedField.options.length ? selectedField.options.map(option => editingOptionId === option.id ? <div key={option.id} className="grid gap-2 rounded-xl border border-blue-200 bg-blue-50/40 p-3 md:grid-cols-[1fr_1fr_auto_auto]"><Input value={editingOptionLabel} onChange={event => setEditingOptionLabel(event.target.value)} /><Input value={editingOptionValue} onChange={event => setEditingOptionValue(event.target.value)} dir="ltr" /><Button size="sm" disabled={!editingOptionLabel.trim() || !editingOptionValue.trim() || setOptions.isPending} onClick={() => saveOptions(selectedField.options.map(item => item.id === option.id ? { label: editingOptionLabel.trim(), value: editingOptionValue.trim(), sortOrder: item.sortOrder, isActive: item.isActive } : { label: item.label, value: item.value, sortOrder: item.sortOrder, isActive: item.isActive }))}>حفظ</Button><Button size="sm" variant="ghost" onClick={() => setEditingOptionId(null)}>إلغاء</Button></div> : <div key={option.id} className="flex flex-col justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2.5 sm:flex-row sm:items-center"><div><span className={`text-sm font-medium ${option.isActive ? "text-slate-700" : "text-slate-400 line-through"}`}>{option.label}</span><span className="mr-2 font-mono text-xs text-slate-400" dir="ltr">{option.value}</span></div><div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => { setEditingOptionId(option.id); setEditingOptionLabel(option.label); setEditingOptionValue(option.value); }}><Pencil className="h-3.5 w-3.5" />تعديل</Button><Button size="sm" variant="ghost" onClick={() => saveOptions(selectedField.options.map(item => ({ label: item.label, value: item.value, sortOrder: item.sortOrder, isActive: item.id === option.id ? !item.isActive : item.isActive })))}><Power className="h-3.5 w-3.5" />{option.isActive ? "تعطيل" : "تفعيل"}</Button><Button size="icon" variant="ghost" className="text-red-600 hover:text-red-700" aria-label={`حذف ${option.label}`} onClick={() => saveOptions(selectedField.options.filter(item => item.id !== option.id).map(item => ({ label: item.label, value: item.value, sortOrder: item.sortOrder, isActive: item.isActive })))}><Trash2 className="h-3.5 w-3.5" /></Button></div></div>) : <p className="text-sm text-slate-500">لا توجد خيارات بعد.</p>}</div></div> : null}
        </CardContent>
      </Card> : null}
      <WorkflowSettings />
      <FiscalYearSettings />
    </section>
  );
}
