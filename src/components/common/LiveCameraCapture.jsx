import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, X, AlertTriangle, Loader2, RefreshCw, SwitchCamera } from 'lucide-react';

// JONLI SURATGA OLISH.
//
// NEGA `<input capture="environment">` YETARLI EMAS: `capture` atributi
// brauzerga MASLAHAT, majburiyat emas. Kompyuterda va ko'p telefonlarda u
// oddiy fayl tanlash oynasini ochadi - ya'ni gallereyadagi eski surat,
// internetdan yuklangan rasm ham o'tib ketaveradi. 9-mezonda fotosurat
// DALIL, shuning uchun u joyda, o'sha payt olinishi kerak.
//
// `getUserMedia` kamera oqimini sahifaning O'ZIDA ochadi va kadr canvas ga
// ko'chiriladi. Bu yerdan fayl tanlab bo'lmaydi.
//
// BU KAFOLAT EMAS, va buni yashirmaymiz: kamerani ekranga yoki boshqa
// suratga qaratish mumkin. Oxirgi qaror baribir tasdiqlovchida - lekin
// "gallereyadan eski surat" degan eng oson yo'l yopiladi.
//
// BRAUZER QO'LLAMASA (eski brauzer, xavfsiz bo'lmagan ulanish) - fayl
// tanlashga qaytiladi va qayd `upload` deb BELGILANADI, tasdiqlovchi buni
// ko'radi. RUXSAT BERILMAGAN holat boshqa: unda fayl tanlash ochilmaydi,
// chunki bu foydalanuvchining tanlovi, brauzerning cheklovi emas.

// Kadr o'lchami. Telefon kamerasi 4000px beradi, bu esa bir necha megabayt
// - mobil internetda uchta shunday surat yuklanmaydi. Uzun tomoni shu
// qiymatga keltiriladi; dalil uchun bu yetarli.
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

const frameToFile = (video, index) => new Promise((resolve, reject) => {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) { reject(new Error('Kamera kadri hali tayyor emas')); return; }

    const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
        (blob) => {
            if (!blob) { reject(new Error('Kadr saqlanmadi')); return; }
            resolve(new File([blob], `jonli-${Date.now()}-${index}.jpg`, { type: 'image/jpeg' }));
        },
        'image/jpeg', JPEG_QUALITY
    );
});

