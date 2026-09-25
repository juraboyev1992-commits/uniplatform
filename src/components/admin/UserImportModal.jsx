import React, { useMemo, useRef, useState } from 'react';
import {
    Download, Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, X, Copy, Check,
} from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { db } from '../../services/db';
import {
    mapSheetRows, validateImportRows, templateDataRows, templateHelpRows, IMPORT_COLUMNS,
} from '../../utils/userImport';

// ===========================================================================
// EXCELDAN FOYDALANUVCHI IMPORT QILISH
//
// Uch qadam: fayl -> TEKSHIRUV -> yozish. O'rtadagi qadam eng muhimi va u
// ataylab majburiy: 200 qatorli faylni ko'r-ko'rona bazaga quyish - keyin
// qaysi qator qayerda buzilganini topib bo'lmaydigan holat demak. Shuning
// uchun avval hamma qator tekshiriladi, natija ko'rsatiladi, va faqat
// shundan keyin "Boshlash" tugmasi paydo bo'ladi.
//
// XLSX kutubxonasi DINAMIK yuklanadi (~424 kB): u faqat shu oyna ochilganda
// kerak, foydalanuvchilar ro'yxatini ochgan har bir admin uni yuklab
// o'tirmasin.
// ===========================================================================

const StatRow = ({ label, value, tone = 'text-gray-900' }) => (
    <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-gray-500">{label}</span>
        <span className={`font-black tabular-nums ${tone}`}>{value}</span>
    </div>
);

