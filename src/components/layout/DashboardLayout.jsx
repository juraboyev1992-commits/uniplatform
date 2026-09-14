import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../services/db';
import { queueKeysForLocation } from '../../utils/workQueue';
import Header from './Header';
import Sidebar from './Sidebar';
import UnfinishedTestBanner from '../student/UnfinishedTestBanner';

// MA'LUMOT TO'LIQ YUKLANMAGANI HAQIDA OGOHLANTIRISH.
//
// Sinxronlash yiqilsa foydalanuvchi baribir tizimga kiradi (AuthContext),
// lekin ekrandagi ma'lumot eski bo'lishi mumkin. Buni JIMGINA qoldirish
// yolg'on bo'lardi: koordinator eski ro'yxatga qarab qaror qabul qilardi.
// Shuning uchun har sahifaning tepasida aniq yozuv va qayta urinish tugmasi.
const SyncWarning = () => {
    const { syncError, retrySync } = useAuth();
    const [busy, setBusy] = useState(false);
    if (!syncError) return null;

    const retry = async () => {
        setBusy(true);
        try { await retrySync(); } finally { setBusy(false); }
    };

    return (
        <div className="bg-amber-50 border-b border-amber-200">
            <div className="container-custom py-2.5 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-amber-900">
                    <b>Ma'lumotlar to'liq yuklanmadi.</b>{' '}
                    Internet aloqasini tekshiring — ekranda eski ma'lumot ko'rinishi mumkin.
                </p>
                <button
                    type="button"
                    onClick={retry}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-xs font-bold"
                >
                    {busy ? 'Yuklanmoqda…' : 'Qayta urinish'}
                </button>
            </div>
        </div>
    );
};

const DashboardLayout = ({ children }) => {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const location = useLocation();
    const { user, isClubManager } = useAuth();

    // "O'qildi" belgilash BITTA joyda, manzil bo'yicha - har bir sahifaga alohida
    // kod qo'shilmaydi. Foydalanuvchi navbatga tegishli bo'lim VA tabni ochgandagina
    // belgilanadi: shunchaki bo'limga kirish boshqa tabdagi ishni o'qilgan qilib
    // qo'ymasligi kerak.
    useEffect(() => {
        if (!user?.username) return;
        const keys = db.withCachedReads(
            () => queueKeysForLocation(db, user, location.pathname, location.search, { isClubManager })
        );
        if (keys.length > 0) db.markQueueSeen(user.username, keys);
    }, [user, isClubManager, location.pathname, location.search]);

    return (
        <div className="min-h-screen bg-gray-50">
            <Header onMenuClick={() => setSidebarOpen(!sidebarOpen)} />

            <SyncWarning />

            {/* Boshlangan testning vaqti yurib turadi - eslatma har sahifada
                ko'rinishi kerak. Faqat tugallanmagan test bo'lsa chiqadi;
                talaba bo'lmasa hech narsa ko'rsatmaydi. */}
            <UnfinishedTestBanner />

            <div className="flex">
                <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

                <main className="flex-1 overflow-x-hidden">
                    <div className="container-custom section-padding">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
};

export default DashboardLayout;
