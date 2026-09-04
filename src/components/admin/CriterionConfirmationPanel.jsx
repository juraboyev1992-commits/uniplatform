import React, { useMemo, useState } from 'react';
import {
    FileCheck2, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight,
    ShieldCheck, Paperclip,
} from 'lucide-react';
import Card from '../common/Card';
import Badge from '../common/Badge';
import Button from '../common/Button';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import { INDEX_CRITERIA, CRITERIA_NEEDING_CONFIRMATION } from '../../config/socialActivityIndex';
import { PARTICIPATION_ROLES } from '../../config/activityLifecycle';

// Ma'lumotnomalarni tasdiqlash navbati.
//
// Metodika har mezon uchun asoslovchi hujjat talab qiladi. Ball avtomatik
// hisoblanadi, lekin yakuniy indeksga TASDIQLANGAN qiymat kiradi.
//
// Klub koordinatori oqimda YO'Q: u davomatni tadbir kunida belgilagan va o'sha
// yozuv qulflangan hamda tarixga olingan. Iyulda xotiradan qayta tasdiqlash
// undan kuchsizroq dalil bo'lardi. Uning ismi ma'lumotnomada qoladi.
//
// Admin vaqti ISTISNOLARGA sarflanishi kerak, hamma qatorga emas - shuning
// uchun diqqat talab qiladigan yozuvlar tepaga chiqadi va ajratib ko'rsatiladi.
// `scopeStudentIds` - null bo'lsa butun navbat (administrator), massiv bo'lsa
// faqat o'sha talabalar (tyutor o'ziga biriktirilganlarni ko'radi).
const CriterionConfirmationPanel = ({ criterionKey: initialKey = 'CLUBS', scopeStudentIds = null }) => {
    const { user } = useAuth();
    // Mezon tanlanadi - mexanizm bitta, faqat kalit o'zgaradi.
    const [criterionKey, setCriterionKey] = useState(initialKey);
    const [version, setVersion] = useState(0);
    const [expanded, setExpanded] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [edits, setEdits] = useState({});

    const criterion = INDEX_CRITERIA[criterionKey];
    const queue = useMemo(() => {
        const rows = db.getCriterionConfirmationQueue(criterionKey);
        if (!scopeStudentIds) return rows;
        const allowed = new Set(scopeStudentIds);
        return rows.filter(s => allowed.has(s.studentId));
    }, [criterionKey, version, scopeStudentIds]);

    const attention = queue.filter(s => s.needsAttention);
    const clean = queue.filter(s => !s.needsAttention);

    const run = async (fn, ok = '') => {
        setBusy(true); setError(''); setMessage('');
        try { await fn(); setVersion(v => v + 1); if (ok) setMessage(ok); }
        catch (e) { setError(e?.message || 'Xatolik yuz berdi.'); }
        finally { setBusy(false); }
    };

    const confirmOne = (s) => run(() => db.confirmCriterion({
        studentId: s.studentId,
        criterionKey,
        points: edits[s.studentId] != null ? Number(edits[s.studentId]) : null,
        confirmedBy: user?.username,
    }));

    // Diqqat talab qilmaydiganlarni bir tugma bilan. Istisnolar bunga kirmaydi -
    // ular ataylab qo'lda ko'rib chiqiladi.
    const confirmAllClean = () => run(async () => {
        for (const s of clean) {
            await db.confirmCriterion({
                studentId: s.studentId, criterionKey, confirmedBy: user?.username,
            });
        }
    }, `${clean.length} ta ma'lumotnoma tasdiqlandi.`);

    const renderStatement = (s) => {
        const open = expanded === s.studentId;
        return (
            <div key={s.studentId} className={`rounded-2xl border ${
                s.needsAttention ? 'border-amber-200 bg-amber-50/40' : 'border-gray-100 bg-white'
            }`}>
                <div className="flex items-center gap-3 p-3">
                    <button
                        type="button"
                        onClick={() => setExpanded(open ? null : s.studentId)}
                        className="flex items-center gap-2 flex-1 min-w-0 text-left"
                    >
                        {open ? <ChevronDown size={14} className="text-gray-400 shrink-0" />
                            : <ChevronRight size={14} className="text-gray-400 shrink-0" />}
                        <span className="min-w-0">
                            <span className="block text-sm font-bold text-gray-900 truncate">{s.studentName}</span>
                            <span className="block text-[11px] text-gray-400 truncate">
                                {[s.faculty, s.course && `${s.course}-kurs`, s.group].filter(Boolean).join(' · ')}
                            </span>
                        </span>
                    </button>

                    {s.needsAttention && (
                        <Badge variant="warning" size="sm">Diqqat</Badge>
                    )}

                    <div className="flex items-center gap-1.5 shrink-0">
                        <input
                            type="number" min={0} max={criterion.maxPoints}
                            className="w-16 px-2 py-1.5 border border-gray-200 rounded-xl text-sm text-center font-bold bg-white"
                            value={edits[s.studentId] ?? s.proposedPoints}
                            onChange={e => setEdits(prev => ({ ...prev, [s.studentId]: e.target.value }))}
                        />
                        <span className="text-[11px] text-gray-400">/ {criterion.maxPoints}</span>
                    </div>

                    <Button variant="primary" size="sm" disabled={busy} onClick={() => confirmOne(s)}>
                        Tasdiqlash
                    </Button>
                </div>

                {open && (
                    <div className="px-3 pb-3 space-y-3">
                        {/* TIZIMDAGI NATIJALAR — SOLISHTIRISH UCHUN.
                            Talaba universitet musobaqasidagi natijasini
                            "respublika bosqichi" deb yozishi mumkin. Tizim buni
                            avtomatik tuta olmaydi (hujjat nomi erkin matn),
                            shuning uchun tyutorga solishtirish uchun tizimning
                            O'Z yozuvi ko'rsatiladi. */}
                        {criterionKey === 'COMPETITIONS' && (
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                                <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">
                                    Tizimda qayd etilgan natijalari
                                </p>
                                {(() => {
                                    const internal = (s.detail?.candidates || []).filter(c => c.origin === 'internal');
                                    if (internal.length === 0) {
                                        return (
                                            <p className="text-[11px] text-gray-600 mt-1">
                                                Platformada o'tkazilgan musobaqalarda sovrinli o'rni yo'q —
                                                yuklangan hujjat butunlay tashqi natija.
                                            </p>
                                        );
                                    }
                                    return (
                                        <>
                                            <div className="mt-1.5 space-y-1">
                                                {internal.map(c => (
                                                    <p key={c.documentId} className="text-[11px] text-gray-700">
                                                        • {INDEX_CRITERIA.COMPETITIONS.placement[c.level]?.label},{' '}
                                                        {c.place}-o'rin → <b>{c.points} ball</b>
                                                        <span className="text-gray-400"> · tizim bergan hujjat</span>
                                                    </p>
                                                ))}
                                            </div>
                                            <p className="text-[11px] text-gray-500 mt-2">
                                                Yuklangan hujjat shu natijalardan biri bo'lsa, uni qabul qilish
                                                shart emas — u allaqachon hisobga olingan.
                                            </p>
                                        </>
                                    );
                                })()}
                            </div>
                        )}

                        {/* 8-MEZON: PLATFORMADAGI ISHTIROK YOZUVI.
                            Bu talabaning arizasi emas - tadbir kunida davomat
                            belgilaganda yozilgan rol. Shuning uchun u kuchli
                            dalil va mas'ul uni qayta so'ramasligi kerak. */}
                        {criterionKey === 'VOLUNTEERING' && s.volunteering?.rows?.length > 0 && (
                            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                                {/* MA'LUMOTNOMA MATNI - hujjatga o'sha holicha
                                    ko'chiriladi. Metodikaning tilida yozilgan. */}
                                <div className="px-3 py-2.5 bg-indigo-50 border-b border-indigo-100">
                                    <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-700 mb-1">
                                        Ma'lumotnoma
                                    </p>
                                    <p className="text-xs text-gray-800 leading-relaxed">
                                        <b>{s.studentName}</b> {s.academicYear} o'quv yilida{' '}
                                        {s.volunteering.statementText}.
                                    </p>
                                </div>

                                {/* Metodikaning beshta bandi kesimida */}
                                <div className="divide-y divide-gray-50">
                                    {s.volunteering.byCategory.map(c => (
                                        <div key={c.key} className="px-3 py-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="text-xs font-bold text-gray-700">{c.label}</p>
                                                <p className="text-[11px] font-bold text-gray-600 tabular-nums">
                                                    {c.total} ta · {c.points} ball
                                                </p>
                                            </div>
                                            <div className="mt-1 space-y-0.5">
                                                {c.items.map(r => (
                                                    <p key={r.key} className="text-[11px] text-gray-500 flex items-center gap-1.5">
                                                        <span className="truncate">{r.title}</span>
                                                        <span className="text-gray-300">·</span>
                                                        <span className="whitespace-nowrap">
                                                            {new Date(r.date).toLocaleDateString('uz-UZ')}
                                                        </span>
                                                        <Badge variant={r.isActiveRole ? 'success' : 'default'} size="sm">
                                                            {PARTICIPATION_ROLES[r.role]?.label || r.role}
                                                        </Badge>
                                                        {r.clubName && (
                                                            <span
                                                                className="text-amber-600 whitespace-nowrap"
                                                                title="Bu tadbir 2-mezonda ham hisobga olingan"
                                                            >
                                                                {r.clubName} ⓘ
                                                            </span>
                                                        )}
                                                    </p>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="px-3 py-2 border-t border-gray-100 space-y-1">
                                    <p className="text-[11px] text-gray-600">
                                        Ishtirokdan {s.volunteering.platformPoints} ball
                                        {s.volunteering.evidence.length > 0 && (
                                            <> · hujjatlardan {s.volunteering.evidencePoints} ball</>
                                        )}
                                        {' · '}
                                        <b>taklif: {s.volunteering.proposedPoints} / {s.volunteering.maxPoints}</b>
                                    </p>
                                    {/* Ustma-ust tushish OCHIQ aytiladi. */}
                                    {s.volunteering.clubOverlap > 0 && (
                                        <p className="text-[11px] text-amber-700">
                                            {s.volunteering.clubOverlap} ta tadbir klub tadbiri — ular 2-mezonda ham
                                            hisobga olingan. Bu takrorlanish emas: 2-mezon to'garakdagi faollikni,
                                            8-mezon jamoat ishini o'lchaydi.
                                        </p>
                                    )}
                                    <p className="text-[11px] text-gray-400">
                                        Metodikada shkala berilmagan («5 ballgacha» yaxlit baho) — taklif
                                        universitet sozlamasidan chiqadi, oxirgi ball sizniki.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* TALABA YUBORGAN HUJJATLAR.
                            8, 9, 10, 11-mezonlarda bu YAGONA dalil - avtomatik
                            hisob yo'q, ball butunlay mas'ulning bahosidan keladi. */}
                        {s.evidence.length > 0 && (
                            <div className="space-y-2">
                                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
                                    Asoslovchi hujjatlar ({s.evidence.length})
                                </p>
                                {s.evidence.map(ev => (
                                    <div
                                        key={ev.id}
                                        className={`rounded-xl border p-3 ${
                                            ev.status === 'accepted' ? 'border-emerald-200 bg-emerald-50/50'
                                                : ev.status === 'rejected' ? 'border-rose-200 bg-rose-50/50'
                                                    : ev.status === 'returned' ? 'border-amber-200 bg-amber-50/50'
                                                        : 'border-gray-200 bg-white'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-2 flex-wrap">
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-semibold text-gray-900">{ev.title}</p>
                                                {/* TALABANING DA'VOSI. Tyutor ball qo'ymaydi -
                                                    u faqat shu da'vo hujjatga mos kelishini
                                                    tekshiradi. Ball jadvaldan chiqadi. */}
                                                {ev.claim?.level && (
                                                    <p className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-2 py-1 mt-1 inline-block">
                                                        Talabaning da'vosi: {INDEX_CRITERIA.COMPETITIONS.placement[ev.claim.level]?.label},{' '}
                                                        {ev.claim.place}-o'rin → {ev.claim.points} ball
                                                    </p>
                                                )}
                                                {ev.description && (
                                                    <p className="text-[11px] text-gray-600 mt-0.5 whitespace-pre-wrap">{ev.description}</p>
                                                )}
                                                {/* Qaytarilgan hujjat oldin qanday bo'lganini
                                                    ko'rsatish - tyutor nima o'zgarganini biladi. */}
                                                {ev.history?.length > 0 && (
                                                    <p className="text-[11px] text-amber-700 mt-1">
                                                        {ev.history.length}-marta yuborilmoqda.
                                                        {ev.history[ev.history.length - 1].claim?.level && (
                                                            <> Avvalgi da'vo: {INDEX_CRITERIA.COMPETITIONS.placement[ev.history[ev.history.length - 1].claim.level]?.label},{' '}
                                                                {ev.history[ev.history.length - 1].claim.place}-o'rin</>
                                                        )}
                                                    </p>
                                                )}
                                                <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-2 flex-wrap">
                                                    {ev.fileName && (
                                                        <span className="flex items-center gap-1">
                                                            <Paperclip size={10} /> {ev.fileName}
                                                        </span>
                                                    )}
                                                    <span>{new Date(ev.submittedAt).toLocaleDateString('uz-UZ')}</span>
                                                </p>
                                                {ev.comment && (
                                                    <p className="text-[11px] text-gray-500 mt-1 italic">Izoh: {ev.comment}</p>
                                                )}
                                            </div>

                                            {ev.status === 'pending' ? (
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    <button
                                                        type="button" disabled={busy}
                                                        onClick={() => run(() => db.reviewIndexEvidence({
                                                            evidenceId: ev.id, action: 'accept', reviewedBy: user?.username,
                                                        }))}
                                                        className="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-bold hover:bg-emerald-100"
                                                    >
                                                        Qabul qilish
                                                    </button>
                                                    {/* QAYTARISH - hujjat haqiqiy, lekin
                                                        bosqich/o'rin xato ko'rsatilgan. Buni
                                                        rad etish talabaning haqiqiy natijasini
                                                        soxta hujjat bilan tenglashtirardi. */}
                                                    <button
                                                        type="button" disabled={busy}
                                                        onClick={() => {
                                                            const comment = window.prompt('Nimani tuzatish kerak?');
                                                            if (!comment) return;
                                                            run(() => db.reviewIndexEvidence({
                                                                evidenceId: ev.id, action: 'return',
                                                                comment, reviewedBy: user?.username,
                                                            }));
                                                        }}
                                                        className="px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-[11px] font-bold hover:bg-amber-100"
                                                    >
                                                        Qaytarish
                                                    </button>
                                                    <button
                                                        type="button" disabled={busy}
                                                        onClick={() => {
                                                            const comment = window.prompt('Rad etish sababi:');
                                                            if (!comment) return;
                                                            run(() => db.reviewIndexEvidence({
                                                                evidenceId: ev.id, action: 'reject',
                                                                comment, reviewedBy: user?.username,
                                                            }));
                                                        }}
                                                        className="px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-600 text-[11px] font-bold hover:bg-rose-100"
                                                    >
                                                        Rad etish
                                                    </button>
                                                </div>
                                            ) : (
                                                <Badge
                                                    variant={ev.status === 'accepted' ? 'success'
                                                        : ev.status === 'returned' ? 'warning' : 'danger'}
                                                    size="sm"
                                                >
                                                    {ev.status === 'accepted' ? 'Qabul qilingan'
                                                        : ev.status === 'returned' ? 'Qaytarilgan' : 'Rad etilgan'}
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                ))}

                                {/* Hujjat asosida ball qo'yiladi - avtomatik hisob yo'q. */}
                                <p className="text-[11px] text-gray-400">
                                    Ball hujjatlar asosida qo'yiladi. Yuqoridagi maydonga
                                    0 dan {criterion.maxPoints} gacha qiymat kiriting va tasdiqlang.
                                </p>
                            </div>
                        )}

                        {/* Klub jadvali faqat 2-mezonda ma'noga ega. */}
                        {s.rows.length > 0 && (
                        <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="bg-gray-50 text-[10px] uppercase text-gray-400">
                                        <th className="text-left px-3 py-2 font-bold">Klub</th>
                                        <th className="text-left px-3 py-2 font-bold">Yo'nalish</th>
                                        <th className="text-right px-3 py-2 font-bold">Tadbir</th>
                                        <th className="text-right px-3 py-2 font-bold">Qatnashgan</th>
                                        <th className="text-right px-3 py-2 font-bold">Foiz</th>
                                        <th className="text-right px-3 py-2 font-bold">Ball</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {s.rows.map(r => (
                                        <tr key={r.clubId} className="border-t border-gray-50">
                                            <td className="px-3 py-2">
                                                <span className="font-semibold text-gray-800">{r.clubName}</span>
                                                {/* Koordinatorning ishtiroki hujjatda QAYD ETILADI,
                                                    lekin undan qo'shimcha harakat talab qilinmaydi. */}
                                                {r.markedBy.length > 0 && (
                                                    <span className="block text-[10px] text-gray-400">
                                                        Davomatni belgilagan: {r.markedBy.join(', ')}
                                                    </span>
                                                )}
                                                {r.flags.length > 0 && (
                                                    <span className="block text-[10px] font-semibold text-amber-700 mt-0.5">
                                                        {r.flags.join(' · ')}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2 text-gray-500">{r.directionLabel || '—'}</td>
                                            <td className="px-3 py-2 text-right tabular-nums">{r.held}</td>
                                            <td className="px-3 py-2 text-right tabular-nums">{r.attended}</td>
                                            <td className="px-3 py-2 text-right tabular-nums font-semibold">{r.percent}%</td>
                                            <td className="px-3 py-2 text-right tabular-nums font-bold">
                                                {r.enoughEvents ? r.points : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        )}

                        {s.rows.length > 0 && (
                            <p className="text-[11px] text-gray-400">
                                Yakuniy ball yo'nalish kesimida hisoblanadi: har yo'nalish bo'yicha eng yuqori
                                foizli klub olinadi, yig'indi {criterion.maxPoints} ball bilan chegaralanadi.
                            </p>
                        )}

                        {s.rows.length === 0 && s.evidence.length === 0 && (
                            <p className="text-[11px] text-gray-400 py-2">Dalil topilmadi.</p>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-4">
            <Card>
                <div className="p-5 space-y-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                            <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                <FileCheck2 size={17} className="text-indigo-600" /> Ma'lumotnomalarni tasdiqlash
                            </h3>
                            <p className="text-xs text-gray-500 mt-1">
                                {criterion.id}-mezon · {criterion.name}
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-2xl font-extrabold text-gray-900 tabular-nums">{queue.length}</p>
                            <p className="text-[11px] text-gray-400">tasdiqlanmagan</p>
                        </div>
                    </div>

                    {/* Mezon tanlash - tasdiq talab qiladigan mezonlar ro'yxati
                        metodikadan olinadi (CRITERIA_NEEDING_CONFIRMATION). */}
                    <div className="flex flex-wrap gap-1.5">
                        {CRITERIA_NEEDING_CONFIRMATION.map(key => {
                            const c = INDEX_CRITERIA[key];
                            const pending = db.getCriterionConfirmationQueue(key).length;
                            const active = key === criterionKey;
                            return (
                                <button
                                    key={key} type="button"
                                    onClick={() => { setCriterionKey(key); setExpanded(null); setEdits({}); }}
                                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-colors ${
                                        active ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                                >
                                    {c.id}. {c.name.length > 24 ? c.name.slice(0, 24) + '…' : c.name}
                                    {pending > 0 && (
                                        <span className={`px-1.5 rounded-md ${active ? 'bg-white/25' : 'bg-amber-100 text-amber-700'}`}>
                                            {pending}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                        <p className="text-[11px] text-gray-600 leading-relaxed">
                            Ball talabaga <span className="font-bold">«tasdiqlanmagan»</span> holatida ko'rinib
                            turadi; yakuniy indeksga tasdiqlangan qiymat kiradi.
                            {criterionKey === 'CLUBS'
                                ? " Davomat tadbir kunida belgilangan va qulflangan — koordinatordan qayta tasdiq so'ralmaydi, uning ismi ma'lumotnomada qayd etiladi."
                                : ' Bu mezonda avtomatik hisob yo\'q — ball talaba yuborgan asoslovchi hujjatlar asosida qo\'yiladi.'}
                        </p>
                    </div>

                    {error && (
                        <p className="flex items-start gap-1.5 text-[11px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                            <AlertTriangle size={12} className="shrink-0 mt-px" /> {error}
                        </p>
                    )}
                    {message && (
                        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
                            <CheckCircle2 size={12} /> {message}
                        </p>
                    )}
                </div>
            </Card>

            {queue.length === 0 ? (
                <Card>
                    <div className="p-10 text-center space-y-2">
                        <ShieldCheck className="w-8 h-8 text-emerald-500 mx-auto" />
                        <p className="text-sm font-semibold text-gray-700">Tasdiqlanmagan ma'lumotnoma yo'q</p>
                        <p className="text-xs text-gray-400">
                            Yangi qatnashuvlar qayd etilgach ular shu yerda paydo bo'ladi.
                        </p>
                    </div>
                </Card>
            ) : (
                <>
                    {attention.length > 0 && (
                        <div className="space-y-2">
                            <h4 className="text-sm font-bold text-amber-800 flex items-center gap-1.5">
                                <AlertTriangle size={14} /> Diqqat talab qiladi ({attention.length})
                            </h4>
                            <p className="text-[11px] text-gray-500 -mt-1">
                                Kam tadbirli klubda 100%, juda past ishtirok yoki qulflanmagan davomat —
                                bularni qo'lda ko'rib chiqing.
                            </p>
                            {attention.map(renderStatement)}
                        </div>
                    )}

                    {clean.length > 0 && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                <h4 className="text-sm font-bold text-gray-700">
                                    Odatiy ({clean.length})
                                </h4>
                                <Button variant="primary" size="sm" disabled={busy} onClick={confirmAllClean}>
                                    {busy ? 'Tasdiqlanmoqda...' : `Hammasini tasdiqlash (${clean.length})`}
                                </Button>
                            </div>
                            {clean.map(renderStatement)}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default CriterionConfirmationPanel;