const UserImportModal = ({ isOpen, onClose, actingUsername, onDone }) => {
    const fileRef = useRef(null);
    const [fileName, setFileName] = useState('');
    const [parsing, setParsing] = useState(false);
    const [parseError, setParseError] = useState('');
    const [check, setCheck] = useState(null);          // validateImportRows natijasi
    const [unknownHeaders, setUnknownHeaders] = useState([]);
    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState({ done: 0, total: 0 });
    const [outcome, setOutcome] = useState(null);      // [{ username, fullName, password, status, message }]
    // Qaysi qator hozirgina nusxalandi - tugma "Nusxalandi" ga o'zgaradi.
    const [copied, setCopied] = useState(null);

    const reset = () => {
        setFileName(''); setParseError(''); setCheck(null);
        setUnknownHeaders([]); setOutcome(null); setProgress({ done: 0, total: 0 });
        if (fileRef.current) fileRef.current.value = '';
    };

    const handleClose = () => { if (!running) { reset(); onClose(); } };

    const downloadTemplate = async () => {
        const XLSX = await import('xlsx');
        const wb = XLSX.utils.book_new();

        const ws = XLSX.utils.json_to_sheet(templateDataRows());
        ws['!cols'] = [
            { wch: 18 }, { wch: 32 }, { wch: 12 }, { wch: 14 }, { wch: 40 },
            { wch: 6 }, { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 18 }, { wch: 24 },
        ];
        XLSX.utils.book_append_sheet(wb, ws, "Ma'lumot");

        const help = XLSX.utils.json_to_sheet(templateHelpRows());
        help['!cols'] = [{ wch: 16 }, { wch: 18 }, { wch: 90 }];
        XLSX.utils.book_append_sheet(wb, help, "Yo'riqnoma");

        XLSX.writeFile(wb, 'foydalanuvchilar-shablon.xlsx');
    };

    const handleFile = async (file) => {
        if (!file) return;
        setParsing(true); setParseError(''); setCheck(null); setOutcome(null);
        try {
            const XLSX = await import('xlsx');
            const buf = await file.arrayBuffer();
            const wb = XLSX.read(buf, { type: 'array' });
            // Birinchi varaq o'qiladi - shablonda u "Ma'lumot", lekin odam
            // o'z faylini yuklashi ham mumkin, shuning uchun nomga
            // bog'lanmaymiz.
            const sheet = wb.Sheets[wb.SheetNames[0]];
            if (!sheet) throw new Error("Faylda varaq topilmadi");
            const raw = XLSX.utils.sheet_to_json(sheet, { defval: '' });
            if (raw.length === 0) throw new Error("Faylda ma'lumot yo'q (faqat sarlavha bormi?)");

            const { rows, unknownHeaders: unknown } = mapSheetRows(raw);
            const existing = new Set(
                db.getAllUserAccounts().map(a => String(a.username || '').toLowerCase()).filter(Boolean)
            );
            setUnknownHeaders(unknown);
            setCheck(validateImportRows(rows, { existingUsernames: existing }));
            setFileName(file.name);
        } catch (e) {
            setParseError(e.message || "Faylni o'qib bo'lmadi");
        } finally {
            setParsing(false);
        }
    };

    const runImport = async () => {
        if (!check) return;
        const todo = check.results.filter(r => r.ok);
        setRunning(true);
        setProgress({ done: 0, total: todo.length });
        const done = [];

        for (const r of todo) {
            const v = r.value;
            try {
                const res = await db.adminImportUser({
                    username: v.username,
                    fullName: v.fullName,
                    role: v.role,
                    password: v.password || null,
                    faculty: v.faculty,
                    course: v.course,
                    group: v.group,
                    studentId: v.studentId,
                    gender: v.gender,
                });

                // Telefon va email PROFILDA emas, raqamli pasportda turadi -
                // shuning uchun alohida yoziladi. Xatosi butun qatorni
                // yiqitmaydi: akkaunt allaqachon yaratilgan, aloqa
                // ma'lumotini keyin qo'lda qo'shish mumkin.
                let contactNote = '';
                if (v.phone || v.email) {
                    try {
                        await db.setPassportFields({
                            studentId: v.username,
                            values: {
                                ...(v.phone ? { 'contact.phone': v.phone } : {}),
                                ...(v.email ? { 'contact.email': v.email } : {}),
                            },
                            source: 'import',
                            by: actingUsername || null,
                        });
                    } catch (e) {
                        contactNote = ` (aloqa ma'lumoti yozilmadi: ${e.message || 'xato'})`;
                    }
                }

                done.push({
                    line: r.line,
                    username: v.username,
                    fullName: v.fullName,
                    password: v.password || '',
                    status: res?.status === 'updated' ? 'yangilandi' : 'yaratildi',
                    message: (r.warnings.join('; ') + contactNote).trim(),
                });
            } catch (e) {
                done.push({
                    line: r.line,
                    username: v.username,
                    fullName: v.fullName,
                    password: '',
                    status: 'xato',
                    message: e.message || 'Xatolik',
                });
            }
            setProgress(p => ({ ...p, done: p.done + 1 }));
        }

        // Mahalliy nusxani BIR MARTA yangilaymiz - har qator uchun emas.
        try { await db.syncCoreDataFromSupabase(); } catch { /* ro'yxat keyingi ochilishda yangilanadi */ }

        setOutcome(done);
        setRunning(false);
        if (onDone) onDone();
    };

    // FOYDALANUVCHIGA YUBORILADIGAN MATN. Ataylab faqat shu ikki qiymat:
    // holat yorlig'i ("yaratildi"), "Parol yozilmagan - avtomatik yaratildi"
    // kabi izohlar va F.I.Sh. - bularning hammasi ADMIN uchun, qabul
    // qiluvchiga esa keraksiz va chalg'itadi.
    const credentialLine = (o) => `Login: ${o.username} \u00b7 parol: ${o.password}`;

    // `navigator.clipboard` HTTPS va foydalanuvchi bosishini talab qiladi -
    // ikkalasi ham bor. Eski brauzerlar uchun zaxira yo'l: vaqtinchalik
    // maydon orqali. Ishlamasa jim qolmaymiz - `false` qaytadi.
    const copyToClipboard = async (text) => {
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch { /* zaxira yo'lga o'tamiz */ }
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(ta);
            return ok;
        } catch {
            return false;
        }
    };

    const copyOne = async (o) => {
        if (await copyToClipboard(credentialLine(o))) {
            setCopied(o.username);
            setTimeout(() => setCopied(c => (c === o.username ? null : c)), 1600);
        }
    };

    const copyAll = async () => {
        const lines = (outcome || [])
            .filter(o => o.password)
            .map(credentialLine)
            .join('\n');
        if (!lines) return;
        if (await copyToClipboard(lines)) {
            setCopied('__all__');
            setTimeout(() => setCopied(c => (c === '__all__' ? null : c)), 1600);
        }
    };

    const downloadOutcome = async () => {
        const XLSX = await import('xlsx');
        const rows = (outcome || []).map(o => ({
            qator: o.line,
            login: o.username,
            fish: o.fullName,
            parol: o.password,
            holat: o.status,
            izoh: o.message,
        }));
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [{ wch: 7 }, { wch: 18 }, { wch: 32 }, { wch: 12 }, { wch: 12 }, { wch: 60 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Natija');
        XLSX.writeFile(wb, 'import-natijasi.xlsx');
    };

    const problems = useMemo(() => (check ? check.results.filter(r => !r.ok) : []), [check]);
    const warned = useMemo(() => (check ? check.results.filter(r => r.ok && r.warnings.length) : []), [check]);
    const createdWithPassword = useMemo(
        () => (outcome || []).filter(o => o.status === 'yaratildi' && o.password).length,
        [outcome]
    );

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Exceldan foydalanuvchi import qilish" size="lg">
            <div className="p-2 space-y-4">

                {/* 1-QADAM: shablon. Yuqorida turadi, chunki birinchi marta
                    kelgan odamning birinchi savoli "qanday fayl kerak". */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-indigo-50 border border-indigo-100">
                    <div className="min-w-0">
                        <p className="text-sm font-bold text-indigo-900">1. Shablonni yuklab oling</p>
                        <p className="text-xs text-indigo-700 mt-0.5">
                            Ikki varaq: <b>Ma'lumot</b> (shu yerga yozasiz) va <b>Yo'riqnoma</b>
                            {' '}(har ustun nimani anglatadi, fakultetlar ro'yxati bilan).
                        </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={downloadTemplate} className="shrink-0">
                        <Download size={14} className="mr-1.5" /> Shablon
                    </Button>
                </div>

                {/* 2-QADAM: fayl */}
                <div className="p-4 rounded-2xl border border-gray-200">
                    <p className="text-sm font-bold text-gray-900">2. To'ldirilgan faylni tanlang</p>
                    <div className="flex flex-wrap items-center gap-3 mt-2">
                        <input
                            ref={fileRef}
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            disabled={running}
                            onChange={e => handleFile(e.target.files?.[0])}
                            className="text-xs file:mr-3 file:px-3 file:py-2 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-gray-900 file:text-white hover:file:bg-gray-800 file:cursor-pointer"
                        />
                        {fileName && (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600">
                                <FileSpreadsheet size={13} /> {fileName}
                            </span>
                        )}
                        {parsing && <span className="text-xs text-gray-500">O'qilmoqda...</span>}
                    </div>
                    {parseError && (
                        <p className="mt-2 text-xs font-semibold text-rose-700 flex items-start gap-1.5">
                            <AlertTriangle size={13} className="shrink-0 mt-px" /> {parseError}
                        </p>
                    )}
                    {unknownHeaders.length > 0 && (
                        <p className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                            Tanilmagan ustun{unknownHeaders.length > 1 ? 'lar' : ''}: <b>{unknownHeaders.join(', ')}</b>.
                            {' '}Ular o'qilmadi. Kutilayotgan nomlar: {IMPORT_COLUMNS.map(c => c.header).join(', ')}.
                        </p>
                    )}
                </div>

                {/* 3-QADAM: tekshiruv natijasi */}
                {check && !outcome && (
                    <div className="p-4 rounded-2xl border border-gray-200 space-y-3">
                        <p className="text-sm font-bold text-gray-900">3. Tekshiruv natijasi</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                            <StatRow label="Yangi yaratiladi" value={check.createCount} tone="text-emerald-700" />
                            <StatRow label="Mavjud - to'ldiriladi" value={check.updateCount} tone="text-indigo-700" />
                            <StatRow label="Ogohlantirish bilan" value={warned.length} tone="text-amber-700" />
                            <StatRow label="Xato - tashlanadi" value={check.errorCount} tone={check.errorCount ? 'text-rose-700' : 'text-gray-400'} />
                        </div>

                        {problems.length > 0 && (
                            <div className="max-h-56 overflow-y-auto rounded-xl border border-rose-200 bg-rose-50 divide-y divide-rose-100">
                                {problems.map(r => (
                                    <div key={r.line} className="px-3 py-2 text-xs">
                                        <span className="font-bold text-rose-900">{r.line}-qator</span>
                                        {r.value.username ? <span className="text-rose-700"> · {r.value.username}</span> : null}
                                        <span className="text-rose-800"> — {r.errors.join('; ')}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {warned.length > 0 && (
                            <div className="max-h-40 overflow-y-auto rounded-xl border border-amber-200 bg-amber-50 divide-y divide-amber-100">
                                {warned.map(r => (
                                    <div key={r.line} className="px-3 py-2 text-xs text-amber-900">
                                        <span className="font-bold">{r.line}-qator</span> · {r.value.username}
                                        <span> — {r.warnings.join('; ')}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        <p className="text-[11px] text-gray-500">
                            Xato qatorlar yozilmaydi, qolganlari yoziladi. Faylni tuzatib qayta yuklashingiz mumkin:
                            {' '}allaqachon yaratilgan login ikkinchi marta yaratilmaydi.
                        </p>
                    </div>
                )}

                {/* Bajarilish */}
                {running && (
                    <div className="p-4 rounded-2xl border border-indigo-200 bg-indigo-50">
                        <p className="text-sm font-bold text-indigo-900">
                            Yozilmoqda: {progress.done} / {progress.total}
                        </p>
                        <div className="mt-2 h-2 rounded-full bg-indigo-100 overflow-hidden">
                            <div
                                className="h-full bg-indigo-600 transition-all"
                                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                            />
                        </div>
                        <p className="text-[11px] text-indigo-700 mt-1.5">Oynani yopmang.</p>
                    </div>
                )}

                {/* Natija */}
                {outcome && (
                    <div className="p-4 rounded-2xl border border-gray-200 space-y-3">
                        <p className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                            <CheckCircle2 size={15} className="text-emerald-600" /> Import tugadi
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                            <StatRow label="Yaratildi" value={outcome.filter(o => o.status === 'yaratildi').length} tone="text-emerald-700" />
                            <StatRow label="Yangilandi" value={outcome.filter(o => o.status === 'yangilandi').length} tone="text-indigo-700" />
                            <StatRow label="Xato" value={outcome.filter(o => o.status === 'xato').length} tone="text-rose-700" />
                        </div>

                        {/* PAROLLAR FAQAT SHU YERDA. Ular bazadan qaytarib
                            olinmaydi (shifrlangan holda saqlanadi), shuning
                            uchun faylni saqlamasdan oynani yopish - parollarni
                            butunlay yo'qotish demak. */}
                        {createdWithPassword > 0 && (
                            <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5">
                                <p className="text-xs font-bold text-amber-900 flex items-start gap-1.5">
                                    <AlertTriangle size={13} className="shrink-0 mt-px" />
                                    {createdWithPassword} ta parol shu yerda - natijani saqlab oling
                                </p>
                                <p className="text-[11px] text-amber-800 mt-1">
                                    Parollar bazada shifrlangan holda saqlanadi va qaytarib olib bo'lmaydi.
                                    Oyna yopilgach ularni faqat qayta tayinlash mumkin.
                                </p>
                            </div>
                        )}

                        <div className="max-h-56 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
                            {outcome.map(o => (
                                <div key={`${o.line}-${o.username}`} className="px-3 py-2 text-xs flex items-start gap-2">
                                    <span className={`shrink-0 px-2 py-0.5 rounded-full font-bold ${
                                        o.status === 'xato' ? 'bg-rose-100 text-rose-800'
                                            : o.status === 'yangilandi' ? 'bg-indigo-100 text-indigo-800'
                                            : 'bg-emerald-100 text-emerald-800'
                                    }`}>{o.status}</span>
                                    <span className="min-w-0 flex-1">
                                        <span className="font-bold text-gray-900">{o.username}</span>
                                        {o.password && <span className="text-gray-500"> · parol: <b className="text-gray-900">{o.password}</b></span>}
                                        {o.message && <span className="text-gray-500"> · {o.message}</span>}
                                    </span>
                                    {/* Nusxalash FAQAT paroli bor qatorda: parolsiz
                                        qatorda yuboradigan narsa yo'q. */}
                                    {o.password && (
                                        <button
                                            type="button" onClick={() => copyOne(o)}
                                            title="Login va parolni nusxalash"
                                            className={`shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg font-semibold border transition-colors ${
                                                copied === o.username
                                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                                                    : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'
                                            }`}
                                        >
                                            {copied === o.username
                                                ? <><Check size={12} /> Nusxalandi</>
                                                : <><Copy size={12} /> Nusxalash</>}
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2">
                            {createdWithPassword > 0 && (
                                <Button variant="outline" className="flex-1" onClick={copyAll}>
                                    {copied === '__all__'
                                        ? <><Check size={14} className="mr-1.5" /> Nusxalandi</>
                                        : <><Copy size={14} className="mr-1.5" /> Hammasini nusxalash ({createdWithPassword})</>}
                                </Button>
                            )}
                            <Button variant="primary" className="flex-1" onClick={downloadOutcome}>
                                <Download size={14} className="mr-1.5" /> Natijani Excelga yuklab olish
                            </Button>
                        </div>
                    </div>
                )}

                {/* Amallar */}
                <div className="flex flex-wrap gap-2 justify-end pt-1">
                    <Button variant="outline" onClick={handleClose} disabled={running}>
                        <X size={14} className="mr-1.5" /> {outcome ? 'Yopish' : 'Bekor qilish'}
                    </Button>
                    {check && !outcome && (
                        <Button variant="primary" onClick={runImport} disabled={running || check.okCount === 0}>
                            <Upload size={14} className="mr-1.5" />
                            {check.okCount} ta qatorni yozish
                        </Button>
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default UserImportModal;
