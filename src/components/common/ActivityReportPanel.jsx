import React, { useMemo, useState } from 'react';
import { FileBarChart2, Send, Save, CheckCircle2, AlertTriangle, Lock } from 'lucide-react';
import Button from './Button';
import Badge from './Badge';
import { db } from '../../services/db';
import {
    REPORT_MANUAL_FIELDS, REPORT_STATUS, PARTICIPATION_ROLES,
} from '../../config/activityLifecycle';

// Yakuniy hisobot.
//
// Talab aniq edi: QO'LDA KIRITISHNI MAKSIMAL KAMAYTIRISH. Shu sababli hisobotning
// raqamli qismi umuman kiritilmaydi - ro'yxatdan o'tganlar, kelganlar, davomat
// foizi, rollar va fakultetlar kesimi, berilgan ball va hujjatlar bazadan
// o'qiladi. Qo'lda yoziladigani faqat uchta matn: natija, muammo, tavsiya.
//
// Raqamlar TOPSHIRISH PAYTIDA muhrlanadi (db.saveActivityReport): keyin davomat
// tuzatilsa ham, topshirilgan hisobotdagi son o'zgarmaydi.
const Stat = ({ label, value, suffix }) => (
    <div className="px-3 py-2 bg-white border border-gray-100 rounded-xl">
        <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wide">{label}</p>
        <p className="text-base font-extrabold text-gray-900 mt-0.5 tabular-nums">
            {value == null ? '—' : value}{value != null && suffix ? ` ${suffix}` : ''}
        </p>
    </div>
);

const ActivityReportPanel = ({ activityId, activityType, canManage, actingUsername, onChanged }) => {
    const [version, setVersion] = useState(0);
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    const existing = useMemo(
        () => db.getActivityReport(activityId, activityType),
        [activityId, activityType, version]
    );

    // Topshirilgan hisobotda MUHRLANGAN raqamlar ko'rsatiladi, aks holda joriy holat.
    const stats = useMemo(() => (
        existing?.status === 'submitted' && existing.stats
            ? existing.stats
            : db.buildActivityReportStats(activityId, activityType)
    ), [activityId, activityType, existing, version]);

    const [form, setForm] = useState(() => ({
        outcome: existing?.outcome || '',
        issues: existing?.issues || '',
        recommendations: existing?.recommendations || '',
    }));

    const submitted = existing?.status === 'submitted';
    const setField = (key, value) => setForm(f => ({ ...f, [key]: value }));

    const save = async (status) => {
        setBusy(status); setError(''); setMessage('');
        try {
            await db.saveActivityReport(activityId, activityType, { ...form, status, by: actingUsername });
            setVersion(v => v + 1);
            setMessage(status === 'submitted' ? 'Hisobot topshirildi.' : 'Qoralama saqlandi.');
            onChanged?.();
        } catch (e) {
            setError(e?.message || 'Saqlashda xatolik yuz berdi.');
        } finally {
            setBusy('');
        }
    };

    if (!stats) {
        return <p className="text-xs text-gray-400">Hisobot uchun ma'lumot topilmadi.</p>;
    }

    const roleEntries = Object.entries(stats.byRole || {});

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="font-bold text-sm text-gray-700 flex items-center gap-1.5">
                    <FileBarChart2 size={15} className="text-indigo-500" /> Yakuniy hisobot
                </h3>
                {existing && (
                    <Badge variant={REPORT_STATUS[existing.status]?.variant || 'default'} size="sm">
                        {REPORT_STATUS[existing.status]?.label || existing.status}
                    </Badge>
                )}
            </div>

            <div>
                <p className="text-[11px] text-gray-400 mb-1.5">
                    Quyidagi raqamlar tizim tomonidan avtomatik hisoblangan — qo'lda kiritish shart emas.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    <Stat label="Ro'yxatdan o'tgan" value={stats.registered} />
                    <Stat label="Qatnashgan" value={stats.attended} />
                    <Stat label="Davomat" value={stats.attendanceRate} suffix="%" />
                    <Stat label="Berilgan ball" value={stats.pointsAwarded} />
                    <Stat label="Ball olganlar" value={stats.pointsRecipients} />
                    <Stat label="Berilgan hujjat" value={stats.documentsIssued} />
                    <Stat label="Davomiyligi" value={stats.durationMinutes} suffix="daq." />
                    <Stat label="Fakultetlar" value={(stats.byFaculty || []).length} />
                </div>
            </div>

            {roleEntries.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {roleEntries.map(([id, count]) => (
                        <span key={id} className={`px-2 py-1 rounded-lg text-[11px] font-bold border ${PARTICIPATION_ROLES[id]?.tone || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                            {PARTICIPATION_ROLES[id]?.short || id}: {count}
                        </span>
                    ))}
                </div>
            )}

            {(stats.byFaculty || []).length > 0 && (
                <details className="text-[11px] text-gray-500">
                    <summary className="cursor-pointer font-semibold select-none">Fakultetlar kesimi</summary>
                    <div className="mt-1.5 space-y-1">
                        {stats.byFaculty.map(f => (
                            <div key={f.faculty} className="flex items-center justify-between gap-2 px-2 py-1 bg-slate-50 rounded-lg">
                                <span className="truncate">{f.faculty}</span>
                                <span className="font-bold tabular-nums shrink-0">{f.count}</span>
                            </div>
                        ))}
                    </div>
                </details>
            )}

            {error && (
                <p className="flex items-start gap-1.5 text-[11px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                    <AlertTriangle size={12} className="shrink-0 mt-px" /> {error}
                </p>
            )}
            {message && (
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
                    <CheckCircle2 size={12} /> {message}
                </p>
            )}

            {canManage && !submitted && (
                <div className="space-y-2">
                    {REPORT_MANUAL_FIELDS.map(f => (
                        <div key={f.key}>
                            <label className="block text-[11px] font-bold text-gray-500 mb-1">
                                {f.label}{f.required && <span className="text-rose-500"> *</span>}
                            </label>
                            <textarea
                                rows={2}
                                value={form[f.key]}
                                onChange={e => setField(f.key, e.target.value)}
                                placeholder={f.placeholder}
                                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs"
                            />
                        </div>
                    ))}
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" icon={Save} disabled={!!busy} onClick={() => save('draft')}>
                            Qoralama saqlash
                        </Button>
                        <Button
                            variant="primary" size="sm" icon={Send}
                            disabled={!!busy || !form.outcome.trim()}
                            onClick={() => save('submitted')}
                        >
                            {busy === 'submitted' ? 'Topshirilmoqda...' : 'Hisobotni topshirish'}
                        </Button>
                    </div>
                </div>
            )}

            {submitted && (
                <div className="space-y-2">
                    {REPORT_MANUAL_FIELDS.map(f => (
                        existing[f.key] ? (
                            <div key={f.key} className="px-3 py-2 bg-slate-50 rounded-xl">
                                <p className="text-[10px] font-bold text-gray-400 uppercase">{f.label}</p>
                                <p className="text-xs text-gray-700 mt-0.5 whitespace-pre-wrap">{existing[f.key]}</p>
                            </div>
                        ) : null
                    ))}
                    <p className="flex items-center gap-1.5 text-[11px] text-gray-400">
                        <Lock size={11} /> {existing.submittedBy || 'noma\'lum'} tomonidan{' '}
                        {existing.submittedAt ? new Date(existing.submittedAt).toLocaleString('uz-UZ') : ''} topshirilgan
                    </p>
                </div>
            )}
        </div>
    );
};

export default ActivityReportPanel;
