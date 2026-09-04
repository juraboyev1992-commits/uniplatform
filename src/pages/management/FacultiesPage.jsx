import React, { useMemo, useState } from 'react';
import {
    GraduationCap, Users, Activity, FileCheck, Info, Layers, ChevronRight,
} from 'lucide-react';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import ProgressBar from '../../components/common/ProgressBar';
import { db } from '../../services/db';
import { getFacultyStats } from '../../utils/platformStats';

// FAKULTETLAR.
//
// Bu sahifa ilgari har fakultetga TASODIFIY ball berardi:
//   totalSocialScore += Math.floor(40 + Math.random() * 60)
//   pointsGrowth: Math.floor(2 + Math.random() * 8)
//   categoryAverages: ... Math.floor(35 + Math.random() * 65)
// Ustiga dekanning ismi va elektron pochtasi ham fakultet nomidan
// YASALARDI ("Prof. Axborotov T."), ya'ni sahifadagi deyarli hamma narsa
// o'ylab topilgan edi.
//
// Endi faqat haqiqiy yozuvlar: talabalar soni, guruhlar, davomatdan
// hisoblangan ishtirok va berilgan hujjatlar.
//
// OLIB TASHLANGANLAR (manbasi yo'q):
//   - Fakultet dekani va aloqasi: platformada bunday ma'lumot yuritilmaydi
//   - "Ball o'sishi": tarixiy o'lchov saqlanmaydi
//   - Mezonlar bo'yicha radar: fakultet kesimida mezon bali hisoblanmaydi
const FacultiesPage = () => {
    const faculties = useMemo(() => getFacultyStats(db), []);
    const [selectedName, setSelectedName] = useState(null);

    const active = faculties.find(f => f.faculty === selectedName) || faculties[0] || null;

    const tone = (percent) => {
        if (percent >= 70) return 'excellent';
        if (percent >= 45) return 'good';
        if (percent >= 20) return 'average';
        return 'poor';
    };

    if (faculties.length === 0) {
        return (
            <Card>
                <p className="p-12 text-center text-sm text-gray-400">
                    Fakultet ma'lumoti topilmadi.
                </p>
            </Card>
        );
    }

    return (
        <div className="space-y-6 pb-10">
            <div>
                <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Fakultetlar</h1>
                <p className="text-gray-500 mt-1">
                    Talabalar va ularning tadbirlardagi ishtiroki kesimida
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Ro'yxat */}
                <div className="space-y-3">
                    {faculties.map(f => {
                        const isActive = active?.faculty === f.faculty;
                        return (
                            <button
                                key={f.faculty}
                                type="button"
                                onClick={() => setSelectedName(f.faculty)}
                                className={`w-full text-left p-4 rounded-2xl border transition-colors ${
                                    isActive
                                        ? 'border-indigo-300 bg-indigo-50'
                                        : 'border-gray-100 bg-white hover:border-gray-200'
                                }`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="font-bold text-gray-900 text-sm truncate">{f.faculty}</p>
                                        <p className="text-[11px] text-gray-500 mt-0.5">
                                            {f.students} talaba · {f.groups} guruh
                                        </p>
                                    </div>
                                    <ChevronRight size={15} className={isActive ? 'text-indigo-500' : 'text-gray-300'} />
                                </div>
                                <div className="mt-2.5">
                                    <div className="flex items-center justify-between text-[11px] mb-1">
                                        <span className="text-gray-500">Faol talabalar</span>
                                        <span className="font-bold text-gray-800 tabular-nums">{f.activePercent}%</span>
                                    </div>
                                    <ProgressBar value={f.activePercent} max={100} color={tone(f.activePercent)} size="sm" showPercentage={false} />
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Tafsilot */}
                {active && (
                    <div className="lg:col-span-2 space-y-4">
                        <Card className="p-6 border-none">
                            <div className="flex items-start gap-4">
                                <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center shrink-0">
                                    <GraduationCap size={26} className="text-indigo-600" />
                                </div>
                                <div className="min-w-0">
                                    <h2 className="text-xl font-extrabold text-gray-900">{active.faculty}</h2>
                                    <p className="text-xs text-gray-500 mt-1">
                                        {active.students} talaba · {active.groups} guruh
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
                                {[
                                    { label: 'Talabalar', value: active.students, icon: Users, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                                    { label: 'Guruhlar', value: active.groups, icon: Layers, color: 'text-slate-600', bg: 'bg-slate-50' },
                                    { label: 'Faol talabalar', value: `${active.activeStudents} (${active.activePercent}%)`, icon: Activity, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                                    { label: 'Berilgan hujjat', value: active.documents, icon: FileCheck, color: 'text-amber-600', bg: 'bg-amber-50' },
                                ].map((s, i) => (
                                    <div key={i} className="p-3 rounded-xl border border-gray-100">
                                        <div className={`p-2 rounded-lg inline-flex ${s.bg} ${s.color}`}>
                                            <s.icon size={16} />
                                        </div>
                                        <p className="text-lg font-extrabold text-gray-900 mt-2 tabular-nums">{s.value}</p>
                                        <p className="text-[10px] text-gray-500 uppercase tracking-wide">{s.label}</p>
                                    </div>
                                ))}
                            </div>
                        </Card>

                        <Card className="p-6 border-none">
                            <h3 className="font-bold text-gray-900 mb-1">Ishtirok</h3>
                            <p className="text-xs text-gray-500 mb-4">
                                Tadbir va musobaqalardagi davomat yozuvlaridan
                            </p>
                            <div className="space-y-3">
                                <div>
                                    <div className="flex items-center justify-between text-xs mb-1">
                                        <span className="text-gray-600">Kamida bir marta qatnashgan talabalar</span>
                                        <span className="font-bold text-gray-900 tabular-nums">
                                            {active.activeStudents} / {active.students}
                                        </span>
                                    </div>
                                    <ProgressBar value={active.activePercent} max={100} color={tone(active.activePercent)} size="md" />
                                </div>
                                <div className="flex items-center justify-between text-xs pt-2 border-t border-gray-50">
                                    <span className="text-gray-600">Jami qatnashuv yozuvlari</span>
                                    <span className="font-bold text-gray-900 tabular-nums">{active.participations}</span>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-gray-600">Talabaga o'rtacha</span>
                                    <span className="font-bold text-gray-900 tabular-nums">
                                        {active.students > 0 ? (active.participations / active.students).toFixed(1) : '0'}
                                    </span>
                                </div>
                            </div>
                        </Card>
                    </div>
                )}
            </div>

            <Card className="p-5 border-none bg-slate-50">
                <p className="text-[11px] text-gray-600 flex items-start gap-1.5">
                    <Info size={12} className="shrink-0 mt-px" />
                    <span>
                        Ko'rsatkichlar davomat va hujjat yozuvlaridan hisoblanadi. <b>Dekan
                        ma'lumotlari</b>, <b>ball o'sishi</b> va <b>mezonlar bo'yicha taqqoslash</b> olib
                        tashlandi — birinchisi platformada yuritilmaydi, qolgan ikkitasi esa
                        tasodifiy son bilan to'ldirilardi.
                    </span>
                </p>
            </Card>
        </div>
    );
};

export default FacultiesPage;
