import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
    Upload, Layers, Download, AlertTriangle, Info, FileSpreadsheet,
} from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { processStudentData } from '../../services/deduplicator';

// RO'YXAT TOZALASH.
//
// `services/deduplicator.js` — haqiqiy va ishlaydigan algoritm: ism
// variantlarini (kirill/lotin, otasining ismi bilan/bilansiz, tartibi
// almashgan) taqqoslab bitta odamga birlashtiradi.
//
// Ilgari unga DEMO ma'lumot berilardi: tugma bosilganda generatsiya qilingan
// ismlar qatorlarga solinardi va natija "ishladi" degan taassurot berardi.
// Endi faqat HAQIQIY fayl yuklanadi — algoritm o'zgarmadi, kirish ma'lumoti
// o'zgardi.
const DeduplicatorPanel = () => {
    const fileRef = useRef(null);
    const [fileName, setFileName] = useState('');
    const [columns, setColumns] = useState([]);
    const [rows, setRows] = useState([]);
    const [mappings, setMappings] = useState({ nameColumn: '', clubColumn: '', eventColumn: '' });
    const [threshold, setThreshold] = useState(0.88);
    const [stripPatronymics, setStripPatronymics] = useState(true);
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');

    const handleFile = (file) => {
        setError(''); setResult(null);
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const wb = XLSX.read(e.target.result, { type: 'array' });
                const sheet = wb.Sheets[wb.SheetNames[0]];
                const parsed = XLSX.utils.sheet_to_json(sheet, { defval: '' });
                if (parsed.length === 0) { setError("Fayl bo'sh."); return; }
                setRows(parsed);
                const cols = Object.keys(parsed[0]);
                setColumns(cols);
                // Ustunni TAXMIN qilamiz, lekin o'zgartirish mumkin - noto'g'ri
                // taxmin jimgina noto'g'ri natija bermasligi kerak.
                const guess = (candidates) =>
                    cols.find(c => candidates.some(x => c.toLowerCase().includes(x))) || '';
                setMappings({
                    nameColumn: guess(['fish', 'ism', 'talaba', 'name', 'фио']),
                    clubColumn: guess(['klub', 'club', 'to\'garak']),
                    eventColumn: guess(['tadbir', 'event', 'musobaqa']),
                });
                setFileName(file.name);
            } catch (err) {
                setError("Faylni o'qib bo'lmadi: " + (err?.message || ''));
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const run = () => {
        setError('');
        if (!mappings.nameColumn) { setError('Ism ustunini tanlang.'); return; }
        try {
            const out = processStudentData(rows, mappings, threshold, stripPatronymics);
            setResult(out);
        } catch (err) {
            setError(err?.message || 'Qayta ishlashda xatolik.');
        }
    };

    // Algoritm ikkita jadval qaytaradi: birlashtirilgan talabalar va
    // "qaysi xom qator qaysi talabaga tegishli" izohi. Ikkinchisi
    // TEKSHIRISH uchun kerak - xato birlashtirishni faqat shundan topish
    // mumkin, shuning uchun u ham faylga tushadi.
    const exportResult = () => {
        if (!result) return;
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(
            wb, XLSX.utils.json_to_sheet(result.studentsMaster || []), 'Talabalar'
        );
        XLSX.utils.book_append_sheet(
            wb, XLSX.utils.json_to_sheet(result.rawVsMatched || []), 'Xom-va-moslangan'
        );
        XLSX.writeFile(wb, `Tozalangan-royxat-${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    const master = result?.studentsMaster || [];
    const stats = result?.summaryStats || {};

    return (
        <div className="space-y-4">
            <Card className="p-5 border-none">
                <h3 className="font-bold text-gray-900 mb-1 flex items-center gap-2">
                    <Layers size={17} className="text-indigo-600" /> Ro'yxat tozalash
                </h3>
                <p className="text-xs text-gray-500 mb-4">
                    Bir odamning turli yozilishlarini (kirill/lotin, otasining ismi bilan yoki
                    bilansiz, tartibi almashgan) taqqoslab birlashtiradi
                </p>

                <label className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-indigo-400 transition-colors cursor-pointer block">
                    <Upload className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600 font-semibold">
                        {fileName || 'Excel faylni tanlang'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">.xlsx yoki .csv</p>
                    <input
                        ref={fileRef}
                        type="file" accept=".xlsx,.xls,.csv"
                        className="hidden"
                        onChange={e => handleFile(e.target.files?.[0])}
                    />
                </label>

                {error && (
                    <p className="mt-3 text-[11px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 flex items-start gap-1.5">
                        <AlertTriangle size={12} className="shrink-0 mt-px" /> {error}
                    </p>
                )}
            </Card>

            {columns.length > 0 && (
                <Card className="p-5 border-none space-y-4">
                    <div>
                        <h4 className="font-bold text-sm text-gray-700">Ustunlarni moslash</h4>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                            {rows.length} qator o'qildi
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {[
                            { key: 'nameColumn', label: 'Ism ustuni *' },
                            { key: 'clubColumn', label: 'Klub ustuni' },
                            { key: 'eventColumn', label: 'Tadbir ustuni' },
                        ].map(f => (
                            <div key={f.key}>
                                <label className="block text-[11px] font-bold text-gray-400 uppercase mb-1.5">
                                    {f.label}
                                </label>
                                <select
                                    value={mappings[f.key]}
                                    onChange={e => setMappings(m => ({ ...m, [f.key]: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white"
                                >
                                    <option value="">Tanlanmagan</option>
                                    {columns.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                        ))}
                    </div>

                    <div className="flex items-center gap-4 flex-wrap">
                        <div className="flex items-center gap-2">
                            <label className="text-xs text-gray-600">O'xshashlik chegarasi</label>
                            <input
                                type="number" min={0.5} max={1} step={0.01}
                                value={threshold}
                                onChange={e => setThreshold(Number(e.target.value))}
                                className="w-20 px-2 py-1.5 border border-gray-200 rounded-xl text-sm text-center"
                            />
                        </div>
                        <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                            <input
                                type="checkbox" className="rounded accent-indigo-600"
                                checked={stripPatronymics}
                                onChange={e => setStripPatronymics(e.target.checked)}
                            />
                            Otasining ismini hisobga olmaslik
                        </label>
                        <Button variant="primary" size="sm" onClick={run}>
                            Qayta ishlash
                        </Button>
                    </div>

                    <p className="text-[11px] text-gray-400 flex items-start gap-1.5">
                        <Info size={11} className="shrink-0 mt-px" />
                        Chegara qanchalik past bo'lsa, shunchalik ko'p yozuv birlashtiriladi —
                        lekin xato birlashtirish xavfi ham ortadi.
                    </p>
                </Card>
            )}

            {result && (
                <Card className="p-5 border-none space-y-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <h4 className="font-bold text-sm text-gray-700">Natija</h4>
                        <Button variant="outline" size="sm" icon={Download} onClick={exportResult}>
                            Excel yuklab olish
                        </Button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Badge variant="default">{rows.length} xom qator</Badge>
                        <Badge variant="success">{master.length} noyob talaba</Badge>
                        {rows.length > master.length && (
                            <Badge variant="warning">
                                {rows.length - master.length} qator birlashtirildi
                            </Badge>
                        )}
                    </div>

                    {master.length > 0 && (
                        <div className="overflow-x-auto max-h-96">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-gray-50 sticky top-0">
                                    <tr>
                                        {Object.keys(master[0]).slice(0, 6).map(k => (
                                            <th key={k} className="px-3 py-2 font-bold text-gray-500 uppercase text-[10px]">
                                                {k}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {master.slice(0, 50).map((s, i) => (
                                        <tr key={i}>
                                            {Object.keys(master[0]).slice(0, 6).map(k => (
                                                <td key={k} className="px-3 py-2 text-gray-700">
                                                    {Array.isArray(s[k]) ? s[k].join(', ') : String(s[k] ?? '')}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {master.length > 50 && (
                                <p className="text-[11px] text-gray-400 mt-2">
                                    Birinchi 50 qator ko'rsatilmoqda — to'liq ro'yxat Excelda.
                                </p>
                            )}
                        </div>
                    )}
                </Card>
            )}
        </div>
    );
};

export default DeduplicatorPanel;
