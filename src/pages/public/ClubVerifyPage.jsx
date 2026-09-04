import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ShieldCheck, ShieldX, Loader2, AlertTriangle } from 'lucide-react';
import { db } from '../../services/db';
import { ORGANIZATION_NAME } from '../../config/documents';
import { clubTypeLabel, REGISTRATION_STATUS_LABELS } from '../../config/clubRegistration';

// GUVOHNOMADAGI QR OLIB KELADIGAN OCHIQ SAHIFA - login talab qilinmaydi
// (band 16). DocumentVerifyPage.jsx bilan bir xil naqsh: xom `clubs`
// jadvali tashqi foydalanuvchiga ochilmagan, faqat `verify_club` RPC va
// faqat xavfsiz maydonlar (supabase/club_registration.sql).
const Row = ({ label, value }) => (
    value ? (
        <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 py-2 border-b border-gray-100 last:border-0">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wide sm:w-44 shrink-0">{label}</span>
            <span className="text-sm font-semibold text-gray-800">{value}</span>
        </div>
    ) : null
);

const ClubVerifyPage = () => {
    const { registryNumber } = useParams();
    const [state, setState] = useState({ loading: true, club: null, error: '' });

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const club = await db.verifyClubByRegistryNumber(registryNumber);
                if (alive) setState({ loading: false, club, error: '' });
            } catch (err) {
                if (alive) setState({ loading: false, club: null, error: err?.message || 'Tekshirishda xatolik yuz berdi.' });
            }
        })();
        return () => { alive = false; };
    }, [registryNumber]);

    const { loading, club, error } = state;
    const isRevoked = club?.registrationStatus === 'REVOKED';

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <div className="w-full max-w-xl">
                <div className="text-center mb-5">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{ORGANIZATION_NAME}</p>
                    <h1 className="text-xl font-black text-gray-900 mt-1">Klubni tekshirish</h1>
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

                    {!loading && !error && !club && (
                        <>
                            <div className="bg-rose-600 text-white px-6 py-5 flex items-center gap-3">
                                <ShieldX size={26} />
                                <div>
                                    <p className="text-base font-black">KLUB TOPILMADI</p>
                                    <p className="text-xs text-white/80">Bu QR kod hech qanday rasmiy klubga tegishli emas.</p>
                                </div>
                            </div>
                            <div className="p-6 text-xs text-gray-500 leading-relaxed">
                                Havola noto'g'ri bo'lishi yoki klub tizimda mavjud emasligi mumkin.
                            </div>
                        </>
                    )}

                    {!loading && club && (
                        <>
                            <div className={`px-6 py-5 flex items-center gap-3 text-white ${isRevoked ? 'bg-rose-600' : 'bg-emerald-600'}`}>
                                {isRevoked ? <ShieldX size={26} /> : <ShieldCheck size={26} />}
                                <div>
                                    <p className="text-base font-black">
                                        {isRevoked ? 'RO\'YXAT BEKOR QILINGAN' : 'RASMIY RO\'YXATDAN O\'TGAN'}
                                    </p>
                                    <p className="text-xs text-white/80">
                                        {isRevoked
                                            ? "Bu klubning ro'yxat yozuvi bekor qilingan."
                                            : "Bu klub tizimda ro'yxatdan o'tgan."}
                                    </p>
                                </div>
                            </div>
                            <div className="p-6">
                                <Row label="Klub nomi" value={club.clubName} />
                                <Row label="Klub turi" value={clubTypeLabel(club.clubType)} />
                                <Row label="Yo'nalishi" value={club.direction} />
                                <Row label="Reyestr raqami" value={club.registryNumber} />
                                <Row label="Guvohnoma raqami" value={club.certificateNumber} />
                                <Row label="Holati" value={REGISTRATION_STATUS_LABELS[club.registrationStatus]} />
                                <Row
                                    label="Ro'yxatdan o'tgan sana"
                                    value={club.registeredAt ? new Date(club.registeredAt).toLocaleDateString('uz-UZ') : null}
                                />
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

export default ClubVerifyPage;
