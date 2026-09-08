import React from 'react';
import { ClipboardCheck, Gauge } from 'lucide-react';
import { useTabParam } from '../../hooks/useTabParam';
import { useAuth } from '../../contexts/AuthContext';
import SocialActivityIndex from './SocialActivityIndex';
import StudentTasPanel from '../../components/student/StudentTasPanel';

// Talabaning ikkita ballini BIR JOYGA yig'adi.
//
// Ilgari ular ikki uzoq joyda turardi: rasmiy indeks (0-100) "Ijtimoiy faollik"
// bo'limida va bosh sahifada, TAS (0-1000) esa "Mening profilim" sahifasida —
// menyuda ko'rinmaydigan, sozlamalar orasidagi joyda. Talaba ikki xil raqamni
// ko'rar, lekin ular qanday bog'liqligini va qaysi biri nima uchun kerakligini
// bilmasdi.
//
// Endi ikkalasi yonma-yon tab bo'lib turadi. Tartib ataylab: RASMIY INDEKS
// birinchi, chunki stipendiya va rag'batlantirish qarorlari o'shanga tayanadi.
// TAS esa ikkinchi — u kengroq tahliliy ko'rsatkich (GPA, liderlik, davomat ham
// kiradi) va uning ijtimoiy o'lchovi baribir shu rasmiy indeksdan hisoblanadi,
// shuning uchun ikki raqam bir-biriga zid bo'lolmaydi.
//
// Admin paneli ham xuddi shunday tuzilgan ("Ijtimoiy faollik va reyting"), ya'ni
// talaba va mas'ul bir xil mantiq bo'yicha harakat qiladi.
const TABS = [
    { id: 'indeks', label: 'Rasmiy indeks', icon: ClipboardCheck, hint: 'Ministrlik metodikasi bo\'yicha 100 ballik baho' },
    { id: 'skoring', label: 'Umumiy skoring', icon: Gauge, hint: 'GPA, faollik, liderlik va davomat bo\'yicha 1000 ballik tahlil' }
];
const TAB_IDS = TABS.map(t => t.id);

const MyActivityAndScoringPage = () => {
    const { user } = useAuth();
    const [tab, setTab] = useTabParam(TAB_IDS, 'indeks', 'bolim');

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">
                    Ijtimoiy faollik va skoring
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                    Ballaringiz, ular qaysi yozuvdan chiqqani va nima yetishmayotgani
                </p>

                <div className="flex flex-col sm:flex-row gap-2 mt-5">
                    {TABS.map(t => {
                        const Icon = t.icon;
                        const active = tab === t.id;
                        return (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => setTab(t.id)}
                                aria-current={active ? 'page' : undefined}
                                className={`flex-1 text-left px-4 py-3 rounded-xl border transition-all ${
                                    active
                                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                                        : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-300'
                                }`}
                            >
                                <span className="flex items-center gap-2 font-extrabold text-sm">
                                    <Icon size={16} /> {t.label}
                                </span>
                                <span className={`block text-[11px] mt-0.5 ${active ? 'text-indigo-100' : 'text-gray-400'}`}>
                                    {t.hint}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {tab === 'indeks' && <SocialActivityIndex />}
            {tab === 'skoring' && (
                <StudentTasPanel studentId={user?.username} displayName={user?.name || user?.fullName} />
            )}
        </div>
    );
};

export default MyActivityAndScoringPage;
