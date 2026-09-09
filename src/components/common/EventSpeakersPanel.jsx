import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Printer, Upload, FileText, Download, X, Mic } from 'lucide-react';
import Card from './Card';
import Button from './Button';
import { db } from '../../services/db';

// SPIKERLAR VA TADBIR DASTURI.
//
// Xodim xonani band qilgach, tadbir boshlanguncha to'ldiradigan ikki narsa:
// chiqish qiluvchilarning F.I.Sh. va lavozimi (stol tablichkasi shundan
// bosiladi) va dastur fayli.
//
// Spikerlar platforma foydalanuvchilari EMAS - ular ko'pincha tashqi mehmon
// (vazirlik xodimi, boshqa universitet vakili), shuning uchun qo'lda
// yoziladi va hech qanday akkaunt bilan bog'lanmaydi.

const emptyRow = () => ({ id: 'spk_' + Math.random().toString(36).slice(2, 9), fullName: '', position: '' });

const EventSpeakersPanel = ({ event, canEdit = true, actingUsername, onChanged }) => {
    const [rows, setRows] = useState([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [saved, setSaved] = useState(false);
    const [programUrl, setProgramUrl] = useState(null);

    // Tashqaridan kelgan yozuv formaga BIR MARTA ko'chiriladi (tadbir
    // almashganda). Har renderda ko'chirilsa, yozayotgan odamning matni
    // saqlanmagan qiymat bilan almashib ketardi.
    useEffect(() => {
        const existing = event?.speakers || [];
        setRows(existing.length > 0 ? existing.map(s => ({ ...s })) : [emptyRow()]);
        setSaved(false);
        setError('');
    }, [event?.id]);

    // Ombor yopiq, shuning uchun havola vaqtinchalik imzolangan bo'ladi va
    // uni har safar qaytadan olish kerak.
    useEffect(() => {
        let alive = true;
        const path = event?.programFile?.filePath;
        if (!path) { setProgramUrl(null); return undefined; }
        db.getEventProgramUrl(path).then(u => { if (alive) setProgramUrl(u); });
        return () => { alive = false; };
    }, [event?.programFile?.filePath]);

    const filled = useMemo(() => rows.filter(r => (r.fullName || '').trim() || (r.position || '').trim()), [rows]);

    const patch = (id, field, value) => {
        setSaved(false);
        setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } : r)));
    };

    const handleSave = async () => {
        setBusy(true); setError(''); setSaved(false);
        try {
            await db.setEventSpeakers(event.id, rows);
            setSaved(true);
            onChanged?.();
        } catch (e) {
            setError(e?.message || 'Saqlashda xatolik yuz berdi.');
        } finally { setBusy(false); }
    };

    const handleUpload = async (file) => {
        if (!file) return;
        setBusy(true); setError('');
        try {
            await db.uploadEventProgram({ eventId: event.id, file, uploadedBy: actingUsername });
            onChanged?.();
        } catch (e) {
            setError(e?.message || 'Fayl yuklanmadi.');
        } finally { setBusy(false); }
    };

    const handleRemoveProgram = async () => {
        setBusy(true); setError('');
        try {
            await db.removeEventProgram(event.id);
            onChanged?.();
        } catch (e) {
            setError(e?.message || "Fayl o'chirilmadi.");
        } finally { setBusy(false); }
    };

    // CHOP ETISH. Alohida oyna ochiladi va faqat tablichkalar bosiladi.
    //
    // Nega alohida oyna, `window.print()` emas: bu sahifada yon menyu,
    // sarlavha va o'nlab boshqa element bor. Ularni chop etishdan yashirish
    // uchun butun ilova bo'ylab print uslublari yozish kerak bo'lardi va
    // har yangi ekran o'sha uslublarni buzishi mumkin edi.
    const handlePrint = () => {
        const list = filled;
        if (list.length === 0) return;

        // A4 da IKKITA tablichka: varaq bo'yiga ikkiga bo'linadi, o'rtasidan
        // qirqiladi. Har yarmi 148mm balandlikda (A5).
        const cards = list.map(s => `
            <div class="card">
                <div class="name">${esc(s.fullName)}</div>
                ${s.position ? `<div class="pos">${esc(s.position)}</div>` : ''}
            </div>`).join('');

        const html = `<!doctype html>
<html lang="uz"><head><meta charset="utf-8">
<title>Tablichkalar</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Times New Roman", Georgia, serif; }
  .sheet { width: 210mm; }
  .card {
    width: 210mm; height: 148mm;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    text-align: center; padding: 12mm 14mm;
    /* Qirqish chizig'i: uzluksiz chiziq qora siyoh sarflaydi va qirqilgandan
       keyin kartochkada qolib ketadi, shuning uchun ochiq kulrang punktir. */
    border-bottom: 1px dashed #bbb;
    page-break-inside: avoid;
  }
  /* Har ikkinchi kartochkadan keyin yangi varaq. */
  .card:nth-child(2n) { border-bottom: 0; page-break-after: always; }
  .card:last-child { page-break-after: auto; }
  .name { font-size: 40pt; font-weight: 700; line-height: 1.15; }
  .pos { font-size: 20pt; margin-top: 8mm; color: #333; line-height: 1.3; }
  @media screen {
    body { background: #eef0f6; padding: 16px; }
    .sheet { background: #fff; margin: 0 auto; box-shadow: 0 2px 14px rgba(0,0,0,.15); }
  }
</style></head>
<body><div class="sheet">${cards}</div>
<script>window.onload = function () { window.print(); };<\/script>
</body></html>`;

        const w = window.open('', '_blank');
        if (!w) { setError("Chop etish oynasi ochilmadi - brauzer qalqib chiquvchi oynalarni to'sgan."); return; }
        w.document.write(html);
        w.document.close();
    };

    const program = event?.programFile || null;

    return (
        <div className="space-y-4">
            <Card>
                <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                    <div>
                        <h3 className="font-bold text-gray-900 flex items-center gap-2">
                            <Mic size={16} className="text-indigo-500" /> Chiqish qiluvchilar
                        </h3>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                            Stol tablichkasi shu ro'yxatdan bosiladi. Tashqi mehmonlar ham yoziladi —
                            platformada akkaunti bo'lishi shart emas.
                        </p>
                    </div>
                    <Button
                        variant="outline" size="sm" icon={Printer}
                        disabled={filled.length === 0}
                        onClick={handlePrint}
                        title={filled.length === 0 ? 'Avval kamida bitta spiker kiriting' : 'A4 da ikkitadan, qirqib ishlatiladi'}
                    >
                        Tablichka chop etish{filled.length > 0 ? ` (${filled.length})` : ''}
                    </Button>
                </div>

                <div className="space-y-2">
                    {rows.map((r, i) => (
                        <div key={r.id} className="flex flex-col sm:flex-row gap-2">
                            <input
                                type="text"
                                value={r.fullName}
                                disabled={!canEdit}
                                onChange={e => patch(r.id, 'fullName', e.target.value)}
                                placeholder={`${i + 1}. F.I.Sh.`}
                                className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm disabled:bg-gray-50"
                            />
                            <input
                                type="text"
                                value={r.position}
                                disabled={!canEdit}
                                onChange={e => patch(r.id, 'position', e.target.value)}
                                placeholder="Lavozimi"
                                className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm disabled:bg-gray-50"
                            />
                            {canEdit && (
                                <button
                                    type="button"
                                    title="Qatorni o'chirish"
                                    onClick={() => setRows(prev => (prev.length > 1 ? prev.filter(x => x.id !== r.id) : [emptyRow()]))}
                                    className="px-3 py-2 rounded-xl border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 shrink-0"
                                >
                                    <Trash2 size={14} />
                                </button>
                            )}
                        </div>
                    ))}
                </div>

                {canEdit && (
                    <div className="flex items-center gap-2 flex-wrap mt-3">
                        <Button variant="outline" size="sm" icon={Plus} onClick={() => setRows(prev => [...prev, emptyRow()])}>
                            Qator qo'shish
                        </Button>
                        <Button size="sm" disabled={busy} onClick={handleSave}>
                            {busy ? 'Saqlanmoqda...' : 'Saqlash'}
                        </Button>
                        {/* Saqlanganini AYTIB QO'YISH shart: qator qo'shish darhol
                            ko'rinadi, saqlash esa hech qanday o'zgarish
                            ko'rsatmaydi va odam saqlanmagan deb o'ylab ketardi. */}
                        {saved && <span className="text-[11px] font-bold text-emerald-600">Saqlandi</span>}
                    </div>
                )}
            </Card>

            <Card>
                <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-1">
                    <FileText size={16} className="text-indigo-500" /> Tadbir dasturi
                </h3>
                <p className="text-[11px] text-gray-400 mb-3">
                    Word yoki PDF. Bitta tadbirda bitta dastur — yangisi eskisining o'rniga qo'yiladi.
                </p>

                {program ? (
                    <div className="flex items-center gap-3 flex-wrap p-3 bg-slate-50 border border-gray-100 rounded-xl">
                        <FileText size={18} className="text-gray-400 shrink-0" />
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-gray-900 truncate">{program.fileName}</p>
                            <p className="text-[11px] text-gray-400">
                                {program.sizeLabel}
                                {program.uploadedAt && ` · ${new Date(program.uploadedAt).toLocaleDateString('uz-UZ')}`}
                            </p>
                        </div>
                        {/* Havola imzolangan va bir soatdan keyin ishlamay qoladi -
                            shuning uchun u tayyor bo'lgandagina ko'rsatiladi. */}
                        {programUrl ? (
                            <a
                                href={programUrl} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold text-indigo-600 hover:bg-indigo-50"
                            >
                                <Download size={13} /> Ochish
                            </a>
                        ) : (
                            <span className="text-[11px] text-gray-400">Havola tayyorlanmoqda...</span>
                        )}
                        {canEdit && (
                            <button
                                type="button" title="Dasturni o'chirish" disabled={busy}
                                onClick={handleRemoveProgram}
                                className="px-3 py-2 rounded-xl border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                ) : (
                    <p className="text-sm text-gray-400">Dastur biriktirilmagan.</p>
                )}

                {canEdit && (
                    <label className="inline-flex items-center gap-2 mt-3 px-4 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50 cursor-pointer">
                        <Upload size={14} />
                        {program ? 'Boshqa fayl yuklash' : 'Fayl yuklash'}
                        <input
                            type="file" className="hidden" disabled={busy}
                            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                            onChange={e => { handleUpload(e.target.files?.[0]); e.target.value = ''; }}
                        />
                    </label>
                )}
            </Card>

            {error && (
                <p className="text-[11px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                    {error}
                </p>
            )}
        </div>
    );
};

// Chop etish oynasiga foydalanuvchi kiritgan matn HTML sifatida qo'yiladi,
// shuning uchun belgilar qochiriladi.
function esc(v) {
    return String(v || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export default EventSpeakersPanel;
