import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../services/db';
import { queueKeysForLocation } from '../../utils/workQueue';
import Header from './Header';
import Sidebar from './Sidebar';
import UnfinishedTestBanner from '../student/UnfinishedTestBanner';

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
