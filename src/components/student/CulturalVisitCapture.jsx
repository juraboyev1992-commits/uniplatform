import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, MapPin, AlertTriangle, CheckCircle2, Clock, XCircle, Loader2 } from 'lucide-react';
import Card from '../common/Card';
import Badge from '../common/Badge';
import Button from '../common/Button';
import Modal from '../common/Modal';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import {
    INDEX_CRITERIA, CULTURAL_PLACE_TYPES, CULTURAL_PLACE_TYPE_ORDER,
} from '../../config/socialActivityIndex';

// MADANIY TASHRIF QAYD ETISH (9-mezon).
//
// Talaba HISOBOT YOZMAYDI: joyda turib suratga oladi, joylashuvi qayd etiladi.
// Ma'lumotnoma shu qaydlardan o'zi shakllanadi, tyutor esa faqat tasdiqlaydi.
//
// Fotosurat `capture="environment"` bilan so'raladi - telefonda kamera
// ochiladi. Bu KAFOLAT emas: kompyuterda va ba'zi telefonlarda fayl tanlash
// oynasi ochilishi mumkin. Shuning uchun oxirgi tekshiruv baribir odamda -
// buni yashirmaymiz.
const STATUS_META = {
    pending: { label: "Ko'rib chiqilmoqda", variant: 'warning', icon: Clock },
    confirmed: { label: 'Tasdiqlangan', variant: 'success', icon: CheckCircle2 },
    rejected: { label: 'Rad etilgan', variant: 'danger', icon: XCircle },
};

