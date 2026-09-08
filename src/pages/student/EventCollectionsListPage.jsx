import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, Calendar, ChevronRight } from 'lucide-react';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import { db } from '../../services/db';
import { COLLECTION_STATUS_LABELS } from '../../config/eventCollections.js';

const STATUS_VARIANTS = { ACTIVE: 'success', COMPLETED: 'info' };

// Talabaga faqat FAOL va YAKUNLANGAN to'plamlar ko'rinadi - DRAFT hali admin
// tayyorlayotgan, ARCHIVED esa endi tegishli emas.
const EventCollectionsListPage = () => {
    const navigate = useNavigate();
    const backendReady = db.isEventCollectionsBackendReady();

    const rows = useMemo(() => {
        if (!backendReady) return [];
        return db.getEventCollections()
            .filter(c => c.status === 'ACTIVE' || c.status === 'COMPLETED')
            .map(c => ({ collection: c, analytics: db.getEventCollectionAnalytics(c.id) }));
    }, [backendReady]);

    const fmtRange = (c) => {
        const f = (d) => d ? new Date(d).toLocaleDateString('uz-UZ', { day: '2-digit', month: 'long' }) : null;
        const s = f(c.startDate), e = f(c.endDate);
        if (s && e) return `${s} - ${e}`;
        return s || e || "Sana belgilanmagan";
    };

    return (
        <div className="space-y-6">
            <div className="bg-gradient-to-r from-indigo-700 via-purple-700 to-indigo-800 rounded-2xl p-8 text-white shadow-xl">
                <h1 className="text-3xl font-bold mb-2 flex items-center gap-3"><Layers className="w-8 h-8" /> Loyihalar</h1>
                <p className="text-indigo-100">Festival, hafталik va boshqa ko'p tadbirli loyihalar - umumiy reyting va statistika bilan</p>
            </div>

            {rows.length === 0 && (
                <Card className="p-12 text-center text-gray-400">Hozircha faol loyiha yo'q</Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {rows.map(({ collection, analytics }) => (
                    <Card
                        key={collection.id} hover className="cursor-pointer"
                        onClick={() => navigate(`/student/event-collections/${collection.id}`)}
                    >
                        <div className="flex items-start justify-between gap-2 mb-2">
                            <h3 className="font-bold text-lg text-gray-900">{collection.name}</h3>
                            <Badge variant={STATUS_VARIANTS[collection.status] || 'default'} size="sm">
                                {COLLECTION_STATUS_LABELS[collection.status]}
                            </Badge>
                        </div>
                        <p className="text-xs text-gray-400 flex items-center gap-1.5 mb-4">
                            <Calendar size={12} /> {fmtRange(collection)}
                        </p>
                        {collection.description && (
                            <p className="text-sm text-gray-600 mb-4 line-clamp-2">{collection.description}</p>
                        )}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-center">
                            <div>
                                <p className="text-lg font-black text-indigo-600">{analytics?.overview.activityCount ?? 0}</p>
                                <p className="text-[10px] text-gray-400 font-bold uppercase">Faoliyat</p>
                            </div>
                            <div>
                                <p className="text-lg font-black text-indigo-600">{analytics?.overview.uniqueStudents ?? 0}</p>
                                <p className="text-[10px] text-gray-400 font-bold uppercase">Talaba</p>
                            </div>
                            <div>
                                <p className="text-lg font-black text-indigo-600">
                                    {analytics?.overview.coveragePercent != null ? `${analytics.overview.coveragePercent.toFixed(1)}%` : '—'}
                                </p>
                                <p className="text-[10px] text-gray-400 font-bold uppercase">Qamrov</p>
                            </div>
                        </div>
                        <div className="flex justify-end mt-3">
                            <ChevronRight size={18} className="text-gray-300" />
                        </div>
                    </Card>
                ))}
            </div>
        </div>
    );
};

export default EventCollectionsListPage;
