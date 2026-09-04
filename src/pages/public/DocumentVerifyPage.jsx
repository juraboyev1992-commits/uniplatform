import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ShieldCheck, ShieldX, Loader2, AlertTriangle } from 'lucide-react';
import { db } from '../../services/db';
import { ORGANIZATION_NAME } from '../../config/documents';

// QR kod olib keladigan ochiq sahifa - login TALAB QILINMAYDI.
// Ma'lumot `verify_document` Postgres funksiyasidan keladi: hujjatlar jadvalining o'zi tashqi
// foydalanuvchiga ochilmagan, faqat shu funksiya va faqat xavfsiz maydonlar.
const Row = ({ label, value }) => (
    value ? (
        <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 py-2 border-b border-gray-100 last:border-0">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wide sm:w-44 shrink-0">{label}</span>
            <span className="text-sm font-semibold text-gray-800">{value}</span>
        </div>
    ) : null
);

const DocumentVerifyPage = () => {
    const { token } = useParams();
    const [state, setState] = useState({ loading: true, doc: null, error: '' });

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const doc = await db.verifyDocumentByToken(token);
                if (alive) setState({ loading: false, doc, error: '' });
            } catch (err) {
                if (alive) setState({ loading: false, doc: null, error: err?.message || 'Tekshirishda xatolik yuz berdi.' });
            }
        })();
        return () => { alive = false; };
    }, [token]);

    const { loading, doc, error } = state;
    const isRevoked = doc?.status === 'revoked';

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <div className="w-full max-w-xl">
                <div className="text-center mb-5">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{ORGANIZATION_NAME}</p>
                    <h1 className="text-xl font-black text-gray-900 mt-1">Hujjatni tekshirish</h1>
                </div>

                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    {loading && (
                        <div className="p-12 flex flex-col items-center gap-3 text-gray-400">
                            <Loader2 size={26} className="animate-spin" />
                            <p className="text-sm font-semibold">Tekshirilmoqda...</p>
                        </div>
                    )}

                    {!loading && error && (
                        <div className="p-10 flex flex-col items-center gap-3 text-center">
                            <AlertTriangle size={30} className="text-amber-500" />
                            <p className="text-sm font-bold text-gray-800">Tekshirib bo'lmadi</p>
                            <p className="text-xs text-gray-500 max-w-sm">{error}</p>
                        </div>
                    )}

                    {!loading && !error && !doc && (
                        <>
                            <div className="bg-rose-600 text-white px-6 py-5 flex items-center gap-3">
                                <ShieldX size={26} />
                                <div>
                                    <p className="text-base font-black">HUJJAT TOPILMADI</p>
                                    <p className="text-xs text-white/80">Bu QR kod hech qanday rasmiy hujjatga tegishli emas.</p>
                                </div>
                            </div>
                            <div className="p-6 text-xs text-gray-500 leading-relaxed">
                                Havola noto'g'ri bo'lishi yoki hujjat tizimda mavjud emasligi mumkin.
                                Hujjat egasidan QR kodni qayta tekshirishni so'rang.
                            </div>
                        </>
                    )}

                    {!loading && doc && (
                        <>
                            <div className={`px-6 py-5 flex items-center gap-3 text-white ${isRevoked ? 'bg-rose-600' : 'bg-emerald-600'}`}>
                                {isRevoked ? <ShieldX size={26} /> : <ShieldCheck size={26} />}
                                <div>
                                    <p className="text-base font-black">
                                        {isRevoked ? 'HUJJAT BEKOR QILINGAN' : 'HUJJAT HAQIQIY'}
                                    </p>
                                    <p className="text-xs text-white/80">
                                        {isRevoked
                                            ? 'Bu hujjat bekor qilingan va yuridik kuchga ega emas.'
                                            : 'Hujjat tizimda ro\'yxatdan o\'tgan va tasdiqlangan.'}
                                    </p>
                                </div>
                            </div>
                            <div className="p-6">
                                <Row label="Hujjat turi" value={doc.documentTypeLabel} />
                                <Row label="Hujjat raqami" value={doc.registrationNumber} />
                                <Row label="Egasi" value={doc.recipientName} />
                                <Row label="Tadbir / musobaqa" value={doc.activityName} />
                                <Row label="Natija" value={doc.achievement} />
                                <Row
                                    label="Berilgan sana"
                                    value={doc.issuedAt ? new Date(doc.issuedAt).toLocaleDateString('uz-UZ') : null}
                                />
                                <Row label="Tashkilot" value={doc.organization} />
                            </div>
                        </>
                    )}
                </div>

                <p className="text-[11px] text-gray-400 text-center mt-4">
                    Tekshiruv natijasi so'rov yuborilgan payt holatini aks ettiradi.
                </p>
            </div>
        </div>
    );
};

export default DocumentVerifyPage;
