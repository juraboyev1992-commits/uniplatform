import React, { useEffect, useState } from 'react';
import { Info, Users, Trophy } from 'lucide-react';
import Badge from '../common/Badge';
import Modal from '../common/Modal';
import CopyableId from '../common/CopyableId';
import ActivityRegistrationPanel from '../activities/ActivityRegistrationPanel';
import RegistrationStatusBadge from '../activities/RegistrationStatusBadge';
import { EVENT_TYPES, ACTIVITY_LEVELS } from '../../config/activityLifecycle';
import { db } from '../../services/db';

const STATUS_LABELS = { upcoming: 'Kutilmoqda', ongoing: 'Davom etmoqda', completed: 'Yakunlangan' };
const STATUS_VARIANTS = { upcoming: 'info', ongoing: 'warning', completed: 'success' };

// EventsCalendar.jsx dagi "Ma'lumotlar + ro'yxatdan o'tish" oynasining o'zi -
// bu yerga ko'chirildi, chunki endi ikkinchi joydan ham (EventCollectionDetailStudentPage.jsx,
// "Tadbirlar to'plami" ichidagi faoliyatlar ro'yxati) xuddi shu oyna kerak
// bo'ldi. Boshqarish huquqi (koordinator -> ish maydoniga o'tish) BU YERDA emas,
// chaqiruvchi tomonda hal qilinadi - bu komponent faqat entry berilganda oynani
// ochadi, ya'ni allaqachon "ro'yxatdan o'tish ko'rsatiladi" deb qaror qilingan.
const ActivityQuickViewModal = ({ entry, onClose, user, hasClubRole, clubNameById }) => {
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [linkedCompetition, setLinkedCompetition] = useState(null);

    useEffect(() => {
        if (!entry) { setSelectedEvent(null); setLinkedCompetition(null); return; }
        if (entry.kind === 'competition') {
            const comp = db.getCompetitionById(entry.id);
            if (!comp) return;
            // Turnir uchun tadbir nusxasi bo'lsa o'shani ishlatamiz (avvalgi
            // xatti-harakat aynan saqlanadi), bo'lmasa turnirdan oyna uchun
            // yozuv yasaymiz.
            const copy = db.getEvents().find(e => e.linkedCompetitionId === entry.id);
            setSelectedEvent(copy
                ? { ...copy, clubName: clubNameById?.get(copy.clubId) || null }
                : {
                    id: comp.id, title: comp.name, description: comp.description || '',
                    date: db.combineDateTime(comp.startDate, comp.startTime),
                    endTime: comp.endTime || null, location: comp.location || null,
                    displayNumber: comp.displayNumber, status: 'upcoming',
                    clubName: clubNameById?.get(entry.clubId) || null, registrations: [], participants: [],
                });
            setLinkedCompetition(comp);
            return;
        }
        const ev = db.getEvents().find(e => e.id === entry.id);
        if (!ev) return;
        setSelectedEvent({ ...ev, clubName: clubNameById?.get(ev.clubId) || null });
        setLinkedCompetition(null);
    }, [entry, clubNameById]);

    const activity = linkedCompetition || selectedEvent;
    const activityType = linkedCompetition ? 'competition' : 'event';
    const activityClubId = linkedCompetition
        ? (linkedCompetition.contextType === 'club' ? linkedCompetition.contextId : null)
        : selectedEvent?.clubId;
    const activityStartDateTime = activity
        ? (activityType === 'competition' ? db.combineDateTime(activity.startDate, activity.startTime) : activity.date)
        : null;

    const refreshActivity = () => {
        if (linkedCompetition) setLinkedCompetition(db.getCompetitionById(linkedCompetition.id));
        if (selectedEvent) {
            const fresh = db.getEvents().find(e => e.id === selectedEvent.id);
            if (fresh) setSelectedEvent(prev => ({ ...fresh, clubName: prev?.clubName || null }));
        }
    };

    const registeredCountFor = (act, type) => (act ? db.getRegistrationsForActivity(act.id, type).filter(r => r.status === 'registered').length : 0);

    const formatDate = (iso) => new Date(iso).toLocaleDateString('uz-UZ', { day: '2-digit', month: 'long', year: 'numeric' });
    const formatTime = (iso) => {
        const d = new Date(iso);
        if (d.getHours() === 0 && d.getMinutes() === 0) return null;
        return d.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
    };

    if (!selectedEvent) return null;

    return (
        <Modal isOpen onClose={onClose} title={selectedEvent.title} size="lg">
            <div className="space-y-6">
                <div className="flex flex-col md:flex-row gap-6">
                    <div className="w-full md:w-1/2 p-6 bg-gray-50 rounded-2xl">
                        <h4 className="font-bold text-gray-900 mb-4 flex items-center">
                            <Info className="w-5 h-5 mr-2 text-indigo-600" /> Ma'lumotlar
                        </h4>
                        <div className="space-y-4 text-sm">
                            <div className="flex justify-between border-b border-gray-200 pb-2">
                                <span className="text-gray-500">Tadbir raqami:</span>
                                <CopyableId value={`Tadbir #${selectedEvent.displayNumber}`} className="font-medium text-gray-900">
                                    #{selectedEvent.displayNumber}
                                </CopyableId>
                            </div>
                            {(selectedEvent.eventType || selectedEvent.level) && (
                                <div className="flex justify-between items-center border-b border-gray-200 pb-2 gap-2">
                                    <span className="text-gray-500">Turi:</span>
                                    <span className="flex gap-1.5 flex-wrap justify-end">
                                        {selectedEvent.eventType && EVENT_TYPES[selectedEvent.eventType] && (
                                            <Badge variant="info" size="sm">{EVENT_TYPES[selectedEvent.eventType].label}</Badge>
                                        )}
                                        {selectedEvent.level && ACTIVITY_LEVELS[selectedEvent.level] && (
                                            <Badge variant="default" size="sm">{ACTIVITY_LEVELS[selectedEvent.level].label}</Badge>
                                        )}
                                    </span>
                                </div>
                            )}
                            <div className="flex justify-between border-b border-gray-200 pb-2">
                                <span className="text-gray-500">Sana:</span>
                                <span className="font-medium">{formatDate(selectedEvent.date)}</span>
                            </div>
                            {formatTime(selectedEvent.date) && (
                                <div className="flex justify-between border-b border-gray-200 pb-2">
                                    <span className="text-gray-500">Vaqt:</span>
                                    <span className="font-medium">{formatTime(selectedEvent.date)}</span>
                                </div>
                            )}
                            {selectedEvent.location && (
                                <div className="flex justify-between border-b border-gray-200 pb-2">
                                    <span className="text-gray-500">Manzil:</span>
                                    <span className="font-medium text-right">{selectedEvent.location}</span>
                                </div>
                            )}
                            {selectedEvent.clubName && (
                                <div className="flex justify-between border-b border-gray-200 pb-2">
                                    <span className="text-gray-500">Klub:</span>
                                    <span className="font-medium text-right">{selectedEvent.clubName}</span>
                                </div>
                            )}
                            <div className="flex justify-between border-b border-gray-200 pb-2">
                                <span className="text-gray-500">Holati:</span>
                                <Badge variant={STATUS_VARIANTS[selectedEvent.status] || 'default'} size="sm">
                                    {STATUS_LABELS[selectedEvent.status] || selectedEvent.status}
                                </Badge>
                            </div>
                            <div className="flex justify-between border-b border-gray-200 pb-2">
                                <span className="text-gray-500">Ishtirokchilar:</span>
                                <span className="font-medium flex items-center gap-1">
                                    <Users className="w-3.5 h-3.5 text-gray-400" />
                                    {(linkedCompetition?.participants ?? selectedEvent.registrations ?? selectedEvent.participants ?? []).length} kishi
                                </span>
                            </div>
                            <div className="flex justify-between items-start border-b border-gray-200 pb-2">
                                <span className="text-gray-500">Ro'yxatdan o'tish:</span>
                                <RegistrationStatusBadge
                                    activity={activity}
                                    startDateTime={activityStartDateTime}
                                    registeredCount={registeredCountFor(activity, activityType)}
                                />
                            </div>
                        </div>
                    </div>
                    <div className="flex-1">
                        <h4 className="font-bold text-gray-900 mb-3">Tadbir tavsifi</h4>
                        <p className="text-gray-600 leading-relaxed mb-6">
                            {selectedEvent.description || "Tavsif kiritilmagan."}
                        </p>

                        {selectedEvent.linkedCompetitionId && !linkedCompetition && (
                            <div className="p-4 bg-indigo-50 rounded-xl flex items-start gap-2.5 mb-4">
                                <Trophy className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                                <p className="text-indigo-800 text-sm font-medium">
                                    Ushbu tadbir bir turnir/musobaqa asosida avtomatik yaratilgan.
                                </p>
                            </div>
                        )}

                        {activity && (
                            <ActivityRegistrationPanel
                                activity={activity}
                                activityType={activityType}
                                clubId={activityClubId}
                                startDateTime={activityStartDateTime}
                                user={user}
                                isAdmin={user?.role === 'ADMINISTRATOR'}
                                isManagement={user?.role === 'RAHBARIYAT'}
                                hasClubRole={hasClubRole}
                                onRegistered={refreshActivity}
                            />
                        )}
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default ActivityQuickViewModal;
