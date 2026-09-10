import React from 'react';
import { ClipboardList, BarChart3 } from 'lucide-react';
import { useTabParam } from '../../hooks/useTabParam';
import SocialActivityManagement from '../../components/admin/SocialActivityManagement';
import CriterionConfirmationPanel from '../../components/admin/CriterionConfirmationPanel';
import RankingsPage from '../management/RankingsPage';

// "Ijtimoiy faollik" va "Reytinglar" bo'limlari BITTA bo'limga birlashtirildi.
//
// Nega: ikkalasi bir xil narsani — talabaning faolligi va uning o'lchovini — ko'rsatardi,
// lekin admin menyusida ikki alohida element edi. Eng yomoni, ikkalasida ham talabalar
// ro'yxati bor edi (StudentIndexRoster va StudentsManagement), har biri o'z ballini
// ko'rsatardi: admin bitta talaba haqida ikki xil raqamni ikki xil sahifada ko'rardi.
//
// Nega ikki daraja: qo'shilganda 11 ta tab chiqadi, ularni bitta qatorga tizib qo'yish
// sahifani o'qib bo'lmas holga keltiradi. Shuning uchun yuqorida ikkita GURUH turadi:
//   Ish jarayoni — kundalik ish: arizalar, tasdiqlash, monitoring, audit
//   Tahlil       — natijalarni taqqoslash: fakultet, kurs, klub, kategoriya kesimida
// Bu bo'linish tasodifiy emas: birinchisida foydalanuvchi ISH QILADI, ikkinchisida
// NATIJAGA QARAYDI. Ikkalasi bir xil qatorda turganda qaysi biri nima uchun ekani
// yo'qolib ketardi.
//
// Rahbariyat paneli TEGILMAYDI: u yerda "Ijtimoiy faollik" bo'limi umuman yo'q, faqat
// "Reytinglar" bor va u hozirgidek mustaqil sahifa bo'lib qolaveradi. Shu sababli
// RankingsPage bu yerda `embedded` bilan chaqiriladi — o'z sarlavhasini yashiradi,
// qolgan hamma narsasi bir xil ishlaydi.
const SECTIONS = [
    { id: 'ish', label: 'Ish jarayoni', icon: ClipboardList, hint: 'Arizalar, tasdiqlash, monitoring, audit' },
    { id: 'tahlil', label: 'Tahlil', icon: BarChart3, hint: 'Fakultet, kurs, klub va kategoriya kesimida reyting' }
];
const SECTION_IDS = SECTIONS.map(s => s.id);

const ActivityAndRankingsPage = () => {
    // Guruh ham manzilda turadi (`?bolim=tahlil`) va tarixga yozuv qo'shadi — ichki tablar
    // bilan bir xil qoida. Ichki tablar boshqa kalitlardan foydalanadi (`jarayon`, `tab`),
    // shuning uchun ikki daraja bir-birini bosib ketmaydi.
    const [section, setSection] = useTabParam(SECTION_IDS, 'ish', 'bolim');

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">
                    Ijtimoiy faollik va reyting
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                    Talabaning faolligini qayd etish va uni fakultet, kurs, klub kesimida taqqoslash — bitta bo'limda
                </p>

                <div className="flex flex-col sm:flex-row gap-2 mt-5">
                    {SECTIONS.map(s => {
                        const Icon = s.icon;
                        const active = section === s.id;
                        return (
                            <button
                                key={s.id}
                                type="button"
                                onClick={() => setSection(s.id)}
                                aria-current={active ? 'page' : undefined}
                                className={`flex-1 text-left px-4 py-3 rounded-xl border transition-all ${
                                    active
                                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                                        : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-300'
                                }`}
                            >
                                <span className="flex items-center gap-2 font-extrabold text-sm">
                                    <Icon size={16} /> {s.label}
                                </span>
                                <span className={`block text-[11px] mt-0.5 ${active ? 'text-indigo-100' : 'text-gray-400'}`}>
                                    {s.hint}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {section === 'ish' && (
                <div className="space-y-6">
                    <SocialActivityManagement embedded />
                    {/* Talaba yuborgan DALIL (ma'lumotnoma) shu yerda tasdiqlanadi.
                        Ilgari bu panel faqat Sozlamalar ichida va tyutor ish stolida
                        turardi - ya'ni talaba dalil yuborsa, administrator uni o'zi
                        kutgan joyda (shu bo'limda) umuman ko'rmasdi. Yuqoridagi
                        "Ish jarayoni" izohida "tasdiqlash" allaqachon yozilgan edi,
                        paneli esa yo'q edi. */}
                    <CriterionConfirmationPanel criterionKey="CLUBS" />
                </div>
            )}
            {section === 'tahlil' && <RankingsPage embedded />}
        </div>
    );
};

export default ActivityAndRankingsPage;
