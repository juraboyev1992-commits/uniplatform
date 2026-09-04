import React, { useEffect, useMemo, useState } from 'react';
import {
    MapPin, Plus, AlertTriangle, CheckCircle2, Image as ImageIcon, Loader2,
} from 'lucide-react';
import Card from '../common/Card';
import Badge from '../common/Badge';
import Button from '../common/Button';
import Modal from '../common/Modal';
import StatStrip from '../common/StatStrip';
import { getCulturalStats } from '../../utils/moduleStats';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import {
    INDEX_CRITERIA, CULTURAL_PLACE_TYPES, CULTURAL_PLACE_TYPE_ORDER,
    CULTURAL_PROXIMITY_METERS,
} from '../../config/socialActivityIndex';

// MADANIY TASHRIFLARNI TASDIQLASH (9-mezon).
//
// Tyutorning ishi ball qo'yish EMAS: u faqat fotosurat va joylashuv haqiqiy
// ekanini tasdiqlaydi. Ball muntazamlikdan avtomatik chiqadi.
//
// Masofa ko'rsatiladi, lekin uzoq qayd RAD ETILMAYDI: GPS xatosi shaharda
// 100 metrga yetadi va talabani texnika xatosi uchun jazolash noto'g'ri.
// Qaror odamda.
// `scopeStudentIds` - null bo'lsa hamma tashriflar (administrator), massiv
// bo'lsa faqat o'sha talabalarniki (tyutor o'ziga biriktirilganlarni ko'radi).
const CulturalVisitsPanel = ({ scopeStudentIds = null, showPlaces = true }) => {
    const { user } = useAuth();
    const criterion = INDEX_CRITERIA.CULTURAL;
    const [version, setVersion] = useState(0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [showPlaceForm, setShowPlaceForm] = useState(false);
    const [photoOf, setPhotoOf] = useState(null);
    const [photoUrl, setPhotoUrl] = useState(null);

    const pending = useMemo(() => {
        const rows = db.getCulturalVisits({ status: 'pending' });
        if (!scopeStudentIds) return rows;
        const allowed = new Set(scopeStudentIds);
        return rows.filter(v => allowed.has(v.studentId));
    }, [version, scopeStudentIds]);
    const places = useMemo(() => db.getCulturalPlaces(true), [version]);
    const students = useMemo(
        () => new Map(db.getMockStudents().map(s => [s.id, s])),
        []
    );

    // Fotosurat havolasi vaqtinchalik - ombor yopiq, ochiq havola yo'q.
    useEffect(() => {
        if (!photoOf?.photoPath) { setPhotoUrl(null); return; }
        let alive = true;
        setPhotoUrl(null);
        db.getCulturalPhotoUrl(photoOf.photoPath).then(url => { if (alive) setPhotoUrl(url); });
        return () => { alive = false; };
    }, [photoOf]);

    const run = async (fn, ok = '') => {
        setBusy(true); setError(''); setMessage('');
        try { await fn(); setVersion(v => v + 1); if (ok) setMessage(ok); }
        catch (e) { setError(e?.message || 'Xatolik yuz berdi.'); }
        finally { setBusy(false); }
    };

    const [form, setForm] = useState({ name: '', type: '', address: '', latitude: '', longitude: '' });

    // Umumiy ko'rsatkichlar - faqat ADMINISTRATOR ko'rinishida. Tyutorda
    // ro'yxat o'ziga biriktirilgan talabalar bilan cheklangan, ko'rsatkich
    // esa butun universitetniki bo'lardi va ikkisi bir-biriga zid ko'rinardi.
    const stats = useMemo(
        () => (scopeStudentIds ? null : getCulturalStats(db)),
        [version, scopeStudentIds]
    );

    return (
        <div className="space-y-4">
            <Card>
                <div className="p-5 space-y-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                            <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                <MapPin size={17} className="text-teal-600" /> Madaniy tashriflar
                            </h3>
                            <p className="text-xs text-gray-500 mt-1">
                                9-mezon · maksimal {criterion.maxPoints} ball
                            </p>
                        </div>
                        {pending.length > 0 && (
                            <Badge variant="warning">{pending.length} ta kutilmoqda</Badge>
                        )}
                    </div>

                    {stats && (
                        <>
                            <StatStrip
                                items={[
                                    { label: 'Tasdiqlangan tashrif', value: stats.confirmed, tone: 'teal' },
                                    { label: 'Qamrab olingan talaba', value: stats.students, tone: 'indigo' },
                                    { label: 'Tasdiqlanish ulushi', value: stats.confirmRate, suffix: '%', tone: 'emerald', hint: 'ko\'rib chiqilganlardan' },
                                    { label: 'Katalogdagi joylar', value: stats.places, tone: 'gray' },
                                ]}
                                warnings={[
                                    stats.pending > 0 && `${stats.pending} ta tashrif javob kutmoqda`,
                                    stats.places === 0 && "Katalogda joy yo'q — masofa tekshirilmaydi",
                                ]}
                            />

                            {stats.topPlaces.length > 0 && (
                                <div>
                                    <p className="text-[11px] font-bold text-gray-400 uppercase mb-1.5">
                                        Eng ko'p tashrif buyurilgan joylar
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {stats.topPlaces.map(p => (
                                            <span key={p.name} className="px-2.5 py-1 rounded-lg bg-teal-50 text-teal-700 text-xs font-semibold">
                                                {p.name}
                                                <span className="opacity-60 ml-1.5 tabular-nums">
                                                    {p.visits} tashrif · {p.students} talaba
                                                </span>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* Tyutor ball qo'ymasligini aniq aytish kerak. */}
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                        <p className="text-[11px] text-gray-600 leading-relaxed">
                            <b>Bu yerda ball qo'yilmaydi.</b> Siz faqat fotosurat va joylashuv
                            haqiqiy ekanini tasdiqlaysiz. Ball tashriflarning <b>muntazamligidan</b>
                            {' '}avtomatik chiqadi: har oyda kamida bir marta — 5 ball, har ikki
                            oyda — 3 ball, semestrda — 1 ball.
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

                    {pending.length === 0 ? (
                        <p className="text-sm text-gray-400 py-3 text-center">
                            Ko'rib chiqilmagan tashrif yo'q.
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {pending.map(v => {
                                const far = v.distance != null && v.distance > CULTURAL_PROXIMITY_METERS;
                                return (
                                    <div key={v.id} className="border border-gray-200 rounded-xl p-3 space-y-2">
                                        <div className="flex items-start justify-between gap-3 flex-wrap">
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold text-gray-900">
                                                    {students.get(v.studentId)?.fullName || v.studentId}
                                                </p>
                                                <p className="text-[11px] text-gray-500">
                                                    {v.placeName} · {CULTURAL_PLACE_TYPES[v.placeType]?.label}
                                                    {' · '}
                                                    {new Date(v.visitedAt).toLocaleString('uz-UZ')}
                                                </p>
                                                {v.note && (
                                                    <p className="text-[11px] text-gray-400 italic mt-0.5">{v.note}</p>
                                                )}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setPhotoOf(v)}
                                                className="px-2.5 py-1.5 rounded-lg bg-teal-50 text-teal-700 text-[11px] font-bold hover:bg-teal-100 flex items-center gap-1"
                                            >
                                                <ImageIcon size={12} /> Fotosurat
                                            </button>
                                        </div>

                                        {/* Joylashuv - dalilning ikkinchi yarmi. */}
                                        <div className="flex flex-wrap gap-2 text-[11px]">
                                            {v.latitude != null ? (
                                                <a
                                                    href={`https://www.google.com/maps?q=${v.latitude},${v.longitude}`}
                                                    target="_blank" rel="noreferrer"
                                                    className="px-2 py-1 rounded-lg bg-gray-50 border border-gray-200 text-gray-700 hover:border-gray-300"
                                                >
                                                    <MapPin size={10} className="inline mr-1" />
                                                    Xaritada ko'rish
                                                    {v.accuracy && ` (±${Math.round(v.accuracy)} m)`}
                                                </a>
                                            ) : (
                                                <span className="px-2 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
                                                    Joylashuv qayd etilmagan
                                                </span>
                                            )}
                                            {v.distance != null && (
                                                <span className={`px-2 py-1 rounded-lg border ${
                                                    far
                                                        ? 'bg-amber-50 border-amber-200 text-amber-800'
                                                        : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                                }`}>
                                                    Joydan {v.distance} m
                                                    {far && ' — uzoq'}
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex gap-2">
                                            <button
                                                type="button" disabled={busy}
                                                onClick={() => run(() => db.reviewCulturalVisit({
                                                    visitId: v.id, action: 'confirm', reviewedBy: user?.username,
                                                }), 'Tashrif tasdiqlandi.')}
                                                className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-bold hover:bg-emerald-100"
                                            >
                                                Tasdiqlash
                                            </button>
                                            <button
                                                type="button" disabled={busy}
                                                onClick={() => {
                                                    const comment = window.prompt('Rad etish sababi:');
                                                    if (!comment) return;
                                                    run(() => db.reviewCulturalVisit({
                                                        visitId: v.id, action: 'reject',
                                                        comment, reviewedBy: user?.username,
                                                    }), 'Tashrif rad etildi.');
                                                }}
                                                className="px-3 py-1.5 rounded-lg bg-rose-50 text-rose-600 text-[11px] font-bold hover:bg-rose-100"
                                            >
                                                Rad etish
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </Card>

            {/* JOYLAR KATALOGI. Koordinatasi bo'lgan joy uchun tizim masofani
                hisoblaydi - shuning uchun katalogni to'ldirish tekshiruvni
                kuchaytiradi. Katalog universitet miqyosida - tyutorga
                ko'rsatilmaydi. */}
            {showPlaces && (
            <Card>
                <div className="p-5 space-y-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <h4 className="font-bold text-sm text-gray-700">
                            Joylar katalogi ({places.length})
                        </h4>
                        <Button variant="outline" size="sm" icon={Plus} onClick={() => {
                            setForm({ name: '', type: '', address: '', latitude: '', longitude: '' });
                            setShowPlaceForm(true);
                        }}>
                            Joy qo'shish
                        </Button>
                    </div>

                    {places.length === 0 ? (
                        <p className="text-[11px] text-gray-400">
                            Katalog bo'sh. Talaba joy nomini o'zi yozishi mumkin, lekin katalogdagi
                            joy uchun tizim masofani ham hisoblaydi.
                        </p>
                    ) : (
                        <div className="space-y-1">
                            {places.map(p => (
                                <div key={p.id} className="flex items-center justify-between gap-3 py-1.5 border-b border-gray-50 last:border-0">
                                    <div className="min-w-0">
                                        <p className="text-xs font-semibold text-gray-800 truncate">{p.name}</p>
                                        <p className="text-[11px] text-gray-400">
                                            {CULTURAL_PLACE_TYPES[p.type]?.label}
                                            {p.address ? ` · ${p.address}` : ''}
                                        </p>
                                    </div>
                                    <Badge variant={p.latitude != null ? 'success' : 'default'} size="sm">
                                        {p.latitude != null ? 'Koordinatali' : 'Koordinatasiz'}
                                    </Badge>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </Card>
            )}

            {/* Fotosurat oynasi */}
            <Modal isOpen={!!photoOf} onClose={() => setPhotoOf(null)} title="Tashrif fotosurati">
                {photoOf && (
                    <div className="space-y-3">
                        <p className="text-xs text-gray-500">
                            {photoOf.placeName} · {new Date(photoOf.visitedAt).toLocaleString('uz-UZ')}
                        </p>
                        {photoUrl ? (
                            <img src={photoUrl} alt="" className="w-full rounded-xl border border-gray-200" />
                        ) : (
                            <div className="h-48 flex items-center justify-center text-gray-400">
                                <Loader2 size={20} className="animate-spin" />
                            </div>
                        )}
                    </div>
                )}
            </Modal>

            {/* Joy qo'shish */}
            <Modal isOpen={showPlaceForm} onClose={() => setShowPlaceForm(false)} title="Joy qo'shish">
                <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input
                            type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                            placeholder="Joy nomi"
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
                        />
                        <select
                            value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white"
                        >
                            <option value="">Turi...</option>
                            {CULTURAL_PLACE_TYPE_ORDER.map(t => (
                                <option key={t} value={t}>{CULTURAL_PLACE_TYPES[t].label}</option>
                            ))}
                        </select>
                    </div>
                    <input
                        type="text" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                        placeholder="Manzil"
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
                    />
                    <div className="grid grid-cols-2 gap-3">
                        <input
                            type="number" step="any" value={form.latitude}
                            onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))}
                            placeholder="Kenglik (41.31...)"
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
                        />
                        <input
                            type="number" step="any" value={form.longitude}
                            onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))}
                            placeholder="Uzunlik (69.24...)"
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
                        />
                    </div>
                    <p className="text-[11px] text-gray-400">
                        Koordinata ixtiyoriy. Kiritilsa tizim tashrif joydan qancha uzoqda qayd
                        etilganini hisoblaydi va {CULTURAL_PROXIMITY_METERS} metrdan uzoqni belgilaydi —
                        lekin rad etmaydi, chunki GPS xatosi shaharda katta bo'ladi.
                    </p>

                    <div className="flex gap-3">
                        <Button variant="outline" className="flex-1" onClick={() => setShowPlaceForm(false)}>
                            Bekor qilish
                        </Button>
                        <Button
                            variant="primary" className="flex-1"
                            disabled={busy || !form.name.trim() || !form.type}
                            onClick={() => run(async () => {
                                await db.saveCulturalPlace({ ...form, by: user?.username });
                                setShowPlaceForm(false);
                            }, "Joy qo'shildi.")}
                        >
                            Saqlash
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default CulturalVisitsPanel;
