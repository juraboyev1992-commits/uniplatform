import React, { useState } from 'react';
import {
    Bell,
    CheckCheck,
    Trash2,
    Info,
    CheckCircle,
    AlertCircle,
    Users
} from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';

const TYPE_ICON = {
    waitlist_offer: <AlertCircle className="text-amber-500" size={24} />,
    team_invite: <Users className="text-indigo-500" size={24} />,
    success: <CheckCircle className="text-emerald-500" size={24} />
};
const TYPE_BG = {
    waitlist_offer: 'bg-amber-50',
    team_invite: 'bg-indigo-50',
    success: 'bg-emerald-50'
};

const formatRelativeTime = (iso) => {
    const diffMs = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return 'hozirgina';
    if (minutes < 60) return `${minutes} daqiqa oldin`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} soat oldin`;
    return `${Math.floor(hours / 24)} kun oldin`;
};

// Real, per-user notification inbox — replaces what used to be a hardcoded, disconnected mock list.
// Fed by db.js's unified registration layer (waitlist offers, team invites, and any future
// createNotification callers) via db.getNotificationsForUser/markNotificationRead/etc.
const NotificationList = () => {
    const { user } = useAuth();
    const [version, setVersion] = useState(0);
    const notifications = user ? db.getNotificationsForUser(user.username) : [];

    const markAllRead = async () => {
        if (!user) return;
        await db.markAllNotificationsRead(user.username);
        setVersion(v => v + 1);
    };

    const clearAll = async () => {
        if (!user) return;
        await db.clearNotificationsForUser(user.username);
        setVersion(v => v + 1);
    };

    const markOneRead = async (id) => {
        await db.markNotificationRead(id);
        setVersion(v => v + 1);
    };

    return (
        <div className="max-w-3xl mx-auto space-y-6 pb-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Bell className="text-indigo-600" />
                        Bildirishnomalar
                    </h1>
                    <p className="text-gray-500">Barcha tizim yangiliklari va eslatmalar</p>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs font-bold text-indigo-600 flex items-center gap-1"
                        onClick={markAllRead}
                    >
                        <CheckCheck size={16} />
                        Barchasini o'qilgan deb belgilash
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs font-bold text-rose-600 flex items-center gap-1"
                        onClick={clearAll}
                    >
                        <Trash2 size={16} />
                        Tozalash
                    </Button>
                </div>
            </div>

            {notifications.length === 0 ? (
                <Card className="flex flex-col items-center justify-center p-12 bg-white/50 border-none">
                    <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                        <Bell size={40} className="text-gray-300" />
                    </div>
                    <p className="text-gray-500 font-medium">Hozircha bildirishnomalar yo'q</p>
                </Card>
            ) : (
                <div className="space-y-4">
                    {notifications.map((notif) => (
                        <Card
                            key={notif.id}
                            className={`p-6 border-none transition-all hover:translate-x-1 ${notif.isRead ? 'bg-white/50 grayscale-[0.3] opacity-80' : 'bg-white shadow-md'
                                }`}
                        >
                            <div className="flex gap-4">
                                <div className={`p-3 rounded-2xl shrink-0 ${TYPE_BG[notif.type] || 'bg-blue-50'}`}>
                                    {TYPE_ICON[notif.type] || <Info className="text-blue-500" size={24} />}
                                </div>
                                <div className="flex-1 space-y-1">
                                    <div className="flex justify-between items-start">
                                        <h3 className={`font-bold ${notif.isRead ? 'text-gray-700' : 'text-gray-900'}`}>
                                            {notif.title}
                                            {!notif.isRead && (
                                                <span className="ml-2 w-2 h-2 bg-indigo-500 rounded-full inline-block"></span>
                                            )}
                                        </h3>
                                        <span className="text-xs text-gray-400 font-medium">{formatRelativeTime(notif.createdAt)}</span>
                                    </div>
                                    <p className="text-sm text-gray-600 leading-relaxed italic">
                                        {notif.message}
                                    </p>
                                    {!notif.isRead && (
                                        <div className="pt-2">
                                            <button onClick={() => markOneRead(notif.id)} className="text-xs font-bold text-gray-400 hover:text-gray-600">
                                                O'qilgan deb belgilash
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
};

export default NotificationList;
