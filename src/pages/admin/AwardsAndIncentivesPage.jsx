import React from 'react';
import { ClipboardList, Trophy } from 'lucide-react';
import { useTabParam } from '../../hooks/useTabParam';
import IncentiveAwardsPage from './IncentiveAwardsPage';
import AwardRegistryPage from './AwardRegistryPage';

// "Rag'bat va mukofot" va "Taqdirlash reestri" BITTA bo'limga birlashtirildi.
//
// Ular bir jarayonning ikki yarmi edi, lekin menyuda ikki alohida element bo'lib turardi:
// koordinator g'olibni rag'batlantirishga taklif qiladi -> admin tasdiqlaydi -> natija
// reestrga tushadi. Reestrdagi "Rag'bat puli" va "Mukofotlar" tablari aynan birinchi
// bo'limda tasdiqlangan yozuvlarni ko'rsatadi, ya'ni ikkalasi bir zanjir.
//
// Ikki guruhga bo'lish "Ijtimoiy faollik va reyting" bo'limidagi bilan bir xil mantiqda:
//   Ish jarayoni — foydalanuvchi bu yerda ISH QILADI (taklif kiritadi, tasdiqlaydi)
//   Reestr       — bu yerda NATIJAGA QARAYDI (berilgan hujjatlar, tahlil)
// Bir xil naqsh ikki bo'limda takrorlangani ataylab: foydalanuvchi bitta joyda o'rgangan
// harakatni ikkinchisida qayta o'rganmasligi kerak.
const SECTIONS = [
    {
        id: 'jarayon', label: 'Ish jarayoni', icon: ClipboardList,
        hint: "G'oliblarni taklif qilish, jadval tuzish va tasdiqlash"
    },
    {
        id: 'reestr', label: 'Reestr', icon: Trophy,
        hint: 'Berilgan diplom, sertifikat, stipendiya, rag\'bat puli va mukofotlar'
    }
];
const SECTION_IDS = SECTIONS.map(s => s.id);

const AwardsAndIncentivesPage = () => {
    const [section, setSection] = useTabParam(SECTION_IDS, 'reestr', 'bolim');

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">
                    Taqdirlash va rag'bat
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                    Musobaqada ishtirok → bayonnoma → diplom yoki sertifikat → rag'bat puli va mukofot
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

            {section === 'jarayon' && <IncentiveAwardsPage embedded />}
            {section === 'reestr' && <AwardRegistryPage embedded />}
        </div>
    );
};

export default AwardsAndIncentivesPage;
