import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { FileSpreadsheet, Upload } from "lucide-react";
import * as XLSX from "xlsx";
import { useState } from "react";
import { toast } from "sonner";

type ImportRow = {
  buildingName: string;
  apartmentNumber: string;
  tenantName: string;
  paidAmount: string;
  paymentDate: string;
  contractNumber?: string | null;
  internalContractNumber?: string | null;
  paymentAccountNumber?: string | null;
  notes?: string | null;
  sourceSheet: string;
  sourceRow: number;
};

const aliases: Record<keyof Omit<ImportRow, "sourceSheet" | "sourceRow">, string[]> = {
  buildingName: ["العمارة", "اسم العمارة", "building", "buildingName"],
  apartmentNumber: ["رقم الشقة", "الشقة", "الوحدة", "unit", "apartmentNumber"],
  tenantName: ["المستأجر", "اسم المستأجر", "tenant", "tenantName"],
  paidAmount: ["المبلغ المسدد", "المبلغ", "paidAmount", "amount"],
  paymentDate: ["تاريخ السداد", "التاريخ", "paymentDate", "date"],
  contractNumber: ["رقم العقد", "رقم العقد الخارجي", "contractNumber"],
  internalContractNumber: ["رقم العقد الداخلي", "internalContractNumber"],
  paymentAccountNumber: ["رقم الحساب المسدد عليه", "رقم الحساب", "paymentAccountNumber"],
  notes: ["ملاحظات", "notes"],
};

function valueFor(row: Record<string, unknown>, field: keyof typeof aliases) {
  const key = Object.keys(row).find(candidate => aliases[field].some(alias => candidate.trim().toLowerCase() === alias.toLowerCase()));
  return key ? String(row[key] ?? "").trim() : "";
}

export default function RentImportPanel({ fiscalYearId }: { fiscalYearId: number }) {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const create = trpc.rentFollowUps.create.useMutation();
  const utils = trpc.useUtils();

  const readFile = async (file: File) => {
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const parsed: ImportRow[] = [];
      workbook.SheetNames.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
        records.forEach((record, index) => {
          const paymentDate = valueFor(record, "paymentDate");
          const amount = valueFor(record, "paidAmount");
          const normalizedDate = paymentDate.includes("T") ? paymentDate.slice(0, 10) : paymentDate;
          const required = [valueFor(record, "buildingName"), valueFor(record, "apartmentNumber"), valueFor(record, "tenantName"), amount, normalizedDate];
          if (required.every(Boolean)) parsed.push({ buildingName: required[0], apartmentNumber: required[1], tenantName: required[2], paidAmount: amount, paymentDate: normalizedDate, contractNumber: valueFor(record, "contractNumber") || null, internalContractNumber: valueFor(record, "internalContractNumber") || null, paymentAccountNumber: valueFor(record, "paymentAccountNumber") || null, notes: valueFor(record, "notes") || null, sourceSheet: sheetName, sourceRow: index + 2 });
        });
      });
      setFileName(file.name);
      setRows(parsed);
      if (!parsed.length) toast.error("لم يتم العثور على صفوف مكتملة. تحقق من عناوين الأعمدة المطلوبة.");
      else toast.success(`تمت معاينة ${parsed.length} صفًا من الملف.`);
    } catch {
      toast.error("تعذر قراءة ملف Excel. استخدم ملفًا بصيغة xlsx أو xls صالحًا.");
    }
  };

  const importRows = async () => {
    let imported = 0;
    let skipped = 0;
    for (const row of rows) {
      try {
        await create.mutateAsync({ ...row, fiscalYearId, ownerConfirmation: "pending", transferStatus: "not_transferred", ownerConfirmationDate: null, amlakiaReceiptNumber: null });
        imported += 1;
      } catch {
        skipped += 1;
      }
    }
    await Promise.all([utils.rentFollowUps.list.invalidate(), utils.rentFollowUps.summary.invalidate()]);
    toast.success(`اكتمل الاستيراد: ${imported} صفًا جديدًا، وتم تجاوز ${skipped} صفًا مكررًا أو غير صالح.`);
    setRows([]);
    setFileName("");
  };

  return <Card className="rounded-2xl border-dashed border-blue-200 print-exclude"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileSpreadsheet className="h-4 w-4 text-blue-700" />استيراد كشف Excel اختياري</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-xs text-slate-500">يجب أن تتضمن الورقة: العمارة، رقم الشقة، المستأجر، المبلغ المسدد، وتاريخ السداد. تتم المعاينة أولًا ولا تُحفظ الصفوف إلا بعد الضغط على زر الاستيراد.</p><div className="flex flex-wrap items-center gap-2"><label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm"><Upload className="h-4 w-4" />اختيار ملف<input type="file" accept=".xlsx,.xls" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) void readFile(file); }} /></label>{fileName ? <span className="text-xs text-slate-500">{fileName} — {rows.length} صفًا جاهزًا</span> : null}{rows.length ? <Button type="button" onClick={() => void importRows()} disabled={create.isPending} className="bg-blue-700 hover:bg-blue-800">{create.isPending ? "جارٍ الاستيراد…" : "استيراد الصفوف المعاينة"}</Button> : null}</div>{rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-right text-xs"><thead className="bg-slate-50"><tr><th className="p-2">الورقة/الصف</th><th className="p-2">العمارة</th><th className="p-2">الشقة</th><th className="p-2">المستأجر</th><th className="p-2">المبلغ</th><th className="p-2">التاريخ</th></tr></thead><tbody>{rows.slice(0, 5).map(row => <tr key={`${row.sourceSheet}-${row.sourceRow}`} className="border-t"><td className="p-2">{row.sourceSheet} / {row.sourceRow}</td><td className="p-2">{row.buildingName}</td><td className="p-2">{row.apartmentNumber}</td><td className="p-2">{row.tenantName}</td><td className="p-2">{row.paidAmount}</td><td className="p-2">{row.paymentDate}</td></tr>)}</tbody></table></div> : null}</CardContent></Card>;
}
