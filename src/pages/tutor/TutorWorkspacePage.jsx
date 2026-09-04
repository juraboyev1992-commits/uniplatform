import React, { useMemo, useState } from 'react';
import { UserCheck, Users, Info, Eye, CreditCard } from 'lucide-react';
import Modal from '../../components/common/Modal';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import MissedHoursPanel from '../../components/admin/MissedHoursPanel';
import CulturalVisitsPanel from '../../components/admin/CulturalVisitsPanel';
import CriterionConfirmationPanel from '../../components/admin/CriterionConfirmationPanel';
import TutorExcursionsPanel from '../../components/tutor/TutorExcursionsPanel';
import TutorSportNominationPanel from '../../components/tutor/TutorSportNominationPanel';
import ConductAssessmentPanel from '../../components/sport/ConductAssessmentPanel';
import StudentPassportCard from '../../components/student/StudentPassportCard';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import { useTabParam } from '../../hooks/useTabParam';
import { INDEX_TOTAL_MAX } from '../../config/socialActivityIndex';

// TYUTORNING ISH MAYDONI.
//
// Metodika bir necha mezonning mas'uli sifatida ATAYLAB tyutorni ko'rsatadi:
// dars davomati (6), madaniy tashriflar (9), asoslovchi hujjatlar (5, 8, 10, 11).
// Ilgari bu ishlarning hammasi administrator sozlamalarida turardi - ya'ni
// tyutor o'z ishini qila olmasdi.
//
// VAKOLAT ROLGA EMAS, BIRIKTIRUVGA bog'liq: tyutor faqat O'ZIGA biriktirilgan
// talabalarni ko'radi. Biriktiruv "Iqtidorli talabalar" modulidagi mavjud
// mexanizm (`talent_assignments`, role: 'tutor') - yangi jadval ochilmadi.
const TABS = [
    { id: 'talabalarim', label: 'Talabalarim' },
    { id: 'ekskursiya', label: 'Ekskursiyalar' },
    { id: 'sport', label: 'Terma jamoa' },
    { id: 'davomat', label: 'Dars soati' },
    { id: 'tashriflar', label: 'Madaniy tashriflar' },
    { id: 'hujjatlar', label: 'Hujjatlar' },
];

