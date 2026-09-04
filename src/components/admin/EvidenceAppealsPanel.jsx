import React, { useMemo, useState } from 'react';
import { Gavel, AlertTriangle, CheckCircle2 } from 'lucide-react';
import Card from '../common/Card';
import Badge from '../common/Badge';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import { INDEX_CRITERIA, APPEAL } from '../../config/socialActivityIndex';

// APELLYATSIYA NAVBATI.
//
// Metodika rad etilgan qarorga e'tiroz bildirishga yo'l qoldiradi. Bu shakl
// uchun emas: e'tirozni RAD ETGAN ODAM EMAS, boshqa mas'ul ko'radi - db
// qatlami buni tekshiradi va o'zini o'zi ko'rishga yo'l qo'ymaydi.
//
// E'tiroz qanoatlantirilsa hujjat qabul qilinganga o'tadi va ball o'sha
// zahoti indeksga tushadi - alohida tasdiqlash talab qilinmaydi.
const EvidenceAppealsPanel = () => {
    const { user } = useAuth();
    const [version, setVersion] = useState(0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [comments, setComments] = useState({});

    const appeals = useMemo(() => db.getEvidenceAppeals(), [version]);
    const pending = appeals.filter(a => a.status === 'pending');
    const decided = appeals.filter(a => a.status !== 'pending').slice(0, 10);

    const students = useMemo(
        () => new Map(db.getMockStudents().map(s => [s.id, s])),
        []
    );
    const evidenceById = useMemo(
        () => new Map(db.getIndexEvidence().map(e => [e.id, e])),
        [version]
    );

    const decide = async (appeal, decision) => {
        setBusy(true); setError(''); setMessage('');
        try {
            await db.decideEvidenceAppeal({
                appealId: appeal.id, decision,
                comment: comments[appeal.id] || '',
                decidedBy: user?.username,
            });
            setComments(c => ({ ...c, [appeal.id]: '' }));
            setVersion(v => v + 1);
            setMessage(decision === 'overturned'
                ? "E'tiroz qanoatlantirildi — hujjat qabul qilindi."
                : "E'tiroz rad etildi.");
        } catch (e) {
            setError(e?.message || 'Xatolik yuz berdi.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Card>
            <div className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                        <h3 className="font-bold text-gray-900 flex items-center gap-2">
                            <Gavel size={17} className="text-amber-600" /> E'tirozlar
                        </h3>
                        <p className="text-xs text-gray-500 mt-1">
                            Rad etilgan hujjatlarga bildirilgan e'tirozlar · {APPEAL.reviewWorkingDays} ish kunida ko'riladi
                        </p>
                    </div>
                    {pending.length > 0 && (
                        <Badge variant="warning">{pending.length} ta kutilmoqda</Badge>
                    )}
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

                {pending.length === 0 ? (
                    <p className="text-sm text-gray-400 py-4 text-center">
                        Ko'rib chiqilmagan e'tiroz yo'q.
                    </p>
                ) : (
                    <div className="space-y-3">
                        {pending.map(a => {
                            const ev = evidenceById.get(a.evidenceId);
                            const student = students.get(a.studentId);
                            // Rad etgan mas'ulning o'zi bu e'tirozni ko'ra olmaydi.
                            const isOwnDecision = a.rejectedBy && a.rejectedBy === user?.username;
                            return (
                                <div key={a.id} className="border border-amber-200 bg-amber-50/40 rounded-xl p-3.5 space-y-2.5">
                                    <div className="flex items-start justify-between gap-3 flex-wrap">
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-gray-900">
                                                {student?.fullName || a.studentId}
                                            </p>
                                            <p className="text-[11px] text-gray-500">
                                                {INDEX_CRITERIA[a.criterionKey]?.name}
                                                {ev?.claim?.level && (
                                                    <> • {INDEX_CRITERIA.COMPETITIONS.placement[ev.claim.level]?.label},{' '}
                                                        {ev.claim.place}-o'rin → {ev.claim.points} ball</>
                                                )}
                                            </p>
                                        </div>
                                        <span className="text-[11px] text-gray-400">
                                            {new Date(a.submittedAt).toLocaleDateString('uz-UZ')}
                                        </span>
                                    </div>

                                    {ev && (
                                        <p className="text-xs text-gray-700">
                                            <span className="font-semibold">Hujjat:</span> {ev.title}
                                            {ev.fileName ? ` · ${ev.fileName}` : ''}
                                        </p>
                                    )}

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <div className="bg-white border border-rose-100 rounded-lg p-2.5">
                                            <p className="text-[10px] font-bold uppercase text-rose-500">Rad etish sababi</p>
                                            <p className="text-[11px] text-gray-700 mt-0.5">{a.rejectionComment}</p>
                                            <p className="text-[10px] text-gray-400 mt-1">{a.rejectedBy}</p>
                                        </div>
                                        <div className="bg-white border border-indigo-100 rounded-lg p-2.5">
                                            <p className="text-[10px] font-bold uppercase text-indigo-500">Talabaning e'tirozi</p>
                                            <p className="text-[11px] text-gray-700 mt-0.5 whitespace-pre-wrap">{a.reason}</p>
                                        </div>
                                    </div>

                                    {isOwnDecision ? (
                                        <p className="text-[11px] font-semibold text-gray-500 bg-white border border-gray-200 rounded-lg px-3 py-2">
                                            Bu hujjatni siz rad etgansiz — e'tirozni boshqa mas'ul ko'rib chiqishi kerak.
                                        </p>
                                    ) : (
                                        <>
                                            <textarea
                                                rows={2}
                                                value={comments[a.id] || ''}
                                                onChange={e => setComments(c => ({ ...c, [a.id]: e.target.value }))}
                                                placeholder="Qaror asosi (majburiy)..."
                                                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white"
                                            />
                                            <div className="flex gap-2">
                                                <button
                                                    type="button" disabled={busy}
                                                    onClick={() => decide(a, 'overturned')}
                                                    className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-bold hover:bg-emerald-100"
                                                >
                                                    Qanoatlantirish — hujjat qabul qilinsin
                                                </button>
                                                <button
                                                    type="button" disabled={busy}
                                                    onClick={() => decide(a, 'upheld')}
                                                    className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-[11px] font-bold hover:bg-gray-200"
                                                >
                                                    Rad etish qarorini qoldirish
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {decided.length > 0 && (
                    <div className="pt-3 border-t border-gray-100 space-y-1.5">
                        <p className="text-[11px] font-bold uppercase text-gray-400">Ko'rib chiqilganlar</p>
                        {decided.map(a => (
                            <div key={a.id} className="flex items-center justify-between gap-3 text-[11px]">
                                <span className="text-gray-600 truncate">
                                    {students.get(a.studentId)?.fullName || a.studentId}
                                    {' · '}
                                    {INDEX_CRITERIA[a.criterionKey]?.name}
                                </span>
                                <Badge variant={a.decision === 'overturned' ? 'success' : 'default'} size="sm">
                                    {a.decision === 'overturned' ? 'Qanoatlantirildi' : 'Qoldirildi'}
                                </Badge>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Card>
    );
};

export default EvidenceAppealsPanel;
