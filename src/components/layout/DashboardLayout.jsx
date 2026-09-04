import React, { useState } from 'react';
import Header from './Header';
import Sidebar from './Sidebar';
import UnfinishedTestBanner from '../student/UnfinishedTestBanner';

const DashboardLayout = ({ children }) => {
    const [sidebarOpen, setSidebarOpen] = useState(false);

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
