import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth, ROLES } from '../../contexts/AuthContext';
import { Bell, User, LogOut, ChevronDown, Menu } from 'lucide-react';
import { db } from '../../services/db';

const formatRelativeTime = (iso) => {
    const diffMs = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return 'hozirgina';
    if (minutes < 60) return `${minutes} daqiqa oldin`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} soat oldin`;
    return `${Math.floor(hours / 24)} kun oldin`;
};

const Header = ({ onMenuClick }) => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [showProfileMenu, setShowProfileMenu] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    // Re-fetched fresh on every render (cheap, localStorage-backed) rather than memoized, so the badge
    // count and dropdown reflect notifications created elsewhere in the app (waitlist offers, team
    // invites, admin overrides) without needing a global refresh mechanism.
    const [notifVersion, setNotifVersion] = useState(0);
    const notifications = user ? db.getNotificationsForUser(user.username) : [];

    const getProfilePath = () => {
        switch (user?.role) {
            case ROLES.STUDENT: return '/student/profile';
            case ROLES.ADMIN: return '/admin/profile';
            case ROLES.MANAGEMENT: return '/management/profile';
            // Yangi rol qo'shilganda bu ro'yxatga ham yozilishi SHART -
            // aks holda profil tugmasi bosh sahifaga olib ketadi.
            case ROLES.TUTOR: return '/tutor/profile';
            default: return '/';
        }
    };

    const getNotificationsPath = () => {
        switch (user?.role) {
            case ROLES.STUDENT: return '/student/notifications';
            case ROLES.ADMIN: return '/admin/notifications';
            case ROLES.MANAGEMENT: return '/management/notifications';
            case ROLES.TUTOR: return '/tutor/notifications';
            default: return '/';
        }
    };

    const unreadCount = notifications.filter(n => !n.isRead).length;

    const handleNotificationClick = async (notif) => {
        if (!notif.isRead) {
            await db.markNotificationRead(notif.id);
            setNotifVersion(v => v + 1);
        }
    };

    const getRoleName = (role) => {
        switch (role) {
            case ROLES.STUDENT: return 'Talaba';
            case ROLES.ADMIN: return 'Administrator';
            case ROLES.MANAGEMENT: return 'Rahbariyat';
            default: return role;
        }
    };

    return (
        <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
            <div className="px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    {/* Left: Logo and Menu Button */}
                    <div className="flex items-center">
                        <button
                            onClick={onMenuClick}
                            className="lg:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100 mr-2"
                        >
                            <Menu className="w-6 h-6" />
                        </button>
                        <div className="flex items-center">
                            <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-700 rounded-lg flex items-center justify-center shadow-md">
                                <span className="text-white font-bold text-xl">U</span>
                            </div>
                            <div className="ml-3">
                                <h1 className="text-xl font-bold gradient-text">UniPlatform</h1>
                                <p className="text-xs text-gray-500">Universitet Boshqaruv Tizimi</p>
                            </div>
                        </div>
                    </div>

                    {/* Right: Notifications and Profile */}
                    <div className="flex items-center space-x-4">
                        {/* Notifications */}
                        <div className="relative">
                            <button
                                onClick={() => setShowNotifications(!showNotifications)}
                                className="relative p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                <Bell className="w-6 h-6" />
                                {unreadCount > 0 && (
                                    <span className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-semibold">
                                        {unreadCount}
                                    </span>
                                )}
                            </button>

                            {/* Notifications Dropdown */}
                            {showNotifications && (
                                <>
                                    <div
                                        className="fixed inset-0 z-10"
                                        onClick={() => setShowNotifications(false)}
                                    />
                                    <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 z-20 animate-scale-in">
                                        <div className="p-4 border-b border-gray-200">
                                            <h3 className="font-semibold text-gray-900">Bildirishnomalar</h3>
                                        </div>
                                        <div className="max-h-96 overflow-y-auto">
                                            {notifications.length === 0 && (
                                                <p className="p-4 text-sm text-gray-400 text-center">Bildirishnomalar yo'q</p>
                                            )}
                                            {notifications.slice(0, 8).map(notif => (
                                                <div
                                                    key={notif.id}
                                                    onClick={() => handleNotificationClick(notif)}
                                                    className={`p-4 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ${!notif.isRead ? 'bg-primary-50' : ''}`}
                                                >
                                                    <div className="flex items-start">
                                                        {!notif.isRead && (
                                                            <div className="w-2 h-2 bg-primary-500 rounded-full mt-2 mr-3 shrink-0" />
                                                        )}
                                                        <div className="flex-1 min-w-0">
                                                            <h4 className="font-semibold text-sm text-gray-900">{notif.title}</h4>
                                                            <p className="text-sm text-gray-600 mt-1">{notif.message}</p>
                                                            <p className="text-xs text-gray-400 mt-1">{formatRelativeTime(notif.createdAt)}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="p-3 text-center border-t border-gray-200">
                                            <Link
                                                to={getNotificationsPath()}
                                                onClick={() => setShowNotifications(false)}
                                                className="text-sm text-primary-500 hover:text-primary-600 font-medium"
                                            >
                                                Barchasini ko'rish
                                            </Link>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Profile Menu */}
                        <div className="relative">
                            <button
                                onClick={() => setShowProfileMenu(!showProfileMenu)}
                                className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-100 transition-colors"
                            >
                                <div className="w-9 h-9 bg-gradient-to-br from-primary-400 to-primary-600 rounded-full flex items-center justify-center">
                                    <User className="w-5 h-5 text-white" />
                                </div>
                                <div className="hidden md:block text-left">
                                    <p className="text-sm font-semibold text-gray-900">{user?.fullName}</p>
                                    <p className="text-xs text-gray-500">{getRoleName(user?.role)}</p>
                                </div>
                                <ChevronDown className="w-4 h-4 text-gray-600" />
                            </button>

                            {/* Profile Dropdown */}
                            {showProfileMenu && (
                                <>
                                    <div
                                        className="fixed inset-0 z-10"
                                        onClick={() => setShowProfileMenu(false)}
                                    />
                                    <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-2xl border border-gray-200 z-20 animate-scale-in">
                                        <div className="p-4 border-b border-gray-200">
                                            <p className="font-semibold text-gray-900">{user?.fullName}</p>
                                            <p className="text-sm text-gray-500">{user?.username}</p>
                                            {user?.role === ROLES.STUDENT && (
                                                <p className="text-xs text-gray-400 mt-1">
                                                    {user?.faculty} • {user?.group}
                                                </p>
                                            )}
                                        </div>
                                        <div className="p-2">
                                            <Link
                                                to={getProfilePath()}
                                                onClick={() => setShowProfileMenu(false)}
                                                className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                                            >
                                                Profil sozlamalari
                                            </Link>
                                            <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                                                Yordam
                                            </button>
                                        </div>
                                        <div className="p-2 border-t border-gray-200">
                                            <button
                                                onClick={logout}
                                                className="w-full flex items-center px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                            >
                                                <LogOut className="w-4 h-4 mr-2" />
                                                Chiqish
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
};

export default Header;
