import React, { useMemo } from 'react';
import { Calendar, MapPin, Sparkles } from 'lucide-react';
import RegistrationStatusBadge from '../activities/RegistrationStatusBadge';
import { db } from '../../services/db';

// Spec section 9 — a small preview under the hero: the nearest 3 upcoming activities (events +
// competitions) with name/date/location/registration status. Clicking opens the SAME
// ActivityRegistrationPanel modal EventsCalendar.jsx/EventManagement.jsx use (via onSelectActivity,
// wired by ClubProfilePage.jsx) — this used to call onNavigateTab('events'/'competitions'), which
// pointed at tab ids that don't exist on this page (ClubProfilePage.jsx's TABS never had them), so every
// click here silently rendered a blank pane. Fixed to open registration directly instead of routing to a
// dead tab.
const UpcomingActivitiesPreview = ({ events, competitions, onSelectActivity }) => {
    const items = useMemo(() => {
        const now = Date.now();
        const fromEvents = events
            .filter(e => e.status !== 'completed' && new Date(e.date).getTime() >= now)
            .map(e => ({
                id: `event_${e.id}`, kind: 'event', name: e.title,
                date: e.date, location: e.location, activity: e
            }));
        const fromCompetitions = competitions
            .filter(c => (c.currentRound || 1) <= (c.roundsCount || 1))
            .map(c => {
                const startDateTime = c.startDate ? db.combineDateTime(c.startDate, c.startTime) : null;
                return { id: `comp_${c.id}`, kind: 'competition', name: c.name, date: startDateTime, location: c.location, activity: c };
            })
            .filter(x => x.date && new Date(x.date).getTime() >= now);

        return [...fromEvents, ...fromCompetitions]
            .sort((a, b) => new Date(a.date) - new Date(b.date))
            .slice(0, 3);
    }, [events, competitions]);

    if (items.length === 0) return null;

    return (
        <div className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
                <Sparkles size={16} className="text-indigo-500" />
                <h3 className="font-bold text-gray-900 dark:text-gray-100 text-sm">Yaqinlashayotgan faoliyatlar</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {items.map(item => (
                    <button
                        key={item.id}
                        type="button"
                        onClick={() => onSelectActivity?.({ type: item.kind, raw: item.activity })}
                        className="text-left rounded-2xl border border-gray-100 dark:border-gray-700 p-3.5 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-indigo-50/40 dark:hover:bg-indigo-900/10 transition-colors space-y-1.5"
                    >
                        <p className="font-bold text-sm text-gray-900 dark:text-gray-100 truncate">{item.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                            <Calendar size={11} /> {new Date(item.date).toLocaleDateString('uz-UZ', { day: '2-digit', month: 'long', year: 'numeric' })}
                        </p>
                        {item.location && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5 truncate">
                                <MapPin size={11} /> {item.location}
                            </p>
                        )}
                        <RegistrationStatusBadge
                            activity={item.activity}
                            startDateTime={item.date}
                            registeredCount={db.getRegistrationsForActivity(item.activity.id, item.kind).filter(r => r.status === 'registered').length}
                            size="sm"
                        />
                    </button>
                ))}
            </div>
        </div>
    );
};

export default UpcomingActivitiesPreview;
