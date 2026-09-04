import React, { useEffect, useRef, useState } from 'react';
import { Upload, X, Image as ImageIcon, Loader2 } from 'lucide-react';
import { db } from '../../services/db';

// KLUB LOGOSI VA MUQOVASINI YUKLASH.
//
// Bitta komponent ikkala tur uchun, lekin ko'rinishi HAR XIL: logo kvadrat
// va kichkina, muqova esa keng tasma. Ular karta va klub sahifasida aynan
// shu nisbatlarda ko'rinadi, shuning uchun yuklash oynasi ham xuddi shunday
// ko'rsatadi - koordinator natijani oldindan ko'rishi kerak.
//
// IKKI REJIM:
//   klub YARATILGANDA `clubId` hali yo'q - fayl yuklanmaydi, faqat
//   tanlanadi va tashqariga uzatiladi (klub yaratilgach yuklanadi).
//   MAVJUD klubda esa darhol yuklanadi.
// JOYLASHUV IKKI XIL, va bu shakldan kelib chiqadi:
//   logo kvadrat va kichkina - yoniga tugmalar sig'adi (yonma-yon);
//   muqova esa butun kenglikni egallaydi - tugmalar OSTIDA turadi.
//
// Ilgari ikkalasi ham yonma-yon edi va muqova `w-full` bo'lgani uchun
// yonidagi tugmalarni oynadan tashqariga itarib yuborardi.
const RATIO = {
    logo: {
        label: 'Logo',
        hint: 'Kvadrat rasm · kamida 200×200',
        box: 'w-24 h-24 rounded-2xl shrink-0',
        stacked: false,
    },
    banner: {
        label: 'Muqova rasmi',
        hint: 'Keng rasm · kamida 1200×400',
        box: 'w-full h-28 rounded-2xl',
        stacked: true,
    },
};

const ClubMediaUploader = ({
    kind = 'logo',
    clubId = null,
    currentUrl = null,
    onUploaded,
    onFilePicked,
    fallbackText = '',
}) => {
    const inputRef = useRef(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [preview, setPreview] = useState(null);
    const meta = RATIO[kind];

    // Tanlangan fayl uchun vaqtinchalik havola - u komponent yopilganda
    // bo'shatilishi kerak, aks holda brauzer xotirasida qolib ketadi.
    useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

    const handleFile = async (file) => {
        setError('');
        if (!file) return;
        if (!String(file.type || '').startsWith('image/')) {
            setError('Faqat rasm fayli (JPG, PNG, WEBP)');
            return;
        }
        setPreview(URL.createObjectURL(file));

        // Klub hali yaratilmagan bo'lsa - yuklanmaydi, tashqariga beriladi.
        if (!clubId) {
            onFilePicked?.(file);
            return;
        }
        setBusy(true);
        try {
            const url = await db.uploadClubMedia(clubId, kind, file);
            onUploaded?.(url);
        } catch (e) {
            setError(e?.message || 'Yuklashda xatolik');
            setPreview(null);
        } finally {
            setBusy(false);
        }
    };

    const handleRemove = async () => {
        setError('');
        setPreview(null);
        if (!clubId) { onFilePicked?.(null); return; }
        setBusy(true);
        try {
            await db.removeClubMedia(clubId, kind);
            onUploaded?.(null);
        } catch (e) {
            setError(e?.message || "O'chirishda xatolik");
        } finally {
            setBusy(false);
        }
    };

    const shown = preview || currentUrl;

    return (
        <div className="w-full min-w-0">
            <label className="block text-xs font-black text-gray-500 uppercase mb-1.5">{meta.label}</label>

            <div className={meta.stacked ? 'space-y-2' : 'flex items-start gap-3'}>
                <div
                    className={`${meta.box} relative overflow-hidden border-2 border-dashed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center justify-center`}
                >
                    {shown ? (
                        <img src={shown} alt={meta.label} className="w-full h-full object-cover" />
                    ) : (
                        <span className="flex flex-col items-center gap-1 text-gray-300">
                            {fallbackText
                                ? <span className="text-2xl font-black text-indigo-300">{fallbackText}</span>
                                : <ImageIcon size={20} />}
                        </span>
                    )}
                    {busy && (
                        <span className="absolute inset-0 bg-white/70 flex items-center justify-center">
                            <Loader2 size={18} className="animate-spin text-indigo-600" />
                        </span>
                    )}
                </div>

                <div className={meta.stacked ? 'min-w-0' : 'flex-1 min-w-0'}>
                    <input
                        ref={inputRef} type="file" className="hidden"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={e => handleFile(e.target.files?.[0])}
                    />
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button" disabled={busy}
                            onClick={() => inputRef.current?.click()}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                        >
                            <Upload size={13} /> {shown ? 'Almashtirish' : 'Yuklash'}
                        </button>
                        {shown && (
                            <button
                                type="button" disabled={busy}
                                onClick={handleRemove}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-gray-400 hover:text-red-600 disabled:opacity-50"
                            >
                                <X size={13} /> Olib tashlash
                            </button>
                        )}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1.5 break-words">{meta.hint} · 3 MB gacha</p>
                    {error && <p className="text-[11px] text-red-600 mt-1 break-words">{error}</p>}
                </div>
            </div>
        </div>
    );
};

export default ClubMediaUploader;
