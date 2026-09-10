import React, { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
    FileText, CheckCircle, XCircle, AlertTriangle, Trash2, RotateCcw, Award,
    Target, ArrowRight, Info,
} from 'lucide-react';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';
import ScholarshipApplyForm from './ScholarshipApplyForm';
import { buildStudentEligibilityProfile } from '../../utils/scholarshipEligibility';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import { getApplicationStatusMeta, resolvePipeline } from '../../config/scholarships';

// "Arizalarim" — talabaning topshirgan arizalari va ularning holati.
//
// MUHIM: bu yerda grantlar RO'YXATI YO'Q va bo'lmasligi kerak.
//
// Avval bu modul ham grantlar ro'yxatini ko'rsatardi, "Imkoniyatlar" ham.
// Natijada bitta grant ikki joyda, ikki xil formula bilan baholanardi:
// Imkoniyatlarda masofa bo'yicha foiz (63%), bu yerda ikkilik hisob (2/4).
// Talaba bitta grant haqida ikki xil javob ko'rardi.
//
// Endi vazifa aniq bo'lindi:
//   Imkoniyatlar → nima bor, moslik qancha, ariza topshirish
//   Arizalarim   → nima topshirdim, qanday ketyapti
const ScholarshipsModule = ({ embedded = false }) => {
    const { user } = useAuth();
    const studentId = user?.username;

    const [version, setVersion] = useState(0);
    const bump = useCallback(() => setVersion(v => v + 1), []);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [flash, setFlash] = useState('');

    const myApplications = useMemo(
        () => (studentId ? db.getStudentScholarshipApplications(studentId) : [])
            .sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || ''))),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [studentId, version]
    );

    const stats = useMemo(() => {
        const active = myApplications.filter(a => !getApplicationStatusMeta(a.status).terminal);
        return {
            total: myApplications.length,
            active: active.length,
            won: myApplications.filter(a => a.status === 'approved').length,
            returned: myApplications.filter(a => a.status === 'returned').length,
        };
    }, [myApplications]);

    // Tuzatishga qaytarilgan arizani QAYTA OCHISH. Zanjirdagi o'rni saqlanadi:
    // talaba boshqatdan boshlamaydi, o'sha hujjat ko'rigiga qaytadi.
    //
    // Ilgari bu tugma formani ochmasdan, o'sha hujjatlarni o'zgarishsiz qayta
    // yuborardi - ya'ni "tuzatish" nomi bor edi, imkoni yo'q edi.
    const [fixing, setFixing] = useState(null);
    const openFix = (app) => {
        const grant = db.getScholarshipGrant(app.grantId);
        if (!grant) { setError('Grant topilmadi.'); return; }
        setFixing({ app, grant, profile: buildStudentEligibilityProfile(db, studentId) });
    };

    const withdraw = async (app) => {
        if (!window.confirm('Arizani qaytarib olasizmi?')) return;
        setBusy(true); setError(''); setFlash('');
        try {
            await db.withdrawScholarshipApplication(app.id, studentId);
            bump();
        } catch (e) { setError(e.message || String(e)); }
        finally { setBusy(false); }
    };

    return (
        <div className="space-y-6">
            {!embedded && (
                <div className="bg-gradient-to-r from-emerald-600 to-green-700 rounded-2xl p-8 text-white shadow-xl">
                    <h1 className="text-3xl font-bold mb-2">Arizalarim</h1>
                    <p className="text-emerald-100 italic">
                        Topshirgan arizalaringiz va ularning holati
                    </p>
                </div>
            )}

            {error && (
                <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl">
                    <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
                    <p className="text-sm font-semibold text-red-700">{error}</p>
                    <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">
                        <XCircle size={18} />
                    </button>
                </div>
            )}
            {flash && (
                <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
                    <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                    <p className="text-sm font-semibold text-emerald-800">{flash}</p>
                    <button onClick={() => setFlash('')} className="ml-auto text-emerald-400 hover:text-emerald-600">
                        <XCircle size={18} />
                    </button>
                </div>
            )}

            {myApplications.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {[
                        ['Jami', stats.total],
                        ['Jarayonda', stats.active],
                        ["G'olib", stats.won],
                    ].map(([label, value]) => (
                        <div key={label} className="bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-center min-w-[92px]">
                            <p className="text-2xl font-black text-gray-900">{value}</p>
                            <p className="text-[10px] uppercase font-bold tracking-widest text-gray-400">{label}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* Tuzatishga qaytarilganlar tepada - ular harakat talab qiladi */}
            {stats.returned > 0 && (
                <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl">
                    <RotateCcw className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-800">
                        <b>{stats.returned} ta arizangiz tuzatishga qaytarilgan.</b> Quyida izohni
                        o'qib, hujjatlarni tuzating va qayta yuboring.
                    </p>
                </div>
            )}

            {myApplications.length === 0 ? (
                <Card className="text-center py-16">
                    <FileText className="w-14 h-14 mx-auto mb-4 text-gray-200" />
                    <p className="font-bold text-gray-500">Hali ariza topshirmagansiz</p>
                    <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto">
                        Sizga mos grant va stipendiyalarni "Imkoniyatlar" bo'limida ko'ring —
                        u yerda moslik darajasi va nima yetishmayotgani ham yozilgan.
                    </p>
                    <Link to="/student/achievements"
                        className="inline-flex items-center gap-1.5 mt-5 px-5 py-2.5 bg-teal-700 text-white rounded-xl text-sm font-bold hover:bg-teal-800">
                        <Target size={15} /> Imkoniyatlarni ko'rish
                    </Link>
                </Card>
            ) : (
                <div className="space-y-3">
                    {myApplications.map(app => {
                        const meta = getApplicationStatusMeta(app.status);
                        const canWithdraw = !['approved', 'rejected', 'withdrawn', 'not_advanced'].includes(app.status);
                        const grant = db.getScholarshipGrant(app.grantId);
                        const pipeline = grant ? resolvePipeline(grant) : [];
                        const idx = app.stageIndex ?? 0;
                        const resultsById = new Map((app.stageResults || []).map(r => [r.stageId, r]));

                        return (
                            <Card key={app.id} className={`border-l-4 ${app.status === 'returned' ? 'border-l-red-500'
                                : app.status === 'approved' ? 'border-l-emerald-500'
                                    : meta.terminal ? 'border-l-gray-300' : 'border-l-indigo-500'}`}>
                                <div className="flex flex-col md:flex-row justify-between gap-4">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2 mb-1">
                                            <h3 className="font-black text-gray-900">{app.grantTitle}</h3>
                                            <Badge variant={meta.variant} size="sm">{meta.label}</Badge>
                                        </div>
                                        <p className="text-xs text-gray-500">
                                            Topshirilgan: {(app.submittedAt || '').slice(0, 10)}
                                        </p>

                                        {/* Bosqichlar kuzatuvi */}
                                        {pipeline.length > 0 && (
                                            <div className="mt-3 space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="w-5 h-5 rounded-md bg-emerald-500 text-white flex items-center justify-center flex-shrink-0">
                                                        <CheckCircle size={11} />
                                                    </span>
                                                    <span className="text-[11px] font-bold text-gray-500">Ariza topshirildi</span>
                                                </div>
                                                {pipeline.map((stg, i) => {
                                                    const res = resultsById.get(stg.id);
                                                    const isCurrent = i === idx && !meta.terminal;
                                                    const passed = res?.outcome === 'passed';
                                                    const failed = res?.outcome === 'eliminated';
                                                    return (
                                                        <div key={stg.id} className="flex items-center gap-2">
                                                            <span className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 text-[9px] font-black ${passed ? 'bg-emerald-500 text-white'
                                                                : failed ? 'bg-red-400 text-white'
                                                                    : isCurrent ? 'bg-indigo-500 text-white'
                                                                        : 'bg-gray-200 text-gray-400'}`}>
                                                                {passed ? <CheckCircle size={11} /> : failed ? <XCircle size={11} /> : i + 1}
                                                            </span>
                                                            <span className={`text-[11px] flex-1 min-w-0 truncate ${isCurrent ? 'font-black text-indigo-700' : passed ? 'font-semibold text-gray-600' : 'text-gray-400'}`}>
                                                                {stg.label}
                                                            </span>
                                                            {res?.score !== null && res?.score !== undefined && (
                                                                <span className="text-[11px] font-black text-gray-700 flex-shrink-0">
                                                                    {res.score}{res.rank ? ` · ${res.rank}-o'rin` : ''}
                                                                </span>
                                                            )}
                                                            {isCurrent && !res && (
                                                                <span className="text-[10px] text-indigo-500 font-bold flex-shrink-0">hozir</span>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {app.status === 'returned' && (
                                            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                                                <p className="text-xs font-bold text-red-800 flex items-center gap-1">
                                                    <RotateCcw size={12} /> Hujjatlaringiz tuzatishga qaytarildi
                                                </p>
                                                {app.reviewComment && (
                                                    <p className="text-xs text-red-700 mt-1">{app.reviewComment}</p>
                                                )}
                                                <button onClick={() => openFix(app)} disabled={busy}
                                                    className="mt-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-lg">
                                                    Hujjatlarni tuzatish
                                                </button>
                                            </div>
                                        )}

                                        {app.status === 'approved' && (
                                            <p className="mt-2 text-xs font-black text-emerald-700 flex items-center gap-1">
                                                <Award size={13} /> G'olib
                                                {app.finalPlace ? ` · ${app.finalPlace}-o'rin` : ''}
                                            </p>
                                        )}

                                        {app.status === 'not_advanced' && (
                                            <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                                                <p className="text-xs text-gray-700">
                                                    <b>Bu tanlovda tavsiya etilmadingiz.</b> Bu yakuniy baho emas —
                                                    "Imkoniyatlar" bo'limida keyingi tanlovga tayyorgarlik
                                                    ko'rsatkichingizni ko'rishingiz mumkin.
                                                </p>
                                            </div>
                                        )}

                                        {app.reviewComment && !['returned'].includes(app.status) && (
                                            <p className="text-xs text-gray-600 mt-2 p-2.5 bg-gray-50 rounded-lg border border-gray-100">
                                                <b>Izoh:</b> {app.reviewComment}
                                            </p>
                                        )}

                                        {canWithdraw && (
                                            <button onClick={() => withdraw(app)} disabled={busy}
                                                className="mt-2 text-[11px] font-bold text-red-500 hover:text-red-700 flex items-center gap-1">
                                                <Trash2 size={11} /> Qaytarib olish
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}

            {myApplications.length > 0 && (
                <Card className="p-4 border-l-4 border-l-teal-600">
                    <div className="flex items-center gap-3">
                        <Info size={18} className="text-teal-600 flex-shrink-0" />
                        <p className="text-sm text-gray-600 flex-1">
                            Yangi grant va stipendiyalar "Imkoniyatlar" bo'limida — moslik
                            darajasi bilan.
                        </p>
                        <Link to="/student/achievements"
                            className="flex items-center gap-1 text-sm font-bold text-teal-700 hover:text-teal-900 flex-shrink-0">
                            Ko'rish <ArrowRight size={14} />
                        </Link>
                    </div>
                </Card>
            )}

            {/* TUZATISH OYNASI - ariza berish formasining o'zi, faqat
                mavjud ariza bilan to'ldirilgan holda. Yangi ariza
                yaratilmaydi, o'shaning o'zi yangilanadi. */}
            <Modal
                isOpen={!!fixing}
                onClose={() => setFixing(null)}
                title={fixing ? `${fixing.grant.title} — hujjatlarni tuzatish` : ''}
                size="lg"
            >
                {fixing && (
                    <ScholarshipApplyForm
                        grant={fixing.grant}
                        profile={fixing.profile}
                        studentId={studentId}
                        existingApplication={fixing.app}
                        onCancel={() => setFixing(null)}
                        onDone={() => {
                            setFixing(null);
                            setFlash('Arizangiz tuzatilib qayta yuborildi.');
                            bump();
                        }}
                    />
                )}
            </Modal>
        </div>
    );
};

export default ScholarshipsModule;
