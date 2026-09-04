import React from 'react';
import { Calendar, MapPin } from 'lucide-react';
import Badge from '../common/Badge';
import RegistrationStatusBadge from '../activities/RegistrationStatusBadge';
import { db } from '../../services/db';

// "Tadbirlar" tab — grouped into 3 read-only showcase sections instead of one flat paginated list
// (spec: "Yaqinlashayotgan / Ochiq registratsiya / Yakunlangan"). Pure UI reorganization: registration
// itself still only happens through the existing ActivityRegistrationPanel flow (EventsCalendar.jsx /
// EventManagement.jsx) — this tab is a showcase, not a new registration entry point.
const EventCard = ({ e }) => (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 space-y-2">
        <h4 className="font-bold text-gray-900 dark:text-gray-100">{e.title}</h4>
        <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
            <Calendar size={12} /> {new Date(e.date).toLocaleDateString('uz-UZ', { day: '2-digit', month: 'long', year: 'numeric' })}
        </p>
        {e.location && (
            <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                <MapPin size={12} /> {e.location}
            </p>
        )}
        <RegistrationStatusBadge
            activity={e}
            startDateTime={e.date}
            registeredCount={db.getRegistrationsForActivity(e.id, 'event').filter(r => r.status === 'registered').length}
            size="sm"
        />
    </div>
);

const Section = ({ title, items, emptyText }) => (
    <div>
        <div className="flex items-center gap-2 mb-3">
            <h4 className="font-bold text-gray-900 dark:text-gray-100 text-sm">{title}</h4>
            <Badge variant="default" size="sm">{items.length}</Badge>
        </div>
        {items.length === 0 ? (
            <p className="text-xs text-gray-400 mb-2">{emptyText}</p>
        ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map(e => <EventCard key={e.id} e={e} />)}
            </div>
        )}
    </div>
);

const ClubEventsTab = ({ events }) => {
    if (events.length === 0) {
        return (
            <div className="text-center py-10 text-sm text-gray-400 bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
                Bu klubda hali tadbirlar yo'q
            </div>
        );
    }

    const completed = events.filter(e => e.status === 'completed');
    const openRegistration = events.filter(e =>
        e.status !== 'completed' && e.registrationRequired && db.isRegistrationOpen(e, e.date)
    );
    const upcoming = events.filter(e => e.status !== 'completed' && !openRegistration.includes(e));

    const byDateAsc = (a, b) => new Date(a.date) - new Date(b.date);
    const byDateDesc = (a, b) => new Date(b.date) - new Date(a.date);

    return (
        <div className="space-y-8">
            <Section title="Ochiq registratsiya" items={[...openRegistration].sort(byDateAsc)} emptyText="Hozircha registratsiyasi ochiq tadbir yo'q" />
            <Section title="Yaqinlashayotgan" items={[...upcoming].sort(byDateAsc)} emptyText="Rejalashtirilgan tadbirlar yo'q" />
            <Section title="Yakunlangan" items={[...completed].sort(byDateDesc)} emptyText="Hali yakunlangan tadbir yo'q" />
        </div>
    );
};

export default ClubEventsTab;
