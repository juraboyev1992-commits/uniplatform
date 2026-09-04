import React, { useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Calendar, MapPin, Users, LogIn } from 'lucide-react';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import ActivityRegistrationPanel from '../../components/activities/ActivityRegistrationPanel';
import RegistrationStatusBadge from '../../components/activities/RegistrationStatusBadge';
import Button from '../../components/common/Button';

// Public, no-login-required competition/event page — the real destination for the "Ulashish" share
// link (previously just copied the current, login-protected admin/student URL — useless to anyone
// without an account). Anyone can see real info here; only an authenticated user gets the actual
// ActivityRegistrationPanel inline — everyone else sees a "kirish/ro'yxatdan o'tish" CTA that brings
// them right back to THIS same URL once logged in (see App.jsx's /login?redirect= handling), at which
// point this same component re-renders with the registration panel instead of the CTA.
// A competition/event still awaiting (or rejected by) moderation renders as "Topilmadi" — never leaked
// publicly before an admin approves it.
const PublicActivityPage = ({ activityType }) => {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { user, isAuthenticated, hasClubRole } = useAuth();

    const activity = useMemo(() => {
        return activityType === 'competition'
            ? db.getCompetitionById(id)
            : db.getEvents().find(e => e.id === id);
    }, [activityType, id]);

    const isApproved = activity && (activity.moderationStatus || 'approved') === 'approved';

    if (!activity || !isApproved) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-md text-center">
                    <h1 className="text-lg font-bold text-gray-900 mb-2">Topilmadi</h1>
                    <p className="text-sm text-gray-500">
                        Bu havola noto'g'ri yoki tegishli {activityType === 'competition' ? 'musobaqa' : 'tadbir'} hali mavjud emas.
                    </p>
                </div>
            </div>
        );
    }

    const name = activityType === 'competition' ? activity.name : activity.title;
    const startDateTime = activityType === 'competition'
        ? db.combineDateTime(activity.startDate, activity.startTime)
        : activity.date;
    const clubId = activityType === 'competition'
        ? (activity.contextType === 'club' ? activity.contextId : null)
        : activity.clubId;
    const club = clubId ? db.getClubs().find(c => c.id === clubId) : null;
    const registeredCount = db.getRegistrationsForActivity(activity.id, activityType).filter(r => r.status === 'registered').length;

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4">
            <div className="max-w-2xl mx-auto space-y-5">
                <div className="bg-gradient-to-r from-indigo-700 via-purple-700 to-indigo-800 rounded-3xl text-white p-6 shadow-md">
                    <p className="text-xs font-bold text-indigo-200 uppercase tracking-wide">
                        {activityType === 'competition' ? 'Musobaqa' : 'Tadbir'}{club ? ` • ${club.name}` : ''}
                    </p>
                    <h1 className="text-2xl font-black mt-1">{name}</h1>
                    <div className="flex flex-wrap gap-4 mt-4 text-sm text-indigo-100">
                        <span className="flex items-center gap-1.5">
                            <Calendar size={15} />
                            {startDateTime ? new Date(startDateTime).toLocaleString('uz-UZ', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Sana belgilanmagan'}
                        </span>
                        {activity.location && <span className="flex items-center gap-1.5"><MapPin size={15} />{activity.location}</span>}
                        <span className="flex items-center gap-1.5">
                            <Users size={15} />
                            {registeredCount}{activity.maxParticipants ? ` / ${activity.maxParticipants}` : ''} ishtirokchi
                        </span>
                    </div>
                </div>

                {activity.description && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                        <p className="text-sm text-gray-600 whitespace-pre-line">{activity.description}</p>
                    </div>
                )}

                <RegistrationStatusBadge activity={activity} startDateTime={startDateTime} registeredCount={registeredCount} />

                {isAuthenticated ? (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                        <ActivityRegistrationPanel
                            activity={activity}
                            activityType={activityType}
                            clubId={clubId}
                            startDateTime={startDateTime}
                            user={user}
                            isAdmin={user?.role === 'ADMINISTRATOR'}
                            isManagement={user?.role === 'RAHBARIYAT'}
                            hasClubRole={hasClubRole}
                            onRegistered={() => {}}
                        />
                    </div>
                ) : (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center space-y-3">
                        <p className="text-sm text-gray-600">Ro'yxatdan o'tish uchun tizimga kiring yoki yangi hisob yarating.</p>
                        <Button
                            variant="primary" icon={LogIn}
                            onClick={() => navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`)}
                        >
                            Kirish / Ro'yxatdan o'tish
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PublicActivityPage;