// `hint` - kadr ustida turadigan eslatma. Suratga olish PAYTIDA ko'rinishi
// kerak: formaning boshidagi matnni talaba kamerani ko'targanda o'qimaydi.
const LiveCameraCapture = ({ count = 3, photos = [], onChange, hint = '' }) => {
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const fileRef = useRef(null);
    // idle | starting | ready | denied | unsupported | error
    const [state, setState] = useState('idle');
    const [errorText, setErrorText] = useState('');
    const [attempt, setAttempt] = useState(0);
    const [busy, setBusy] = useState(false);
    // Fayl tanlash yo'li BIR MARTA ishlatilsa ham qayd "jonli emas" deb
    // belgilanadi - dalilning kuchi eng zaif bo'lagi bo'yicha o'lchanadi.
    const [usedUpload, setUsedUpload] = useState(false);
    // OLD/ORQA KAMERA. Kadrda joy ham, talabaning o'zi ham bo'lishi kerak -
    // buni orqa kamera bilan yolg'iz qilib bo'lmaydi. Shuning uchun
    // almashtirish tugmasi SHART, bezak emas.
    const [facing, setFacing] = useState('environment');

    const done = photos.length >= count;

    const stop = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
    }, []);

    useEffect(() => {
        // Kerakli sondagi surat olingach kamerani o'chiramiz - telefonda
        // kamera chirog'i yonib turishi foydalanuvchini bezovta qiladi.
        if (done) { stop(); setState('idle'); return undefined; }

        if (!navigator.mediaDevices?.getUserMedia) {
            setState('unsupported');
            return undefined;
        }

        let alive = true;
        setState('starting');
        navigator.mediaDevices
            .getUserMedia({ video: { facingMode: { ideal: facing } }, audio: false })
            .then(stream => {
                if (!alive) { stream.getTracks().forEach(t => t.stop()); return; }
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    // Ba'zi brauzerlarda `autoPlay` yetarli emas.
                    videoRef.current.play?.().catch(() => {});
                }
                setState('ready');
            })
            .catch(err => {
                if (!alive) return;
                const name = err?.name || '';
                if (name === 'NotAllowedError' || name === 'SecurityError') {
                    setState('denied');
                } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
                    setState('unsupported');
                } else {
                    setErrorText(err?.message || 'Kamera ochilmadi');
                    setState('error');
                }
            });

        return () => { alive = false; stop(); };
    }, [done, attempt, facing, stop]);

    // Komponent yo'qolganda kamera albatta o'chsin.
    useEffect(() => stop, [stop]);

    const shoot = async () => {
        if (!videoRef.current || busy) return;
        setBusy(true);
        try {
            const file = await frameToFile(videoRef.current, photos.length + 1);
            onChange?.([...photos, file], usedUpload ? 'upload' : 'live');
        } catch (e) {
            setErrorText(e?.message || 'Kadr olinmadi');
            setState('error');
        } finally {
            setBusy(false);
        }
    };

    const removeAt = (i) => onChange?.(
        photos.filter((_, k) => k !== i),
        usedUpload ? 'upload' : 'live'
    );

    return (
        <div className="space-y-2">
            {!done && state === 'ready' && (
                <div className="relative rounded-xl overflow-hidden border border-gray-200 bg-black">
                    <video
                        ref={videoRef} autoPlay playsInline muted
                        className="w-full h-56 object-cover"
                    />
                    {hint && (
                        <p className="absolute top-0 inset-x-0 px-3 py-2 bg-black/55 text-white text-[11px] font-semibold leading-snug text-center">
                            {hint}
                        </p>
                    )}
                    <button
                        type="button" onClick={shoot} disabled={busy}
                        className="absolute bottom-3 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-xl bg-white/95 text-sm font-bold text-gray-800 shadow-lg disabled:opacity-60"
                    >
                        {busy ? 'Olinmoqda...' : `Suratga olish (${photos.length + 1}/${count})`}
                    </button>
                    <button
                        type="button"
                        onClick={() => setFacing(f => (f === 'environment' ? 'user' : 'environment'))}
                        className="absolute bottom-3 right-3 w-10 h-10 flex items-center justify-center rounded-xl bg-white/95 text-gray-800 shadow-lg"
                        title={facing === 'environment' ? 'Old kameraga o‘tish' : 'Orqa kameraga o‘tish'}
                        aria-label="Kamerani almashtirish"
                    >
                        <SwitchCamera size={17} />
                    </button>
                </div>
            )}

            {!done && state === 'starting' && (
                <div className="h-56 flex flex-col items-center justify-center gap-2 border border-gray-200 rounded-xl text-gray-400">
                    <Loader2 size={20} className="animate-spin" />
                    <span className="text-xs">Kamera ochilmoqda...</span>
                </div>
            )}

            {/* RUXSAT BERILMAGAN - fayl tanlash ATAYLAB taklif qilinmaydi.
                Bu foydalanuvchining tanlovi, brauzerning cheklovi emas. */}
            {!done && state === 'denied' && (
                <div className="p-4 border border-amber-200 bg-amber-50 rounded-xl space-y-2">
                    <p className="text-xs font-semibold text-amber-900 flex items-start gap-1.5">
                        <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                        Kameraga ruxsat berilmagan.
                    </p>
                    <p className="text-[11px] text-amber-800 leading-relaxed">
                        Tashrif fotosurati joyda, o&rsquo;sha payt olinishi kerak &mdash;
                        shuning uchun gallereyadan surat tanlab bo&rsquo;lmaydi. Brauzer
                        manzil qatoridagi qulf belgisidan kameraga ruxsat bering va
                        qaytadan urinib ko&rsquo;ring.
                    </p>
                    <button
                        type="button" onClick={() => setAttempt(a => a + 1)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-[11px] font-bold text-amber-900"
                    >
                        <RefreshCw size={12} /> Qaytadan urinish
                    </button>
                </div>
            )}

            {!done && state === 'error' && (
                <div className="p-4 border border-rose-200 bg-rose-50 rounded-xl space-y-2">
                    <p className="text-xs font-semibold text-rose-900">{errorText}</p>
                    <button
                        type="button" onClick={() => setAttempt(a => a + 1)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-rose-300 text-[11px] font-bold text-rose-900"
                    >
                        <RefreshCw size={12} /> Qaytadan urinish
                    </button>
                </div>
            )}

            {/* BRAUZER QO'LLAMAYDI - bu foydalanuvchining aybi emas, shuning
                uchun yo'l ochiq qoldiriladi. Qayd `upload` deb belgilanadi
                va tasdiqlovchi buni ko'radi. */}
            {!done && state === 'unsupported' && (
                <label className="border-2 border-dashed border-gray-300 rounded-xl p-5 text-center cursor-pointer block hover:border-teal-500">
                    <Camera className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-xs text-gray-600">
                        Bu qurilmada kamera ochilmadi &mdash; fayl tanlang
                    </p>
                    <p className="text-[11px] text-gray-400 mt-1">
                        Bunday qayd &laquo;jonli emas&raquo; deb belgilanadi.
                    </p>
                    <input
                        ref={fileRef} type="file" accept="image/*" capture="environment"
                        multiple className="hidden"
                        onChange={e => {
                            const picked = Array.from(e.target.files || []);
                            if (picked.length) {
                                setUsedUpload(true);
                                onChange?.([...photos, ...picked].slice(0, count), 'upload');
                            }
                            if (fileRef.current) fileRef.current.value = '';
                        }}
                    />
                </label>
            )}

            {/* Olingan suratlar */}
            {photos.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                    {photos.map((f, i) => (
                        <div key={`${f.name}-${i}`} className="relative">
                            <img
                                src={URL.createObjectURL(f)} alt=""
                                onLoad={e => URL.revokeObjectURL(e.currentTarget.src)}
                                className="w-full h-20 object-cover rounded-lg border border-gray-200"
                            />
                            <button
                                type="button" onClick={() => removeAt(i)}
                                className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center rounded-md bg-white/90 text-gray-700"
                                aria-label={`${i + 1}-suratni o'chirish`}
                            >
                                <X size={11} />
                            </button>
                        </div>
                    ))}
                    {Array.from({ length: Math.max(0, count - photos.length) }).map((_, i) => (
                        <div
                            key={`bosh-${i}`}
                            className="h-20 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center text-[11px] text-gray-300"
                        >
                            {photos.length + i + 1}
                        </div>
                    ))}
                </div>
            )}

            <p className="text-[11px] text-gray-400">
                {done
                    ? `${count} ta surat olindi.`
                    : `Joyda turib ${count} ta surat oling — ${photos.length}/${count}.`}
            </p>
        </div>
    );
};

export default LiveCameraCapture;
