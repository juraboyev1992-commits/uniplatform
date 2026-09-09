import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
    BookOpen, Calendar, Users, Trophy, ArrowRight, Bell, Info, BarChart3,
} from 'lucide-react';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import ProgressBar from '../../components/common/ProgressBar';
import { useAuth } from '../../contexts/AuthContext';
import LeaderboardModule from '../../components/student/LeaderboardModule';
import MyActivityPanel from '../../components/student/MyActivityPanel';
import { db } from '../../services/db';
import { INDEX_TOTAL_MAX } from '../../config/socialActivityIndex';

// TALABANING BOSH SAHIFASI.
//
// Bu ekran ilgari TO'LIQ QOTIB QOLGAN edi: "78% faollik", "12/15 test",
// "8 kitob", "5 tadbir", va ro'yxatlarda kodga yozilgan yozuvlar
// ("Matematika testi — 85%", "IT Hackathon", "2 soat oldin"). Talaba
// platformaga kirgan zahoti ko'radigan birinchi ekran boshqa odamning
// o'ylab topilgan hayotini ko'rsatardi.
//
// Endi har raqam talabaning O'Z yozuvlaridan keladi. Hisoblab bo'lmaydigan
// joyda `—` turadi, nol emas - butun ijtimoiy faollik moduli bo'ylab
// qo'llangan qoidaning aynan o'zi.
const StudentDashboard = () => {
    const { user } = useAuth();

    // Jamoa bo'yicha ochiq holatlar. Manba BITTA (db.getTeamAttention) -
    // kalendardagi belgi, menyudagi raqam va pastdagi kartochka ayni hisobga
    // tayanadi, aks holda ular bir-biridan chetga chiqib ketardi.
    const teamAttention = useMemo(
        () => db.getTeamAttention(user.username),
        [user.username]
    );

    const index = useMemo(
        () => db.getSocialActivityIndex(user.username),
        [user.username]
    );

    const participation = useMemo(
        () => db.getStudentActivityParticipation(user.username) || [],
        [user.username]
    );

    const memberships = useMemo(
        () => db.getUserMemberships(user.id || user.username) || [],
        [user.id, user.username]
    );

    const notifications = useMemo(
        () => (db.getNotificationsForUser(user.username) || []).slice(0, 4),
        [user.username]
    );

    // Kelayotgan tadbirlar - talabaning kalendaridan (Turlar bu yerga kirmaydi).
    const upcoming = useMemo(() => {
        const now = new Date();
        return (db.getStudentCalendarEntries() || [])
            .filter(e => e.date && new Date(e.date) >= now)
            .sort((a, b) => new Date(a.date) - new Date(b.date))
            .slice(0, 4);
    }, []);

    const reading = index.criteria.find(c => c.key === 'READING');
    const clubs = index.criteria.find(c => c.key === 'CLUBS');

    const percent = (index.total / INDEX_TOTAL_MAX) * 100;
    const status = percent >= 90 ? { label: 'Alo', variant: 'excellent' }
        : percent >= 70 ? { label: 'Yaxshi', variant: 'good' }
            : percent >= 50 ? { label: "O'rtacha", variant: 'average' }
                : { label: 'Past', variant: 'poor' };

    const stats = [
        {
            label: "O'qilgan asarlar",
            value: reading?.detail?.booksPassed ?? '—',
            note: reading?.detail?.availableTests != null
                ? `${reading.detail.availableTests} ta test mavjud`
                : 'Kitobxonlik testlari yaratilmagan',
            icon: BookOpen, color: 'text-blue-600', bg: 'bg-blue-50',
            to: '/student/library?tab=kitobxonlik',
        },
        {
            label: 'Qatnashgan tadbirlar',
            value: participation.length,
            note: 'davomat belgilangan',
            icon: Calendar, color: 'text-emerald-600', bg: 'bg-emerald-50',
            to: '/student/attendance',
        },
        {
            label: "Klub a'zoligi",
            value: memberships.length,
            note: clubs?.detail?.perClub?.length
                ? `${clubs.detail.perClub.length} klubda faollik qayd etilgan`
                : 'faollik hali qayd etilmagan',
            icon: Users, color: 'text-violet-600', bg: 'bg-violet-50',
            to: '/student/clubs',
        },
        {
            label: 'Hisoblangan mezonlar',
            value: `${index.scoredCount} / ${index.totalCount}`,
            note: 'ijtimoiy faollik indeksi',
            icon: BarChart3, color: 'text-amber-600', bg: 'bg-amber-50',
            to: '/student/social-activity',
        },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
                    Assalomu alaykum, {user.fullName?.split(' ')[0] || ''}
                </h1>
                <p className="text-gray-500 mt-1">
                    {user.faculty}
                    {user.course ? ` · ${user.course}-kurs` : ''}
                    {user.group ? ` · ${user.group}` : ''}
                </p>
            </div>

            {/* JAMOA HOLATI — HARAKAT KUTILAYOTGANDA.
                Menyudagi qizil raqamdan farqi: raqam "yangi ish" belgisi va
                bo'lim ochilgach yo'qoladi, bu kartochka esa holat TUGAMAGUNCHA
                turadi. Aynan shuning uchun qo'shildi - a'zolar umuman javob
                bermasa, boshqa hech qayerda doimiy belgi qolmasdi.
                Hech narsa kutilmayotgan bo'lsa umuman chizilmaydi: bo'sh
                "hammasi joyida" kartochkasi ekranni to'ldirib, qolgan
                narsalarni pastga surib qo'yardi. */}
            {(teamAttention.asInvitee.length > 0 || teamAttention.asCaptain.length > 0) && (
                <Card className="border-l-4 border-l-amber-400">
                    <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                        <Users size={16} className="text-amber-500" /> Jamoangiz bo'yicha
                    </h2>
                    <div className="mt-3 space-y-2">
                        {/* TAKLIFLAR BIRINCHI: bu talabaning O'ZIDAN kutilayotgan
                            harakat, sardorlik esa boshqalardan kutilayotgani. */}
                        {teamAttention.asInvitee.map(item => (
                            <Link
                                key={`inv-${item.registrationId}`}
                                to={`/${item.activityType === 'competition' ? 'musobaqa' : 'tadbir'}/${item.activityId}`}
                                className="flex items-center justify-between gap-3 p-3 rounded-xl bg-amber-50 border border-amber-100 hover:border-amber-300 transition-colors"
                            >
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-gray-900 truncate">
                                        {item.teamName || 'Jamoa'} — taklif javobsiz
                                    </p>
                                    <p className="text-[11px] text-gray-500 truncate">{item.activityTitle}</p>
                                </div>
                                <span className="text-[11px] font-bold text-amber-700 shrink-0 flex items-center gap-1">
                                    Javob berish <ArrowRight size={12} />
                                </span>
                            </Link>
                        ))}
                        {teamAttention.asCaptain.map(item => (
                            <Link
                                key={`cap-${item.registrationId}`}
                                to={`/${item.activityType === 'competition' ? 'musobaqa' : 'tadbir'}/${item.activityId}`}
                                className="flex items-center justify-between gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100 hover:border-amber-300 transition-colors"
                            >
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-gray-900 truncate">
                                        {item.teamName || 'Jamoangiz'} to'lmagan — {item.accepted}/{item.need}
                                    </p>
                                    <p className="text-[11px] text-gray-500 truncate">
                                        {item.activityTitle}
                                        {/* Muddat NOMA'LUM bo'lsa hech narsa yozilmaydi.
                                            "0 kun qoldi" deb yozish yolg'on bo'lardi. */}
                                        {item.daysLeft != null && item.daysLeft >= 0 && (
                                            item.daysLeft === 0 ? ' · muddat bugun' : ` · ${item.daysLeft} kun qoldi`
                                        )}
                                    </p>
                                </div>
                                <span className="text-[11px] font-bold text-gray-600 shrink-0 flex items-center gap-1">
                                    Eslatish <ArrowRight size={12} />
                                </span>
                            </Link>
                        ))}
                    </div>
                </Card>
            )}

            {/* IJTIMOIY FAOLLIK - haqiqiy indeksdan */}
            <Card className="border-2 border-primary-100">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 mb-2">Ijtimoiy faollik indeksi</h2>
                        <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-4xl font-extrabold gradient-text tabular-nums">
                                {index.total.toFixed(1)}
                            </span>
                            <span className="text-xl text-gray-400">/ {INDEX_TOTAL_MAX}</span>
                            <Badge variant={status.variant} size="lg">{status.label}</Badge>
                        </div>
                        {/* Nechta mezon hisoblangani ballning o'zi qadar muhim. */}
                        <p className="text-xs text-gray-500 mt-2">
                            {index.scoredCount} / {index.totalCount} mezon hisoblangan
                            {index.pending.length > 0 && ` · ${index.pending.length} tasi uchun ma'lumot yetishmayapti`}
                        </p>
                    </div>
                    <Link
                        to="/student/social-activity"
                        className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary-50 text-primary-700 text-sm font-bold hover:bg-primary-100 self-start"
                    >
                        Batafsil <ArrowRight size={15} />
                    </Link>
                </div>
                <div className="mt-4">
                    <ProgressBar value={percent} max={100} color="auto" size="lg" />
                </div>
            </Card>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((s, i) => (
                    <Link key={i} to={s.to}>
                        <Card hover className="h-full">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.bg}`}>
                                <s.icon size={20} className={s.color} />
                            </div>
                            <p className="text-2xl font-extrabold text-gray-900 mt-3 tabular-nums">{s.value}</p>
                            <p className="text-xs font-semibold text-gray-600">{s.label}</p>
                            <p className="text-[11px] text-gray-400 mt-0.5">{s.note}</p>
                        </Card>
                    </Link>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* KELAYOTGAN TADBIRLAR - talabaning kalendaridan */}
                <Card title="Yaqin kunlardagi tadbirlar">
                    {upcoming.length === 0 ? (
                        <p className="text-sm text-gray-400 py-6 text-center">
                            Rejalashtirilgan tadbir yo'q.
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {upcoming.map(e => (
                                <div key={`${e.type}:${e.id}`} className="flex items-start justify-between gap-3 p-3 rounded-xl bg-gray-50">
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-gray-900 truncate">{e.title}</p>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            {new Date(e.date).toLocaleDateString('uz-UZ', {
                                                day: '2-digit', month: 'long',
                                            })}
                                            {e.location ? ` · ${e.location}` : ''}
                                        </p>
                                    </div>
                                    {e.type === 'competition' && (
                                        <Badge variant="warning" size="sm">Musobaqa</Badge>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                    <Link
                        to="/student/events"
                        className="inline-flex items-center gap-1 text-xs font-bold text-primary-600 mt-3"
                    >
                        Barcha tadbirlar <ArrowRight size={12} />
                    </Link>
                </Card>

                {/* BILDIRISHNOMALAR - haqiqiy yozuvlardan */}
                <Card title="So'nggi bildirishnomalar">
                    {notifications.length === 0 ? (
                        <p className="text-sm text-gray-400 py-6 text-center">
                            Bildirishnoma yo'q.
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {notifications.map(n => (
                                <div key={n.id} className="flex items-start gap-2.5 p-3 rounded-xl bg-gray-50">
                                    <Bell size={14} className="text-primary-500 shrink-0 mt-0.5" />
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-gray-900">{n.title}</p>
                                        {n.message && (
                                            <p className="text-xs text-gray-600 mt-0.5">{n.message}</p>
                                        )}
                                        <p className="text-[11px] text-gray-400 mt-0.5">
                                            {new Date(n.createdAt).toLocaleDateString('uz-UZ')}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    <Link
                        to="/student/notifications"
                        className="inline-flex items-center gap-1 text-xs font-bold text-primary-600 mt-3"
                    >
                        Barchasi <ArrowRight size={12} />
                    </Link>
                </Card>
            </div>

            {/* Mavjud haqiqiy panellar - vazifalar va ishtirok */}
            <MyActivityPanel onlyOpenTasks footerLink="/student/attendance" />

            <LeaderboardModule />

            {index.pending.length > 0 && (
                <Card className="border-l-4 border-l-amber-400">
                    <p className="text-xs font-bold text-gray-700 flex items-center gap-1.5 mb-2">
                        <Info size={13} className="text-amber-500" />
                        Ma'lumot yetishmayotgan mezonlar
                    </p>
                    <div className="space-y-1">
                        {index.pending.slice(0, 4).map(p => (
                            <p key={p.key} className="text-[11px] text-gray-600">
                                • {p.name} — {p.missing}
                            </p>
                        ))}
                    </div>
                </Card>
            )}
        </div>
    );
};

export default StudentDashboard;
