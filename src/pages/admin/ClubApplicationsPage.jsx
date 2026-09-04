import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    ArrowLeft, ClipboardList, ChevronRight, History, AlertTriangle, Loader2, RefreshCw,
} from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import {
    APPLICATION_STATUS, APPLICATION_STATUS_LABELS, APPLICATION_ACTIONS,
} from '../../config/clubRegistration';
import ClubRegulationEditor from '../../components/clubs/ClubRegulationEditor';

const STATUS_BADGE = {
    DRAFT: 'default', SUBMITTED: 'info', UNDER_REVIEW: 'info', REVISION_REQUIRED: 'warning',
    RESUBMITTED: 'info', EXPERT_REVIEW: 'info', PENDING_APPROVAL: 'info',
    APPROVED: 'success', REJECTED: 'danger',
};

const formatDate = (iso) => iso ? new Date(iso).toLocaleString('uz-UZ', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

// ADMIN "Clubs -> Applications" (band 11): ro'yxat + har bir ariza uchun
// harakatlar (`APPLICATION_ACTIONS` - config/clubRegistration.js). Har amal
// backendda ham tekshiriladi (db.reviewClubApplication) - bu yerdagi tugma
// ro'yxati faqat qulaylik uchun, yagona to'siq emas.
const ClubApplicationsPage = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const { user } = useAuth();
    const [statusFilter, setStatusFilter] = useState('');
    const [refreshKey, setRefreshKey] = useState(0);
    const [busy, setBusy] = useState(false);
    const [syncing, setSyncing] = useState(true);
    const [error, setError] = useState('');
    const [comment, setComment] = useState('');
    const [pendingAction, setPendingAction] = useState(null);

    // Sahifa faqat KIRISHDA yuklangan mahalliy nusxadan o'qiydi
    // (`syncCoreDataFromSupabase` faqat login paytida chaqiriladi) - ya'ni
    // talaba boshqa qurilmada ariza yuborsa yoki nizom yozsa, admin buni
    // sahifani F5 qilmaguncha ko'rmasdi. Bu yerga kirganda VA ariza
    // tafsilotini ochganda serverdan qayta so'raladi - aynan shu ekran
    // "yangi narsa bormi" deb tekshirish uchun ochiladi.
    useEffect(() => {
        let alive = true;
        setSyncing(true);
        db.syncCoreDataFromSupabase()
            .then(() => { if (alive) setRefreshKey(k => k + 1); })
            .catch(() => {})
            .finally(() => { if (alive) setSyncing(false); });
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const applications = useMemo(() => db.getClubApplications({ status: statusFilter || null }), [statusFilter, refreshKey]);

    const manualRefresh = async () => {
        setSyncing(true);
        try { await db.syncCoreDataFromSupabase(); setRefreshKey(k => k + 1); }
        finally { setSyncing(false); }
    };
    const selected = id ? db.getClubApplication(id) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const reviews = useMemo(() => id ? db.getClubApplicationReviews(id) : [], [id, refreshKey]);

    const runAction = async (actionDef) => {
        if (actionDef.requiresComment && !comment.trim()) { setPendingAction(actionDef); return; }
        setBusy(true); setError('');
        try {
            await db.reviewClubApplication({
                applicationId: selected.id, action: actionDef.key, comment, reviewedBy: user?.username,
            });
            setComment(''); setPendingAction(null);
            setRefreshKey(k => k + 1);
        } catch (e) {
            setError(e?.message || 'Xatolik yuz berdi.');
        } finally {
            setBusy(false);
        }
    };

    const convert = async () => {
        setBusy(true); setError('');
        try {
            const club = await db.convertApplicationToClub({ applicationId: selected.id, createdBy: user?.username });
            navigate(`/admin/clubs-directory/${club.id}`);
        } catch (e) {
            setError(e?.message || 'Klub yaratishda xatolik yuz berdi.');
        } finally {
            setBusy(false);
        }
    };

    if (id) {
        if (!selected) {
            return (
                <div className="max-w-2xl mx-auto text-center py-16">
                    <p className="text-gray-500">Ariza topilmadi.</p>
                    <Button variant="outline" className="mt-4" onClick={() => navigate('/admin/clubs/applications')}>Orqaga</Button>
                </div>
            );
        }
        const availableActions = APPLICATION_ACTIONS.filter(a => a.from.includes(selected.status));

        return (
            <div className="max-w-3xl mx-auto space-y-5">
                <button onClick={() => navigate('/admin/clubs/applications')} className="flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-800">
                    <ArrowLeft size={16} /> Arizalar
                </button>

                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                        <h1 className="text-xl font-black text-gray-900">{selected.fields?.name || 'Ariza'}</h1>
                        <p className="text-sm text-gray-500 mt-0.5">
                            {selected.applicant?.fullName || selected.applicantUserId} · {selected.fields?.direction}
                        </p>
                    </div>
                    <Badge variant={STATUS_BADGE[selected.status] || 'default'}>
                        {APPLICATION_STATUS_LABELS[selected.status]}
                    </Badge>
                </div>

                {selected.status === APPLICATION_STATUS.APPROVED && !selected.resultingClubId && (
                    <Button variant="primary" onClick={convert} disabled={busy}>
                        {busy ? <Loader2 size={14} className="animate-spin" /> : null} Klubga aylantirish
                    </Button>
                )}
                {selected.resultingClubId && (
                    <p className="text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
                        Bu arizadan klub yaratilgan.{' '}
                        <button onClick={() => navigate(`/admin/clubs-directory/${selected.resultingClubId}`)} className="underline">Klubga o'tish</button>
                    </p>
                )}

                <Card>
                    <h3 className="font-bold text-gray-900 mb-3">Ariza ma'lumotlari</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                        {[
                            ['Maqsad', selected.fields?.purpose], ['Rahbar', selected.fields?.leader],
                            ["A'zolar (taxminiy)", selected.fields?.estimatedMembers],
                            ['Faoliyat davri', selected.fields?.activityPeriod],
                        ].filter(([, v]) => v).map(([label, value]) => (
                            <div key={label}>
                                <p className="text-[11px] font-bold text-gray-400 uppercase">{label}</p>
                                <p className="text-gray-800">{value}</p>
                            </div>
                        ))}
                    </div>
                </Card>

                {availableActions.length > 0 && (
                    <Card>
                        <h3 className="font-bold text-gray-900 mb-3">Amallar</h3>
                        {pendingAction && (
                            <div className="mb-3">
                                <label className="block text-xs font-black text-gray-500 uppercase mb-1.5">
                                    Sabab ({pendingAction.label})
                                </label>
                                <textarea
                                    value={comment} onChange={e => setComment(e.target.value)} rows={2}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
                                    placeholder="Masalan: Nizomning 4-bandini qayta ko'rib chiqish kerak."
                                />
                            </div>
                        )}
                        <div className="flex flex-wrap gap-2">
                            {availableActions.map(a => (
                                <Button
                                    key={a.key}
                                    variant={a.key === 'reject' ? 'danger' : a.key === 'approve' ? 'primary' : 'outline'}
                                    size="sm" disabled={busy}
                                    onClick={() => runAction(a)}
                                >
                                    {a.label}
                                </Button>
                            ))}
                        </div>
                        {error && (
                            <p className="flex items-start gap-1.5 text-xs font-semibold text-red-600 mt-3">
                                <AlertTriangle size={13} className="shrink-0 mt-px" /> {error}
                            </p>
                        )}
                    </Card>
                )}

                {/* `key` - sinxronlash tugagach komponentni MAJBURAN qayta yaratadi.
                    ClubRegulationEditor o'z holatini faqat clubId/applicationId
                    o'zgarganda qayta o'qiydi (o'z useEffect'i) - `refreshKey`
                    o'zgarishi buni tetiklamasdi, talaba yozgan matn admin
                    ekranida ko'rinmay qolardi. */}
                <ClubRegulationEditor key={refreshKey} applicationId={selected.id} canEdit={false} canApprove={true} />

                <Card>
                    <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                        <History size={16} className="text-gray-400" /> Qarorlar tarixi
                    </h3>
                    {reviews.length === 0 ? (
                        <p className="text-sm text-gray-400">Hali harakat bo'lmagan.</p>
                    ) : (
                        <div className="space-y-3">
                            {reviews.map(r => (
                                <div key={r.id} className="pb-3 border-b border-gray-50 last:border-0 last:pb-0">
                                    <p className="text-sm font-semibold text-gray-800">
                                        {APPLICATION_STATUS_LABELS[r.fromStatus] || 'Boshlanish'} → {APPLICATION_STATUS_LABELS[r.toStatus]}
                                    </p>
                                    {r.comment && <p className="text-xs text-gray-500 mt-0.5">Sabab: {r.comment}</p>}
                                    <p className="text-[11px] text-gray-400 mt-0.5">{r.reviewedBy} · {formatDate(r.createdAt)}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
                    <ClipboardList size={20} className="text-indigo-600" /> Klub arizalari
                </h1>
                <div className="flex items-center gap-2">
                    <button
                        type="button" onClick={manualRefresh} disabled={syncing}
                        title="Yangi arizalar/nizomlarni serverdan qayta so'rash"
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                    >
                        <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} /> Yangilash
                    </button>
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-xl text-sm">
                        <option value="">Barcha statuslar</option>
                        {Object.entries(APPLICATION_STATUS_LABELS).map(([k, label]) => (
                            <option key={k} value={k}>{label}</option>
                        ))}
                    </select>
                </div>
            </div>

            {applications.length === 0 ? (
                <Card><p className="text-sm text-gray-500 text-center py-8">Ariza yo'q.</p></Card>
            ) : (
                <div className="space-y-2">
                    {applications.map(a => (
                        <button
                            key={a.id} onClick={() => navigate(`/admin/clubs/applications/${a.id}`)}
                            className="w-full flex items-center gap-3 p-4 rounded-2xl border border-gray-200 bg-white hover:border-indigo-300 transition-colors text-left"
                        >
                            <div className="min-w-0 flex-1">
                                <p className="font-bold text-gray-900 truncate">{a.fields?.name || 'Nomsiz ariza'}</p>
                                <p className="text-xs text-gray-500 truncate">
                                    {a.applicant?.fullName || a.applicantUserId} · {a.fields?.direction} · {formatDate(a.updatedAt || a.createdAt)}
                                </p>
                            </div>
                            <Badge variant={STATUS_BADGE[a.status] || 'default'}>{APPLICATION_STATUS_LABELS[a.status]}</Badge>
                            <ChevronRight size={16} className="text-gray-300 shrink-0" />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ClubApplicationsPage;
