import React, { useEffect, useMemo, useState } from 'react';
import { Camera, MapPin, AlertTriangle, CheckCircle2, Clock, XCircle, Loader2 } from 'lucide-react';
import Card from '../common/Card';
import Badge from '../common/Badge';
import Button from '../common/Button';
import Modal from '../common/Modal';
import RegionPicker from '../common/RegionPicker';
import CulturalPlacePicker from './CulturalPlacePicker';
import LiveCameraCapture from '../common/LiveCameraCapture';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import {
    INDEX_CRITERIA, CULTURAL_PLACE_TYPES, CULTURAL_PLACE_TYPE_ORDER,
    CULTURAL_PHOTO_COUNT,
    regionAllowsCredit, isNamedHeritageCity,
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
    // HUDUD - shahar/viloyat. Metodika qadamjo va turizm maskani OTM
    // joylashgan hududdan BOSHQA joyda bo'lishini talab qiladi; teatr,
    // muzey, kino va xiyobon uchun bunday cheklov yo'q.
    const [region, setRegion] = useState('');
    // Tuman ro'yxatdan tanlanadi, lekin ro'yxat eskirishi mumkin - shuning
    // uchun "Boshqa" varianti erkin matn maydonini ochadi.
    const [district, setDistrict] = useState('');
    const [placeType, setPlaceType] = useState('');
    const [note, setNote] = useState('');
    // Uchta surat. `captureMode` - ular JONLI kameradan olindimi yoki
    // fayldan tanlandimi. Tasdiqlovchi buni ko'rishi kerak.
    const [photos, setPhotos] = useState([]);
    const [captureMode, setCaptureMode] = useState('live');
    const [coords, setCoords] = useState(null);
    const [geoState, setGeoState] = useState('idle'); // idle | asking | ok | denied

    const selectedPlace = places.find(p => p.id === placeId) || null;

    // Tashrifning HAQIQIY turi/hududi - katalogdagi joy tanlansa uniki,
    // aks holda talaba tanlagani. Qoida tekshiruvi shularga qaraydi.
    const effType = selectedPlace ? selectedPlace.type : placeType;
    const effRegion = selectedPlace ? (selectedPlace.region || region) : region;
    const effDistrict = selectedPlace ? (selectedPlace.district || district) : district;

    // Ro'yxat TUR bo'yicha, hudud tanlangan bo'lsa hudud bo'yicha ham
    // suziladi. TUMAN bo'yicha suzilmaydi ATAYLAB: katalogdagi joyda tuman
    // ko'rsatilmagan bo'lishi mumkin va u holda ro'yxat bo'shab qolardi.
    const placeChoices = places.filter(p => (
        (!placeType || p.type === placeType)
        && (!region || !p.region || p.region === region)
    ));

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

    const reset = () => {
        setPlaceId(''); setPlaceName(''); setPlaceType(''); setNote('');
        setRegion(''); setDistrict('');
        setPhotos([]); setCaptureMode('live');
        setCoords(null); setGeoState('idle');
    };

    const submit = async () => {
        setBusy(true); setError(''); setMessage('');
        try {
            await db.recordCulturalVisit({
                studentId: user.username,
                placeId: placeId || null,
                placeName: selectedPlace ? selectedPlace.name : placeName,
                placeType: effType,
                region: effRegion || null,
                district: (effDistrict || '').trim() || null,
                latitude: coords?.latitude ?? null,
                longitude: coords?.longitude ?? null,
                accuracy: coords?.accuracy ?? null,
                photoFiles: photos,
                captureMode,
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

    // Tur endi HAR DOIM shart: ro'yxat aynan shunga qarab suziladi.
    const canSubmit = !busy && placeType
        && photos.length >= CULTURAL_PHOTO_COUNT
        && (selectedPlace || placeName.trim());

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

                    {/* TARTIB: tur -> hudud/tuman -> joy.
                        Avval nima turdagi joyga borgani, keyin qayerdaligi,
                        oxirida joyning o'zi - shunda ro'yxat allaqachon
                        suzilgan bo'ladi va talaba yuzlab joy ichidan
                        qidirmaydi. Ilgari teskari edi: birinchi butun
                        katalog chiqardi, tur esa pastda so'ralardi. */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">
                            1. Joy turi
                        </label>
                        <select
                            value={placeType}
                            onChange={e => {
                                setPlaceType(e.target.value);
                                // Tur o'zgarsa avvalgi tanlov mos kelmay
                                // qolishi mumkin - tozalaymiz.
                                setPlaceId(''); setPlaceName('');
                            }}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white"
                        >
                            <option value="">Tanlang...</option>
                            {CULTURAL_PLACE_TYPE_ORDER.map(t => (
                                <option key={t} value={t}>{CULTURAL_PLACE_TYPES[t].label}</option>
                            ))}
                        </select>
                    </div>

                    {placeType && (
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">
                                2. Hudud
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <RegionPicker
                                    region={region} district={district}
                                    onChange={({ region: r, district: d }) => {
                                        setRegion(r); setDistrict(d);
                                        setPlaceId(''); setPlaceName('');
                                    }}
                                />
                            </div>
                        </div>
                    )}

                    {placeType && (
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">
                                3. Joy
                            </label>
                            <CulturalPlacePicker
                                places={placeChoices}
                                placeId={placeId} placeName={placeName}
                                onChange={({ placeId: id, placeName: nm }) => {
                                    setPlaceId(id); setPlaceName(nm);
                                }}
                            />
                        </div>
                    )}

                    {/* OGOHLANTIRISH - yuborishdan OLDIN. Talaba qayd etib
                        bo'lgandan keyin "hisobga olinmadi" deb eshitgandan
                        ko'ra, hozir bilgani yaxshi. To'sib qo'yilmaydi:
                        qaror baribir tasdiqlovchida. */}
                    {regionAllowsCredit(effType, effRegion) === false && (
                        <p className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                            Metodika bo&rsquo;yicha qadamjo va turizm maskanlari universitet
                            joylashgan hududdan tashqarida bo&rsquo;lishi kerak — bu tashrif
                            hisobga olinmasligi mumkin. Teatr, muzey va kinoga bu cheklov
                            tegishli emas.
                        </p>
                    )}

                    {/* Aksincha holat: metodikada nomma-nom turgan shahar.
                        Talaba qayd to'g'ri ketayotganini KO'RIB tursin. */}
                    {effType === 'heritage'
                        && regionAllowsCredit(effType, effRegion) === true
                        && isNamedHeritageCity(effRegion, effDistrict) && (
                        <p className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                            Bu shahar metodikada nomma-nom sanab o&rsquo;tilgan.
                        </p>
                    )}

                    {/* FOTOSURAT - majburiy, JONLI kameradan.
                        `<input capture>` yetarli emas edi: u brauzerga
                        maslahat xolos va ko'p qurilmada oddiy fayl tanlash
                        oynasini ochardi, ya'ni gallereyadagi eski surat ham
                        o'tib ketaverardi. */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">
                            4. Fotosurat ({CULTURAL_PHOTO_COUNT} ta)
                        </label>
                        {/* Kamera FAQAT joy tanlangach ochiladi. Aks holda
                            oyna ochilishi bilan ruxsat so'ralardi - talaba
                            hali nima qilayotganini bilmay turib. */}
                        {placeType && (selectedPlace || placeName) ? (
                            <LiveCameraCapture
                                count={CULTURAL_PHOTO_COUNT}
                                photos={photos}
                                onChange={(next, mode) => {
                                    setPhotos(next);
                                    if (mode) setCaptureMode(mode);
                                }}
                            />
                        ) : (
                            <p className="text-[11px] text-gray-400 border border-dashed border-gray-200 rounded-xl px-3 py-4 text-center">
                                Avval joyni tanlang &mdash; keyin kamera ochiladi.
                            </p>
                        )}
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
