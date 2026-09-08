import React from 'react';
import { Sparkles, GraduationCap } from 'lucide-react';
import { useTabParam } from '../../hooks/useTabParam';
import TalentModulePage from './TalentModulePage';
import ScholarshipManagement from '../../components/admin/ScholarshipManagement';

// "Iqtidorli talabalar" va "Stipendiyalar" BITTA bo'limga birlashtirildi.
//
// Nega: ular bir zanjirning bo'laklari edi, lekin menyuda ikki alohida element bo'lib
// turardi va zanjir o'rtada uzilardi. Aniq dalil kodning o'zida: Talent modulining
// "Nomzodlar" tabi `db.getScholarshipGrants()` ni o'qiydi va
// `db.promoteTalentTargetToCandidate()` bilan STIPENDIYA ARIZASI yaratadi. Ya'ni u
// mazmunan stipendiya jarayonining birinchi qadami bo'lgani holda Talent ichida turardi:
// mas'ul nomzodni tayyorlash uchun bir bo'limga, uning arizasini ko'rish uchun boshqasiga
// o'tishi kerak edi.
//
// Shuning uchun bu yerda tab ro'yxati QAYTA GURUHLANADI, shunchaki yonma-yon qo'yilmaydi:
//   Rivojlantirish — talabani kuzatib borish va o'stirish (yil davomida, mentor bilan)
//   Stipendiya     — nomzoddan grantgacha bo'lgan zanjir (davriy, komissiya bilan)
// "Nomzodlar" ikkinchi guruhga o'tdi va endi zanjir bitta joyda tugallanadi:
//   Nomzodlar -> Arizalar -> Bosqichlar -> Grantlar -> Arxiv
//
// Ikkala komponent o'z sarlavhasi va tab lentasini `embedded` holatida yashiradi, tabni
// esa shu sahifa boshqaradi (`tab` / `onTabChange`). Shu sababli bir guruhdan ikkinchisiga
// o'tish oddiy tab almashtirish bo'lib qoladi.
const GROUPS = [
    {
        id: 'rivojlantirish',
        label: 'Rivojlantirish',
        icon: Sparkles,
        hint: 'Talabani kuzatib borish, IDP, mentor va monitoring',
        tabs: [
            ['dashboard', 'Dashboard'],
            ['students', 'Talabalar'],
            ['idp', 'IDP va maqsadlar'],
            ['monitoring', 'Monitoring'],
            ['recognition', "Rag'batlantirish"],
            ['suggestions', 'Takliflar'],
            ['assignments', 'Biriktirishlar'],
        ],
    },
    {
        id: 'stipendiya',
        label: 'Stipendiya',
        icon: GraduationCap,
        hint: 'Nomzoddan grantgacha: ariza, baholash, qaror',
        tabs: [
            // "Nomzodlar" Talent komponentida chiziladi, lekin MAZMUNAN shu guruhda -
            // izohga qarang.
            ['targets', 'Nomzodlar'],
            ['applications', "Arizalar ro'yxati"],
            ['stages', 'Bosqichlar monitoringi'],
            ['grants', 'Grant va stipendiyalar'],
            ['archive', 'Arxiv'],
            ['settings', 'Sozlamalar'],
        ],
    },
];

// Qaysi tabni qaysi komponent chizadi. Bitta joyda turadi, chunki "Nomzodlar" ataylab
// guruhi bilan komponenti mos kelmaydigan yagona holat.
const TALENT_TABS = new Set(['dashboard', 'students', 'idp', 'monitoring', 'recognition', 'suggestions', 'assignments', 'targets']);

const ALL_TAB_IDS = GROUPS.flatMap(g => g.tabs.map(([id]) => id));

const TalentAndScholarshipPage = () => {
    const [tab, setTab] = useTabParam(ALL_TAB_IDS, 'dashboard');
    const activeGroup = GROUPS.find(g => g.tabs.some(([id]) => id === tab)) || GROUPS[0];

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">
                    Iqtidor va stipendiya
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                    Talabani aniqlashdan grant qaroriga qadar — bitta bo'limda
                </p>

                <div className="flex flex-col sm:flex-row gap-2 mt-5">
                    {GROUPS.map(g => {
                        const Icon = g.icon;
                        const active = activeGroup.id === g.id;
                        return (
                            <button
                                key={g.id}
                                type="button"
                                // Guruhga bosilganda uning BIRINCHI tabi ochiladi.
                                onClick={() => setTab(g.tabs[0][0])}
                                aria-current={active ? 'page' : undefined}
                                className={`flex-1 text-left px-4 py-3 rounded-xl border transition-all ${
                                    active
                                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                                        : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-300'
                                }`}
                            >
                                <span className="flex items-center gap-2 font-extrabold text-sm">
                                    <Icon size={16} /> {g.label}
                                </span>
                                <span className={`block text-[11px] mt-0.5 ${active ? 'text-indigo-100' : 'text-gray-400'}`}>
                                    {g.hint}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* Tanlangan guruhning tablari. Lenta o'z ichida siljiydi - sahifaning
                    o'zi hech qachon gorizontal siljimaydi. */}
                <div className="-mx-1 px-1 overflow-x-auto mt-4">
                    <div className="inline-flex bg-slate-100 p-1 rounded-xl gap-1">
                        {activeGroup.tabs.map(([id, label]) => (
                            <button
                                key={id}
                                type="button"
                                onClick={() => setTab(id)}
                                className={`px-4 py-2 rounded-lg text-xs font-extrabold transition-all whitespace-nowrap ${
                                    tab === id ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {TALENT_TABS.has(tab)
                ? <TalentModulePage embedded tab={tab} onTabChange={setTab} />
                : <ScholarshipManagement embedded tab={tab} onTabChange={setTab} />}
        </div>
    );
};

export default TalentAndScholarshipPage;
