import React, { useMemo, useState } from 'react';
import { ShieldCheck, AlertTriangle, CheckCircle2, Info, Trash2, Home } from 'lucide-react';
import Card from '../common/Card';
import Badge from '../common/Badge';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import { INDEX_CRITERIA } from '../../config/socialActivityIndex';

// 10-MEZONNING IKKI BANDINI BAHOLASH.
//
// Bu yerda ham BALL QO'YILMAYDI: talaba to'liq balldan boshlaydi va ball
// faqat QAYD ETILGAN holat uchun kamayadi (4-mezondagi mantiq).
//
// KIM BAHOLAYDI:
//   zararli illatlardan xoli -> har doim tyutor
//   toza-ozoda yurish        -> yotoqxonada yashasa mudiri, aks holda tyutor
//
// Oyna baholovchini O'ZI aniqlaydi va begona bandni bloklaydi - foydalanuvchi
// "menikimi yoki emasmi" deb o'ylab o'tirmasligi kerak.
const PARTS = ['no_habits', 'tidiness'];

const HOUSING_LABELS = {
    dormitory: 'Yotoqxona',
    rent: 'Ijara',
    family: 'Oilasi bilan',
};

const ConductAssessmentPanel = ({ students }) => {
    const { user } = useAuth();
    const [version, setVersion] = useState(0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    const parts = INDEX_CRITERIA.SPORTS.parts;
    const labelOf = (key) => parts.find(p => p.key === key)?.label || key;
    const pointsOf = (key) => parts.find(p => p.key === key)?.points || 0;

    const rows = useMemo(() => students.map(s => {
        const housing = db.getStudentHousing(s.id);
        const flags = db.getSportConductFlags(s.id);
        return {
            student: s, housing,
            parts: PARTS.map(key => ({
                key,
                assessor: db.getConductAssessor(s.id, key),
                flag: flags.find(f => f.part === key) || null,
            })),
        };
    }), [students, version]);

    const run = async (fn, ok = '') => {
        setBusy(true); setError(''); setMessage('');
        try { await fn(); setVersion(v => v + 1); if (ok) setMessage(ok); }
        catch (e) { setError(e?.message || 'Xatolik yuz berdi.'); }
        finally { setBusy(false); }
    };

    const isAdmin = user?.role === 'ADMINISTRATOR';
    const mine = (assessor) => isAdmin || (assessor.userId && assessor.userId === user?.username);

    return (
        <Card>
            <div className="p-5 space-y-4">
                <div>
                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                        <ShieldCheck size={17} className="text-emerald-600" /> Sog'lom turmush tarzi
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">
                        10-mezon · {labelOf('no_habits')} ({pointsOf('no_habits')} ball)
                        {' + '}
                        {labelOf('tidiness')} ({pointsOf('tidiness')} ball)
                    </p>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                    <p className="text-[11px] font-bold text-gray-700 flex items-center gap-1.5">
                        <Info size={12} /> Bu yerda ball qo'yilmaydi
                    </p>
                    <p className="text-[11px] text-gray-600 leading-relaxed">
                        Har talaba to'liq balldan boshlaydi. Ball faqat <b>qayd etilgan holat</b> uchun
                        kamayadi — qolganlariga tegish shart emas. Baholovchi bandga qarab
                        o'zgaradi: zararli illatlarni tyutor, ozodalikni esa yotoqxonada
                        yashovchilar uchun yotoqxona mudiri baholaydi.
                    </p>
                </div>

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

                {rows.length === 0 ? (
                    <p className="text-sm text-gray-400 py-3">Talaba yo'q.</p>
                ) : (
                    <div className="space-y-2">
                        {rows.map(({ student, housing, parts: rowParts }) => (
                            <div key={student.id} className="border border-gray-100 rounded-xl p-3">
                                <div className="flex items-start justify-between gap-3 flex-wrap">
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-gray-900">{student.fullName}</p>
                                        <p className="text-[11px] text-gray-400 flex items-center gap-1">
                                            <Home size={10} />
                                            {housing
                                                ? `${HOUSING_LABELS[housing.housingType]}${housing.room ? ` · ${housing.room}` : ''}`
                                                : 'Turar joyi kiritilmagan'}
                                        </p>
                                    </div>
                                </div>

                                <div className="mt-2 space-y-1.5">
                                    {rowParts.map(({ key, assessor, flag }) => {
                                        const canAct = mine(assessor);
                                        return (
                                            <div key={key} className="flex items-center justify-between gap-3 flex-wrap">
                                                <div className="min-w-0">
                                                    <p className="text-xs text-gray-700">{labelOf(key)}</p>
                                                    <p className="text-[11px] text-gray-400">
                                                        Baholaydi: {assessor.label}
                                                        {!assessor.userId && ' (biriktirilmagan)'}
                                                    </p>
                                                    {flag && (
                                                        <p className="text-[11px] text-rose-600 mt-0.5">{flag.reason}</p>
                                                    )}
                                                </div>

                                                {flag ? (
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        <Badge variant="danger" size="sm">0 ball</Badge>
                                                        {canAct && (
                                                            <button
                                                                type="button" disabled={busy}
                                                                onClick={() => {
                                                                    // Bekor qilishning ham sababi bo'ladi:
                                                                    // ball qaytariladi, iz qolishi kerak.
                                                                    const reason = window.prompt('Bekor qilish sababi:');
                                                                    if (!reason) return;
                                                                    run(
                                                                        () => db.removeSportConductFlag(flag.id, {
                                                                            by: user?.username, reason,
                                                                        }),
                                                                        'Belgi bekor qilindi.'
                                                                    );
                                                                }}
                                                                className="p-1.5 text-gray-400 hover:text-emerald-600 rounded-lg"
                                                                title="Belgini bekor qilish"
                                                            >
                                                                <Trash2 size={12} />
                                                            </button>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        <Badge variant="success" size="sm">{pointsOf(key)} ball</Badge>
                                                        {/* Begona band bloklanadi - foydalanuvchi
                                                            "menikimi" deb o'ylab o'tirmasin. */}
                                                        {canAct ? (
                                                            <button
                                                                type="button" disabled={busy}
                                                                onClick={() => {
                                                                    const reason = window.prompt('Asosni yozing:');
                                                                    if (!reason) return;
                                                                    run(() => db.setSportConductFlag({
                                                                        studentId: student.id, part: key, reason,
                                                                        by: user?.username, actingRole: user?.role,
                                                                    }), 'Qayd etildi.');
                                                                }}
                                                                className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-600 text-[11px] font-bold hover:bg-rose-100"
                                                            >
                                                                Buzilish qayd etish
                                                            </button>
                                                        ) : (
                                                            <span className="text-[11px] text-gray-300">sizniki emas</span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Card>
    );
};

export default ConductAssessmentPanel;