const TutorWorkspacePage = () => {
    const { user } = useAuth();
    const [tab, setTab] = useTabParam(TABS.map(t => t.id), 'talabalarim');
    const [openId, setOpenId] = useState(null);
    const [passportOf, setPassportOf] = useState(null);

    // O'ziga biriktirilgan talabalar.
    const myStudents = useMemo(() => {
        const assignments = db.getMyMentees(user?.username, 'tutor');
        const byId = new Map(db.getMockStudents().map(s => [s.id, s]));
        return assignments
            .map(a => byId.get(a.studentId))
            .filter(Boolean)
            .sort((a, b) => String(a.fullName).localeCompare(String(b.fullName)));
    }, [user?.username]);

    const studentIds = useMemo(() => myStudents.map(s => s.id), [myStudents]);

    // Indeks faqat ochilgan talaba uchun hisoblanadi - hammasini birdan
    // hisoblash sahifani sekinlashtiradi.
    const openIndex = useMemo(
        () => (openId ? db.getSocialActivityIndex(openId) : null),
        [openId]
    );

    return (
        <div className="space-y-6 font-sans">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <div>
                    <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
                        <UserCheck className="w-7 h-7 text-amber-600" />
                        Tyutor ish maydoni
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Ijtimoiy faollik indeksi bo'yicha sizga biriktirilgan talabalar
                    </p>
                </div>
                <div className="flex flex-wrap bg-slate-100 p-1.5 rounded-xl gap-1 self-start md:self-auto">
                    {TABS.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={`px-4 py-2 rounded-lg text-xs font-extrabold transition-all ${
                                tab === t.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Biriktiruv yo'q bo'lsa - sahifa bo'sh emas, SABABI aytiladi. */}
            {myStudents.length === 0 ? (
                <Card>
                    <div className="p-8 text-center space-y-2">
                        <Users size={28} className="mx-auto text-gray-300" />
                        <p className="text-sm font-semibold text-gray-700">
                            Sizga hali talaba biriktirilmagan
                        </p>
                        <p className="text-xs text-gray-500 max-w-md mx-auto">
                            Tyutorning vakolati rolga emas, biriktiruvga bog'liq. Administrator
                            «Iqtidorli talabalar» modulida sizni talabalarga tyutor sifatida
                            biriktirgach, ular shu yerda ko'rinadi.
                        </p>
                    </div>
                </Card>
            ) : (
                <>
                    {/* ---------- TALABALARIM ---------- */}
                    {tab === 'talabalarim' && (
                        <Card padding={false}>
                            <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                                <h3 className="font-bold text-sm text-gray-700">
                                    Menga biriktirilgan talabalar ({myStudents.length})
                                </h3>
                                <p className="text-[11px] text-gray-400 flex items-center gap-1">
                                    <Info size={11} /> Indeks talaba ochilganda hisoblanadi
                                </p>
                            </div>
                            <div className="divide-y divide-gray-50">
                                {myStudents.map(s => (
                                    <div key={s.id}>
                                        <button
                                            type="button"
                                            onClick={() => setOpenId(openId === s.id ? null : s.id)}
                                            className={`w-full flex items-center gap-3 px-5 py-3 text-left transition-colors ${
                                                openId === s.id ? 'bg-indigo-50' : 'hover:bg-gray-50/50'
                                            }`}
                                        >
                                            <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-xs shrink-0">
                                                {s.fullName?.charAt(0)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-gray-900 truncate">{s.fullName}</p>
                                                <p className="text-xs text-gray-500">
                                                    {s.faculty} · {s.course}-kurs{s.group ? ` · ${s.group}` : ''}
                                                </p>
                                            </div>
                                            <Eye size={16} className="text-indigo-400 shrink-0" />
                                        </button>

                                        {openId === s.id && openIndex && (
                                            <div className="px-5 pb-4 bg-indigo-50/40 space-y-3">
                                                <div className="flex items-baseline gap-2 mb-2">
                                                    <span className="text-2xl font-extrabold text-gray-900 tabular-nums">
                                                        {openIndex.total.toFixed(1)}
                                                    </span>
                                                    <span className="text-xs text-gray-400">/ {INDEX_TOTAL_MAX}</span>
                                                    <span className="text-[11px] text-gray-500 ml-2">
                                                        {openIndex.scoredCount} / {openIndex.totalCount} mezon hisoblangan
                                                    </span>
                                                </div>
                                                <div className="space-y-1">
                                                    {openIndex.criteria.map((c, i) => (
                                                        <div key={c.key} className="flex items-center justify-between gap-3">
                                                            <span className="text-[11px] text-gray-600 truncate">
                                                                <span className="text-gray-300 mr-1">{i + 1}.</span>
                                                                {c.name}
                                                            </span>
                                                            <span className={`text-[11px] font-bold tabular-nums shrink-0 ${
                                                                c.points != null ? 'text-gray-800' : 'text-gray-300'
                                                            }`}>
                                                                {c.points != null ? c.points : '—'} / {c.maxPoints}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                                {/* Pasport oynada ochiladi - bu ekran
                                                    ijtimoiy faollik uchun. */}
                                                <button
                                                    type="button"
                                                    onClick={() => setPassportOf(s.id)}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-[11px] font-bold text-gray-700 hover:border-indigo-300 hover:text-indigo-600"
                                                >
                                                    <CreditCard size={12} /> Talaba pasporti
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}

                    {/* ---------- EKSKURSIYALAR (9-mezonning 2-manbai) ---------- */}
                    {tab === 'ekskursiya' && <TutorExcursionsPanel students={myStudents} />}

                    {/* ---------- TERMA JAMOAGA TAVSIYA (10-mezon) ---------- */}
                    {tab === 'sport' && (
                        <div className="space-y-4">
                            <TutorSportNominationPanel students={myStudents} />
                            {/* Sog'lom turmush bandlari: zararli illatlar
                                tyutorda, ozodalik esa yotoqxonada yashamaydigan
                                talabalar uchun tyutorda. Oyna buni o'zi ajratadi. */}
                            <ConductAssessmentPanel students={myStudents} />
                        </div>
                    )}

                    {/* ---------- DARS SOATI (6-mezon) ---------- */}
                    {tab === 'davomat' && <MissedHoursPanel scopeStudents={myStudents} />}

                    {/* ---------- MADANIY TASHRIFLAR (9-mezon) ----------
                        Joylar katalogi ko'rsatilmaydi: u universitet miqyosidagi
                        ma'lumot, tyutorning ishi emas. */}
                    {tab === 'tashriflar' && (
                        <CulturalVisitsPanel scopeStudentIds={studentIds} showPlaces={false} />
                    )}

                    {/* ---------- HUJJATLAR (5, 8, 10, 11-mezonlar) ---------- */}
                    {tab === 'hujjatlar' && (
                        <CriterionConfirmationPanel criterionKey="COMPETITIONS" scopeStudentIds={studentIds} />
                    )}
                </>
            )}

            {/* TALABA PASPORTI — maxfiy maydonlarsiz, filtrlash ma'lumot qatlamida. */}
            <Modal
                isOpen={!!passportOf}
                onClose={() => setPassportOf(null)}
                title="Talaba pasporti"
                size="lg"
            >
                {passportOf && <StudentPassportCard studentId={passportOf} />}
            </Modal>
        </div>
    );
};

export default TutorWorkspacePage;
