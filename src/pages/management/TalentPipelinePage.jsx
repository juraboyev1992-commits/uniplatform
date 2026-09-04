import React, { useMemo } from 'react';
import { Sparkles, Info } from 'lucide-react';
import Card from '../../components/common/Card';
import TalentDashboardTab from '../../components/admin/TalentDashboardTab';
import { db } from '../../services/db';
import { collectDimensionValues, computeTalentScore } from '../../utils/talentScoring';

// RAHBARIYAT uchun Talent Pipeline — faqat KO'RISH.
//
// Ayni dashboard admin panelida ham bor; bu yerda o'zgartirish amallari yo'q
// (bildirishnoma yuborish tugmasi ham ko'rsatilmaydi). Ikki nusxa kod yozmaslik
// uchun bitta komponent qayta ishlatiladi.
const TalentPipelinePage = () => {
    const rows = useMemo(() => {
        const students = new Map(db.getMockStudents().map(s => [s.id, s]));
        const assignments = db.getTalentAssignments();
        return db.getTalentProfiles().map(p => {
            const values = collectDimensionValues(db, p.studentId, p);
            return {
                profile: p,
                student: students.get(p.studentId),
                values,
                scored: computeTalentScore(values),
                assignments: assignments.filter(a => a.studentId === p.studentId && a.active),
            };
        });
    }, []);

    return (
        <div className="space-y-6">
            <div className="bg-gradient-to-r from-violet-600 to-indigo-700 rounded-2xl p-8 text-white shadow-xl">
                <h1 className="text-3xl font-bold mb-1 flex items-center gap-3">
                    <Sparkles className="w-8 h-8" /> Talent Pipeline
                </h1>
                <p className="text-violet-100">
                    Universitet bo'ylab iqtidorli talabalar va nomzodlar manzarasi
                </p>
            </div>

            <TalentDashboardTab rows={rows} version={0} />
        </div>
    );
};

export default TalentPipelinePage;