const CulturalVisitCapture = () => {
    const { user } = useAuth();
    const criterion = INDEX_CRITERIA.CULTURAL;
    const [version, setVersion] = useState(0);
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    const places = useMemo(() => db.getCulturalPlaces(), [version]);
    const visits = useMemo(
        () => db.getCulturalVisits({ studentId: user.username }),
        [user.username, version]
    );
    const stats = useMemo(
        () => db.getStudentCulturalActivity(user.username),
        [user.username, version]
    );

    // --- Qayd etish shakli ---
    const [placeId, setPlaceId] = useState('');
    const [placeName, setPlaceName] = useState('');
    const [placeType, setPlaceType] = useState('');
    const [note, setNote] = useState('');
    const [photo, setPhoto] = useState(null);
    const [preview, setPreview] = useState(null);
    const [coords, setCoords] = useState(null);
    const [geoState, setGeoState] = useState('idle'); // idle | asking | ok | denied
    const fileRef = useRef(null);

    const selectedPlace = places.find(p => p.id === placeId) || null;

    // Oyna ochilganda joylashuv so'raladi - talaba tugma qidirmasin.
    useEffect(() => {
        if (!open) return;
        if (!navigator.geolocation) { setGeoState('denied'); return; }
        setGeoState('asking');
        navigator.geolocation.getCurrentPosition(
            pos => {
                setCoords({
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                });
                setGeoState('ok');
            },
            () => setGeoState('denied'),
            { enableHighAccuracy: true, timeout: 15000 }
        );
    }, [open]);

    // Ko'rinish uchun havola - xotirada qolib ketmasin.
    useEffect(() => {
        if (!photo) { setPreview(null); return; }
        const url = URL.createObjectURL(photo);
        setPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [photo]);

    const reset = () => {
        setPlaceId(''); setPlaceName(''); setPlaceType(''); setNote('');
        setPhoto(null); setCoords(null); setGeoState('idle');
        if (fileRef.current) fileRef.current.value = '';
    };

    const submit = async () => {
        setBusy(true); setError(''); setMessage('');
        try {
            await db.recordCulturalVisit({
                studentId: user.username,
                placeId: placeId || null,
                placeName: selectedPlace ? selectedPlace.name : placeName,
                placeType: selectedPlace ? selectedPlace.type : placeType,
                latitude: coords?.latitude ?? null,
                longitude: coords?.longitude ?? null,
                accuracy: coords?.accuracy ?? null,
                photoFile: photo,
                note,
            });
            reset();
            setOpen(false);
            setVersion(v => v + 1);
            setMessage('Tashrif qayd etildi — tasdiqlash kutilmoqda.');
        } catch (e) {
            setError(e?.message || 'Xatolik yuz berdi.');
        } finally {
            setBusy(false);
        }
    };

    const canSubmit = !busy && photo
        && (selectedPlace || (placeName.trim() && placeType));

    const monthLabel = (key) => {
        const [y, m] = key.split('-');
        return new Date(Number(y), Number(m) - 1, 1)
            .toLocaleDateString('uz-UZ', { month: 'short', year: '2-digit' });
    };

    return (
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
                    <Button variant="primary" size="sm" icon={Camera} onClick={() => setOpen(true)}>
                        Tashrif qayd etish
                    </Button>
                </div>

                {/* Ball SONGA emas, MUNTAZAMLIKKA bog'liq - buni birinchi
                    aytish kerak, aks holda talaba bir kunda o'nta joyga
                    borib ball kutadi. */}
                <div className="p-3 bg-teal-50 border border-teal-100 rounded-xl space-y-1.5">
                    <p className="text-[11px] font-bold text-teal-800">
                        Ball tashriflar soniga emas, muntazamligiga qarab beriladi
                    </p>
                    {criterion.frequencyBands.map(b => (
                        <p key={b.key} className="text-[11px] text-gray-600">
                            • {b.label} — <b>{b.points} ball</b>
                        </p>
                    ))}
                </div>

                {/* Oylar chizig'i: qaysi oyda tashrif bo'lgani ko'rinib tursin. */}
                {stats.elapsedMonths.length > 0 && (
                    <div>
                        <p className="text-[11px] font-bold text-gray-400 uppercase mb-1.5">
                            Hisobot davri
                        </p>
                        <div className="flex flex-wrap gap-1">
                            {stats.elapsedMonths.map(m => {
                                const has = stats.visitMonths.includes(m);
                                return (
                                    <span
                                        key={m}
                                        className={`px-2 py-1 rounded-lg text-[10px] font-bold ${
                                            has
                                                ? 'bg-emerald-100 text-emerald-700'
                                                : 'bg-gray-50 text-gray-300 border border-dashed border-gray-200'
                                        }`}
                                    >
                                        {monthLabel(m)}
                                    </span>
                                );
                            })}
                        </div>
                        {stats.frequency && (
                            <p className="text-xs font-bold text-gray-800 mt-2">
                                {stats.frequency.label} — {stats.frequency.points} ball
                            </p>
                        )}
                    </div>
                )}

                {message && (
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
                        <CheckCircle2 size={12} /> {message}
                    </p>
                )}

                {/* Qaydlar ro'yxati */}
                {visits.length > 0 && (
                    <div className="space-y-1.5">
                        <p className="text-[11px] font-bold text-gray-400 uppercase">
                            Qaydlarim ({visits.length})
                        </p>
                        {visits.slice(0, 8).map(v => {
                            const meta = STATUS_META[v.status] || STATUS_META.pending;
                            return (
                                <div key={v.id} className="flex items-start justify-between gap-2 py-1.5 border-b border-gray-50 last:border-0">
                                    <div className="min-w-0">
                                        <p className="text-xs font-semibold text-gray-800 truncate">{v.placeName}</p>
                                        <p className="text-[11px] text-gray-400">
                                            {CULTURAL_PLACE_TYPES[v.placeType]?.label}
                                            {' · '}
                                            {new Date(v.visitedAt).toLocaleDateString('uz-UZ')}
                                        </p>
                                        {v.reviewComment && (
                                            <p className="text-[11px] text-rose-600 mt-0.5">{v.reviewComment}</p>
                                        )}
                                    </div>
                                    <Badge variant={meta.variant} size="sm">{meta.label}</Badge>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* --- QAYD ETISH OYNASI --- */}
            <Modal
                isOpen={open}
                onClose={() => { setOpen(false); reset(); setError(''); }}
                title="Tashrif qayd etish"
            >
                <div className="space-y-4">
                    {/* JOYLASHUV holati - talaba nima bo'layotganini bilsin. */}
                    <div className={`p-3 rounded-xl border text-[11px] ${
                        geoState === 'ok' ? 'bg-emerald-50 border-emerald-100 text-emerald-800'
                            : geoState === 'denied' ? 'bg-amber-50 border-amber-100 text-amber-800'
                                : 'bg-gray-50 border-gray-100 text-gray-600'
                    }`}>
                        {geoState === 'asking' && (
                            <span className="flex items-center gap-1.5">
                                <Loader2 size={12} className="animate-spin" /> Joylashuv aniqlanmoqda...
                            </span>
                        )}
                        {geoState === 'ok' && (
                            <span className="flex items-center gap-1.5">
                                <MapPin size={12} /> Joylashuv qayd etildi
                                {coords?.accuracy && ` (±${Math.round(coords.accuracy)} m)`}
                            </span>
                        )}
                        {geoState === 'denied' && (
                            <span className="flex items-start gap-1.5">
                                <AlertTriangle size={12} className="shrink-0 mt-px" />
                                Joylashuv olinmadi. Tashrifni baribir qayd etishingiz mumkin, lekin
                                geolokatsiyasiz qayd tasdiqlanmasligi mumkin.
                            </span>
                        )}
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Joy</label>
                        <select
                            value={placeId}
                            onChange={e => { setPlaceId(e.target.value); setPlaceName(''); setPlaceType(''); }}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white"
                        >
                            <option value="">Ro'yxatdan tanlang yoki o'zingiz yozing...</option>
                            {CULTURAL_PLACE_TYPE_ORDER.map(t => {
                                const group = places.filter(p => p.type === t);
                                if (group.length === 0) return null;
                                return (
                                    <optgroup key={t} label={CULTURAL_PLACE_TYPES[t].label}>
                                        {group.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </optgroup>
                                );
                            })}
                        </select>
                    </div>

                    {!placeId && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <input
                                type="text" value={placeName} onChange={e => setPlaceName(e.target.value)}
                                placeholder="Joy nomi"
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
                            />
                            <select
                                value={placeType} onChange={e => setPlaceType(e.target.value)}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white"
                            >
                                <option value="">Turi...</option>
                                {CULTURAL_PLACE_TYPE_ORDER.map(t => (
                                    <option key={t} value={t}>{CULTURAL_PLACE_TYPES[t].label}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* FOTOSURAT - majburiy. Telefonda kamera ochiladi. */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">
                            Fotosurat *
                        </label>
                        {preview ? (
                            <div className="relative">
                                <img src={preview} alt="" className="w-full h-48 object-cover rounded-xl border border-gray-200" />
                                <button
                                    type="button"
                                    onClick={() => { setPhoto(null); if (fileRef.current) fileRef.current.value = ''; }}
                                    className="absolute top-2 right-2 px-2.5 py-1 rounded-lg bg-white/90 text-[11px] font-bold text-gray-700"
                                >
                                    Qayta olish
                                </button>
                            </div>
                        ) : (
                            <label className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:border-teal-500 transition-colors cursor-pointer block">
                                <Camera className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                                <p className="text-sm text-gray-600">Joyda turib suratga oling</p>
                                <input
                                    ref={fileRef}
                                    type="file" accept="image/*" capture="environment"
                                    className="hidden"
                                    onChange={e => setPhoto(e.target.files?.[0] || null)}
                                />
                            </label>
                        )}
                        {/* Cheklovni ochiq aytamiz. */}
                        <p className="text-[11px] text-gray-400 mt-1.5">
                            Telefonda kamera ochiladi. Fotosurat va joylashuv birga saqlanadi —
                            hisobot yozish shart emas, ma'lumotnoma o'zi shakllanadi.
                        </p>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Izoh</label>
                        <input
                            type="text" value={note} onChange={e => setNote(e.target.value)}
                            placeholder="Ixtiyoriy"
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
                        />
                    </div>

                    {error && (
                        <p className="text-[11px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                            {error}
                        </p>
                    )}

                    <div className="flex gap-3">
                        <Button variant="outline" className="flex-1" onClick={() => { setOpen(false); reset(); }}>
                            Bekor qilish
                        </Button>
                        <Button variant="primary" className="flex-1" disabled={!canSubmit} onClick={submit}>
                            {busy ? 'Yuborilmoqda...' : 'Qayd etish'}
                        </Button>
                    </div>
                </div>
            </Modal>
        </Card>
    );
};

export default CulturalVisitCapture;
