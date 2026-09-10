import React, { useMemo } from 'react';
import { useTabParam } from '../../hooks/useTabParam';
import { Trophy, Target, FileText, Rocket } from 'lucide-react';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import OpportunitiesPage from './OpportunitiesPage';
import MyDevelopmentPage from './MyDevelopmentPage';
import ScholarshipsModule from '../../components/student/ScholarshipsModule';
import { getApplicationStatusMeta } from '../../config/scholarships';

// "Yutuq va imkoniyatlar" — talaba kabinetidagi jamlovchi bo'lim.
//
// Avval to'rtta alohida menyu bandi bor edi: Imkoniyatlar, Stipendiyalar,
// Yutuqlar va imtiyozlar, Mening rivojlanishim. Ular bir-birining davomi
// bo'lgani uchun bitta bo'limga jamlandi:
//
//   Imkoniyatlar  → menga nima mos keladi
//   Arizalarim    → nimaga intilyapman
//   Yutuqlarim    → nima qo'lga kiritdim
//   Rivojlanishim → qayerga boryapman
//
// Har tab avvalgi sahifaning O'ZINI ko'rsatadi (`embedded` rejimda) — kod
// nusxalanmaydi, faqat sarlavhalari bitta umumiy sarlavhaga birlashtirildi.

const TABS = [
    // Nom ATAYLAB sanab o'tmaydi. Ichida besh xil narsa bor - stipendiya, grant,
    // imtiyoz, tanlov, olimpiada - va hammasini nomga sig'dirib bo'lmaydi.
    // Nom funksiyani aytadi: "menga mos keladiganlar". Har turning o'z nomi
    // ro'yxatdagi qatorlarda yorliq bilan ko'rinadi, shuning uchun "stipendiya"
    // va "grant" so'zlari yo'qolmaydi.
    // `caption` - tab tagidagi kichik tag yozuv, tarkibida NIMA borligini
    // ochadi. Faqat "Imkoniyatlarim" da bor - nomi o'zi umumlashtirilgan
    // ("menga mos keladiganlar"), qolganlari (Arizalarim, Yutuqlarim,
    // Rivojlanishim) o'z nomidan tushunarli.
    { id: 'opportunities', label: 'Imkoniyatlarim', icon: Target, caption: 'Stipendiya, grant, tanlov, mukofot' },
    { id: 'applications', label: 'Arizalarim', icon: FileText },
    { id: 'development', label: 'Rivojlanishim', icon: Rocket },
];

const TAB_IDS = TABS.map(t => t.id);

const AchievementsHubPage = () => {
    const { user } = useAuth();

    // Tab manzilda saqlanadi va har almashtirish tarixga yoziladi — orqaga
    // bosilganda oldingi tabga qaytadi, bo'limdan chiqib ketmaydi.
    const [tab, selectTab] = useTabParam(TAB_IDS, 'opportunities');

    // Tab ustidagi kichik belgilar — talaba qaysi tabda ish borligini
    // ochmasdan biladi.
    const badges = useMemo(() => {
        if (!user?.username) return {};
        const apps = db.getStudentScholarshipApplications?.(user.username) || [];
        const active = apps.filter(a => !getApplicationStatusMeta(a.status).terminal).length;
        const returned = apps.filter(a => a.status === 'returned').length;
        const docs = (db.getStudentDocuments?.(user.username) || [])
            .filter(d => d.status === 'issued').length;
        return { applications: active, returned, achievements: docs };
    }, [user]);

    return (
        <div className="space-y-6">
            <div className="bg-gradient-to-r from-amber-500 to-orange-600 rounded-2xl p-8 text-white shadow-xl">
                <h1 className="text-3xl font-bold mb-1 flex items-center gap-3">
                    <Trophy className="w-8 h-8" /> Yutuq va imkoniyatlar
                </h1>
                <p className="text-amber-100">
                    Sizga mos imkoniyatlar, arizalaringiz va rivojlanish rejangiz
                </p>
            </div>

            <div className="-mx-1 px-1 overflow-x-auto">
                <div className="inline-flex bg-white p-1 rounded-2xl border border-gray-100 shadow-sm">
                    {TABS.map(t => {
                        const active = tab === t.id;
                        const count = badges[t.id];
                        return (
                            <button key={t.id} type="button" onClick={() => selectTab(t.id)}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${active ? 'bg-amber-500 text-white shadow-lg shadow-amber-100' : 'text-gray-500 hover:bg-gray-50'}`}>
                                <t.icon size={15} />
                                <span className="flex flex-col items-start leading-tight">
                                    {t.label}
                                    {/* Tag yozuv - tab ICHIDA, nomning tagida. Faqat
                                        `caption` berilgan tablarda ko'rinadi. */}
                                    {t.caption && (
                                        <span className={`text-[10px] font-semibold ${active ? 'text-white/75' : 'text-gray-400'}`}>
                                            {t.caption}
                                        </span>
                                    )}
                                </span>
                                {count > 0 && (
                                    <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${active ? 'bg-white/25' : 'bg-gray-100 text-gray-500'}`}>
                                        {count}
                                    </span>
                                )}
                                {t.id === 'applications' && badges.returned > 0 && (
                                    <span className="w-2 h-2 rounded-full bg-red-500" title="Tuzatishga qaytarilgan ariza bor" />
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {tab === 'opportunities' && <OpportunitiesPage embedded />}
            {tab === 'applications' && <ScholarshipsModule embedded />}
            {tab === 'development' && <MyDevelopmentPage embedded />}
        </div>
    );
};

export default AchievementsHubPage;
