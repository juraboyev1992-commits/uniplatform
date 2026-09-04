import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ClipboardList, ChevronRight, FileEdit, History, Trophy, XCircle } from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import {
    APPLICATION_STATUS, APPLICATION_STATUS_LABELS,
} from '../../config/clubRegistration';
import ClubRegulationEditor from '../../components/clubs/ClubRegulationEditor';

const STATUS_BADGE = {
    DRAFT: 'default', SUBMITTED: 'info', UNDER_REVIEW: 'info', REVISION_REQUIRED: 'warning',
    RESUBMITTED: 'info', EXPERT_REVIEW: 'info', PENDING_APPROVAL: 'info',
    APPROVED: 'success', REJECTED: 'danger',
};

const formatDate = (iso) => iso ? new Date(iso).toLocaleString('uz-UZ', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

// TALABANING O'Z ARIZALARI - ro'yxat va tafsilot BITTA komponentda
// (band 25 dagi ikkita URL, `:id` bo'lsa tafsilot, bo'lmasa ro'yxat).
const MyClubApplicationsPage = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const { user } = useAuth();

    // Admin boshqa mashinada/seansda ko'rib chiqqan bo'lishi mumkin - mahalliy
    // nusxa faqat kirishda yangilanadi (izohi admin ClubApplicationsPage.jsx
    // da). Talaba shu sahifani aynan "holatim o'zgardimi" deb ochadi, shuning
    // uchun kirganda serverdan qayta so'raladi.
    const [refreshKey, setRefreshKey] = useState(0);
    useEffect(() => {
        let alive = true;
        db.syncCoreDataFromSupabase()
            .then(() => { if (alive) setRefreshKey(k => k + 1); })
            .catch(() => {});
        return () => { alive = false; };
    }, [id]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const applications = useMemo(() => db.getMyClubApplications(user?.username), [user, refreshKey]);
    const selected = id ? applications.find(a => a.id === id) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const reviews = useMemo(() => id ? db.getClubApplicationReviews(id) : [], [id, refreshKey]);

    if (id && !selected) {
        return (
            <div className="max-w-2xl mx-auto text-center py-16">
                <p className="text-gray-500">Ariza topilmadi.</p>
                <Button variant="outline" className="mt-4" onClick={() => navigate('/student/clubs/applications')}>Orqaga</Button>
            </div>
        );
    }

    if (selected) {
        return (
            <div className="max-w-3xl mx-auto space-y-5">
                <button onClick={() => navigate('/student/clubs/applications')} className="flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-800">
                    <ArrowLeft size={16} /> Arizalarim
                </button>

                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                        <h1 className="text-xl font-black text-gray-900">{selected.fields?.name || 'Ariza'}</h1>
                        <p className="text-sm text-gray-500 mt-0.5">{selected.fields?.direction}</p>
                    </div>
                    <Badge variant={STATUS_BADGE[selected.status] || 'gray'}>
                        {APPLICATION_STATUS_LABELS[selected.status]}
                    </Badge>
                </div>

                {[APPLICATION_STATUS.DRAFT, APPLICATION_STATUS.REVISION_REQUIRED].includes(selected.status) && (
                    <Button variant="primary" icon={FileEdit} onClick={() => navigate(`/student/clubs/create/${selected.id}`)}>
                        {selected.status === APPLICATION_STATUS.REVISION_REQUIRED ? 'Tuzatish va qayta yuborish' : 'Tahrirlashni davom ettirish'}
                    </Button>
                )}

                {selected.resultingClubId && (
                    <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
                        <Trophy size={16} /> Bu arizadan klub yaratildi.
                        <button onClick={() => navigate(`/student/clubs/${selected.resultingClubId}`)} className="underline">Klubga o'tish</button>
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

                {selected.status !== APPLICATION_STATUS.DRAFT && (
                    <ClubRegulationEditor
                        key={refreshKey}
                        applicationId={selected.id}
                        canEdit={[APPLICATION_STATUS.SUBMITTED, APPLICATION_STATUS.UNDER_REVIEW,
                            APPLICATION_STATUS.REVISION_REQUIRED, APPLICATION_STATUS.RESUBMITTED].includes(selected.status)}
                    />
                )}

                <Card>
                    <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                        <History size={16} className="text-gray-400" /> Ko'rib chiqish tarixi
                    </h3>
                    {reviews.length === 0 ? (
                        <p className="text-sm text-gray-400">Hali harakat bo'lmagan.</p>
                    ) : (
                        <div className="space-y-3">
                            {reviews.map(r => (
                                <div key={r.id} className="flex gap-3 pb-3 border-b border-gray-50 last:border-0 last:pb-0">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold text-gray-800">
                                            {APPLICATION_STATUS_LABELS[r.fromStatus] || 'Boshlanish'} → {APPLICATION_STATUS_LABELS[r.toStatus]}
                                        </p>
                                        {r.comment && <p className="text-xs text-gray-500 mt-0.5">{r.comment}</p>}
                                        <p className="text-[11px] text-gray-400 mt-0.5">{formatDate(r.createdAt)}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto space-y-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
                    <ClipboardList size={20} className="text-indigo-600" /> Klub arizalarim
                </h1>
                <Button variant="primary" onClick={() => navigate('/student/clubs/create')}>Yangi klub tashkil etish</Button>
            </div>

            {applications.length === 0 ? (
                <Card>
                    <p className="text-sm text-gray-500 text-center py-8">
                        Hali arizangiz yo'q. Yangi klub yoki to'garak tashkil etmoqchi bo'lsangiz, shu yerdan boshlang.
                    </p>
                </Card>
            ) : (
                <div className="space-y-2">
                    {applications.map(a => (
                        <button
                            key={a.id} onClick={() => navigate(`/student/clubs/applications/${a.id}`)}
                            className="w-full flex items-center gap-3 p-4 rounded-2xl border border-gray-200 bg-white hover:border-indigo-300 transition-colors text-left"
                        >
                            <div className="min-w-0 flex-1">
                                <p className="font-bold text-gray-900 truncate">{a.fields?.name || 'Nomsiz ariza'}</p>
                                <p className="text-xs text-gray-500">{formatDate(a.updatedAt || a.createdAt)}</p>
                            </div>
                            <Badge variant={STATUS_BADGE[a.status] || 'gray'}>{APPLICATION_STATUS_LABELS[a.status]}</Badge>
                            <ChevronRight size={16} className="text-gray-300 shrink-0" />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default MyClubApplicationsPage;
