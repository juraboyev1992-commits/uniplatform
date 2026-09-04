import React, { useMemo } from 'react';
import { GraduationCap, Banknote, CheckCircle, Clock, Users, Download } from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import { db } from '../../services/db';
import {
    GRANT_STATUS, getApplicationStatusMeta, normalizeApplicationStatus, parseAmount, formatAmount,
} from '../../config/scholarships';
import { computeGrantUsage } from '../../utils/scholarshipEligibility';

// RAHBARIYAT uchun stipendiya kesimi - faqat KO'RISH. Qaror qabul qilish, grant yaratish
// va arizani tasdiqlash admin panelida qoladi; bu yerda hech qanday yozuv amali yo'q.
const ScholarshipsOverviewPage = () => {
    const grants = useMemo(() => db.getScholarshipGrants(), []);
    const applications = useMemo(() => db.getScholarshipApplications(), []);
    const studentById = useMemo(
        () => new Map(db.getMockStudents().map(s => [s.id, s])),
        []
    );

    const rows = useMemo(() => applications.map(a => ({
        ...a,
        status: normalizeApplicationStatus(a.status),
        student: studentById.get(a.studentId) || null,
        grant: grants.find(g => g.id === a.grantId) || null,
    })), [applications, grants, studentById]);

    const totals = useMemo(() => {
        const approved = rows.filter(r => r.status === 'approved');
        const pending = rows.filter(r => !getApplicationStatusMeta(r.status).terminal);
        const amount = approved.reduce((s, r) => s + parseAmount(r.grant?.amount), 0);
        return { total: rows.length, approved: approved.length, pending: pending.length, amount };
    }, [rows]);

    // Fakultetlar kesimi - arizalar va tasdiqlanganlar soni, ajratilgan mablag'.
    const byFaculty = useMemo(() => {
        const map = new Map();
        rows.forEach(r => {
            const faculty = r.student?.faculty || "Noma'lum";
            if (!map.has(faculty)) map.set(faculty, { faculty, total: 0, approved: 0, amount: 0 });
            const entry = map.get(faculty);
            entry.total += 1;
            if (r.status === 'approved') {
                entry.approved += 1;
                entry.amount += parseAmount(r.grant?.amount);
            }
        });
        return Array.from(map.values()).sort((a, b) => b.total - a.total);
    }, [rows]);

    const grantRows = useMemo(() => grants.map(g => ({
        grant: g,
        usage: computeGrantUsage(g, rows.filter(r => r.grantId === g.id)),
    })).sort((a, b) => b.usage.totalCount - a.usage.totalCount), [grants, rows]);

    const exportCsv = () => {
        const data = [
            ['Fakultet', 'Arizalar', 'Tasdiqlangan', "Ajratilgan mablag'"],
            ...byFaculty.map(f => [f.faculty, f.total, f.approved, f.amount]),
        ];
        const csv = '﻿' + data.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `stipendiya-fakultetlar-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const stats = [
        { label: 'Jami arizalar', value: String(totals.total), icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
        { label: "Ko'rib chiqilmoqda", value: String(totals.pending), icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
        { label: 'Tasdiqlangan', value: String(totals.approved), icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        { label: "Ajratilgan mablag'", value: totals.amount > 0 ? `${(totals.amount / 1e6).toFixed(1)} mln` : '0', icon: Banknote, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    ];

    const maxFacultyTotal = Math.max(1, ...byFaculty.map(f => f.total));

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tighter italic flex items-center gap-3">
                        <GraduationCap className="w-7 h-7 text-indigo-600" /> Stipendiyalar kesimi
                    </h1>
                    <p className="text-gray-500 font-medium italic">Fakultetlar va grantlar bo'yicha umumiy manzara</p>
                </div>
                <Button variant="outline" icon={Download} onClick={exportCsv} className="font-bold">CSV yuklab olish</Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {stats.map((stat, i) => (
                    <Card key={i} className="border-none shadow-sm h-full">
                        <div className="flex items-center gap-4">
                            <div className={`p-4 rounded-2xl ${stat.bg}`}>
                                <stat.icon className={`w-6 h-6 ${stat.color}`} />
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{stat.label}</p>
                                <p className="text-2xl font-black text-gray-900">{stat.value}</p>
                            </div>
                        </div>
                    </Card>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Fakultetlar */}
                <Card title="Fakultetlar kesimi" className="p-0 overflow-hidden">
                    <div className="p-5 space-y-3">
                        {byFaculty.length === 0 && (
                            <p className="text-sm text-gray-400 italic text-center py-8">Hali ariza yo'q</p>
                        )}
                        {byFaculty.map(f => (
                            <div key={f.faculty} className="space-y-1.5">
                                <div className="flex justify-between items-baseline gap-3">
                                    <span className="text-sm font-bold text-gray-800 truncate">{f.faculty}</span>
                                    <span className="text-xs text-gray-500 whitespace-nowrap">
                                        <b className="text-gray-900">{f.approved}</b> / {f.total} ta
                                        {f.amount > 0 && <span className="text-indigo-600 font-bold ml-2">{(f.amount / 1e6).toFixed(1)} mln</span>}
                                    </span>
                                </div>
                                <div className="h-2 bg-gray-100 rounded-full overflow-hidden flex">
                                    <div className="h-full bg-emerald-500" style={{ width: `${(f.approved / maxFacultyTotal) * 100}%` }} />
                                    <div className="h-full bg-indigo-200" style={{ width: `${((f.total - f.approved) / maxFacultyTotal) * 100}%` }} />
                                </div>
                            </div>
                        ))}
                        {byFaculty.length > 0 && (
                            <p className="text-[11px] text-gray-400 pt-2 flex gap-4">
                                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> tasdiqlangan</span>
                                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-200 inline-block" /> qolgan arizalar</span>
                            </p>
                        )}
                    </div>
                </Card>

                {/* Grantlar */}
                <Card title="Grantlar holati" className="p-0 overflow-hidden">
                    <div className="p-5 space-y-2">
                        {grantRows.length === 0 && (
                            <p className="text-sm text-gray-400 italic text-center py-8">Grant yaratilmagan</p>
                        )}
                        {grantRows.map(({ grant, usage }) => {
                            const st = GRANT_STATUS[grant.status] || GRANT_STATUS.draft;
                            return (
                                <div key={grant.id} className="p-3.5 bg-gray-50 rounded-xl border border-gray-100">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-gray-900 truncate">{grant.title}</p>
                                            <p className="text-xs text-gray-500">{formatAmount(grant.amount)} · {grant.type || '—'}</p>
                                        </div>
                                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border whitespace-nowrap ${st.tone}`}>
                                            {st.label}
                                        </span>
                                    </div>
                                    <div className="flex gap-4 mt-2 text-[11px] font-semibold text-gray-500">
                                        <span>{usage.totalCount} ta ariza</span>
                                        <span className="text-emerald-600">{usage.approvedCount} tasdiqlangan</span>
                                        {grant.quota > 0 && <span>kvota {grant.quota}</span>}
                                        {usage.spent > 0 && <span className="text-indigo-600">{(usage.spent / 1e6).toFixed(1)} mln</span>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default ScholarshipsOverviewPage;
