import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Timer, ChevronRight } from 'lucide-react';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';

// Tugallanmagan testning BUTUN KABINET bo'ylab ko'rinadigan eslatmasi.
//
// Nega kerak: brauzer yopilib ketishi, akkauntdan chiqib qolish, boshqa
// sahifaga o'tib ketish - bularning hammasida testning vaqti YURIB TURAVERADI.
// Agar eslatma faqat kitobxonlik sahifasida bo'lsa, talaba bosh sahifaga
// tushib hech narsa ko'rmaydi va vaqti behuda o'tib ketadi. U esa yagona
// urinish edi.
//
// Shu sababli bu satr sarlavha ostida, har sahifada turadi.
const UnfinishedTestBanner = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [state, setState] = useState(null);

    const username = user?.username;
    const isStudent = user?.role === 'TALABA' || user?.role === 'STUDENT';

    // Har soniyada qayta hisoblanadi - manba localStorage, ya'ni brauzer
    // yopilib ochilsa ham holat saqlanib qoladi.
    useEffect(() => {
        if (!username || !isStudent) return;
        const tick = () => {
            try { setState(db.getUnfinishedTest(username)); }
            catch { setState(null); }
        };
        tick();
        const timer = setInterval(tick, 1000);
        return () => clearInterval(timer);
    }, [username, isStudent]);

    if (!state) return null;

    // Test sahifasining o'zida takrorlamaymiz - u yerda o'z kartasi bor.
    //
    // Kitobxonlik testlari "Kutubxona va testlar" bo'limining tabiga
    // ko'chdi, shuning uchun tekshiruv ham manzil bilan birga tabga
    // qaraydi. Faqat yo'lga qarash bannerni kitoblar tabida ham
    // yashirib qo'yardi.
    const onReadingTestsTab = location.pathname.startsWith('/student/library')
        && new URLSearchParams(location.search).get('tab') === 'kitobxonlik';
    if (onReadingTestsTab) return null;

    const left = state.secondsLeft;
    const expired = left === 0;
    const clock = left == null ? null
        : `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;

    const title = state.test.readingBook?.title || state.test.title;

    return (
        <div
            className={`sticky top-0 z-30 border-b ${
                expired
                    ? 'bg-rose-50 border-rose-200'
                    : left != null && left <= 60
                        ? 'bg-rose-50 border-rose-200'
                        : 'bg-amber-50 border-amber-200'
            }`}
        >
            <div className="container-custom py-2.5 flex items-center justify-between gap-3 flex-wrap">
                <p className={`flex items-center gap-2 text-sm font-semibold min-w-0 ${
                    expired || (left != null && left <= 60) ? 'text-rose-800' : 'text-amber-900'
                }`}>
                    <Timer size={16} className="shrink-0" />
                    <span className="min-w-0 truncate">
                        Tugallanmagan test: <span className="font-bold">{title}</span>
                        {clock && (expired
                            ? <> — <span className="font-bold">vaqt tugadi</span></>
                            : <> — <span className="font-bold tabular-nums">{clock}</span> qoldi</>)}
                    </span>
                </p>

                <button
                    type="button"
                    // `?resume=` SAQLANISHI shart: eski manzilga yuborilsa
                    // u qayta yo'naltirishda yo'qolardi va test o'z-o'zidan
                    // ochilmasdi.
                    onClick={() => navigate(`/student/library?tab=kitobxonlik&resume=${state.testId}`)}
                    className={`shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white ${
                        expired || (left != null && left <= 60)
                            ? 'bg-rose-600 hover:bg-rose-700'
                            : 'bg-amber-600 hover:bg-amber-700'
                    }`}
                >
                    {expired ? 'Ochish va yakunlash' : 'Davom ettirish'}
                    <ChevronRight size={13} />
                </button>
            </div>
        </div>
    );
};

export default UnfinishedTestBanner;
