import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Trophy, Calendar } from 'lucide-react';
import Badge from '../common/Badge';
import RegistrationStatusBadge from '../activities/RegistrationStatusBadge';
import { db } from '../../services/db';

// "Musobaqalar" tab — grouped into 3 read-only showcase sections (spec: "Faol / Registratsiya ochiq /
// Yakunlangan"). Pure UI reorganization: "yakunlangan" reuses the exact same
// `(currentRound || 1) > roundsCount` formula CompetitionOverviewTab.jsx already uses elsewhere in the
// app — not a new/invented notion of completion. Links through to the real workspace unchanged.
const isCompetitionCompleted = (c) => (c.currentRound || 1) > (c.roundsCount || 1);

const CompetitionCard = ({ c, base, navigate }) => {
    const startDateTime = c.startDate ? db.combineDateTime(c.startDate, c.startTime) : c.createdAt;
    return (
        <button
            type="button"
            onClick={() => navigate(`${base}/competitions/${c.id}`)}
            className="text-left bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 space-y-2 hover:shadow-md hover:-translate-y-0.5 transition-all w-full"
        >
            <div className="flex items-start justify-between gap-2">
                <h4 className="font-bold text-gray-900 dark:text-gray-100">{c.name}</h4>
                <Badge variant="primary" size="sm">{c.type === 'team' ? 'Jamoaviy' : 'Yakka'}</Badge>
            </div>
            {(c.startDate || c.createdAt) && (
                <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                    <Calendar size={12} /> {new Date(c.startDate || c.createdAt).toLocaleDateString('uz-UZ', { day: '2-digit', month: 'long', year: 'numeric' })}
                </p>
            )}
            <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                <Trophy size={12} /> {c.roundsCount ? `${c.currentRound || 1}/${c.roundsCount} bosqich` : 'Musobaqa'}
            </p>
            {c.registrationRequired && startDateTime && (
                <RegistrationStatusBadge
                    activity={c}
                    startDateTime={startDateTime}
                    registeredCount={db.getRegistrationsForActivity(c.id, 'competition').filter(r => r.status === 'registered').length}
                    size="sm"
                />
            )}
        </button>
    );
};

const Section = ({ title, items, emptyText, base, navigate }) => (
    <div>
        <div className="flex items-center gap-2 mb-3">
            <h4 className="font-bold text-gray-900 dark:text-gray-100 text-sm">{title}</h4>
            <Badge variant="default" size="sm">{items.length}</Badge>
        </div>
        {items.length === 0 ? (
            <p className="text-xs text-gray-400 mb-2">{emptyText}</p>
        ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map(c => <CompetitionCard key={c.id} c={c} base={base} navigate={navigate} />)}
            </div>
        )}
    </div>
);

const ClubCompetitionsTab = ({ competitions }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const base = location.pathname.startsWith('/admin') ? '/admin' : location.pathname.startsWith('/management') ? '/management' : '/student';

    if (competitions.length === 0) {
        return (
            <div className="text-center py-10 text-sm text-gray-400 bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
                Bu klubda hali musobaqalar yo'q
            </div>
        );
    }

    const completed = competitions.filter(isCompetitionCompleted);
    const openRegistration = competitions.filter(c => {
        if (isCompetitionCompleted(c) || !c.registrationRequired) return false;
        const startDateTime = c.startDate ? db.combineDateTime(c.startDate, c.startTime) : c.createdAt;
        return db.isRegistrationOpen(c, startDateTime);
    });
    const active = competitions.filter(c => !isCompetitionCompleted(c) && !openRegistration.includes(c));

    const byDateDesc = (a, b) => new Date(b.startDate || b.createdAt || 0) - new Date(a.startDate || a.createdAt || 0);

    return (
        <div className="space-y-8">
            <Section title="Registratsiya ochiq" items={[...openRegistration].sort(byDateDesc)} emptyText="Hozircha registratsiyasi ochiq musobaqa yo'q" base={base} navigate={navigate} />
            <Section title="Faol" items={[...active].sort(byDateDesc)} emptyText="Faol musobaqalar yo'q" base={base} navigate={navigate} />
            <Section title="Yakunlangan" items={[...completed].sort(byDateDesc)} emptyText="Hali yakunlangan musobaqa yo'q" base={base} navigate={navigate} />
        </div>
    );
};

export default ClubCompetitionsTab;
