import React, { useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Calendar, Users, Trophy, Shield } from 'lucide-react';
import Button from '../common/Button';
import Badge from '../common/Badge';
import { db } from '../../services/db';
import { findBySlugOrId, slugify } from '../../utils/slug';
import { getClubsRoutes } from '../../utils/clubsRoutes';
import AchievementsTimeline from './AchievementsTimeline';
import CopyableId from '../common/CopyableId';
import { ACHIEVEMENT_PLACES, placeLabel, levelLabel } from '../../config/clubAchievements';

const TeamProfilePage = () => {
    const { slug } = useParams();
    const navigate = useNavigate();
    const location = useLocation();

    const routes = getClubsRoutes(location.pathname);

    const team = useMemo(() => findBySlugOrId(db.getTeams(), slug), [slug]);
    const club = useMemo(() => (team ? db.getClubById(team.clubId) : null), [team]);

    // Rank among the team's own club-mates, by achievement points — same 3/2/1 weighting used
    // everywhere else this feature computes a team rank (ClubProfilePage's Jamoalar tab).
    const clubTeamsRanked = useMemo(() => {
        if (!team) return [];
        const raw = db.getClubTeams(team.clubId).map(t => {
            const points = db.getTeamAchievements(t.id)
                .reduce((sum, a) => sum + (ACHIEVEMENT_PLACES[a.place]?.weight || 0), 0);
            return { id: t.id, points };
        });
        return [...raw].sort((a, b) => b.points - a.points);
    }, [team]);
    const rank = clubTeamsRanked.findIndex(t => t.id === team?.id) + 1;

    const members = useMemo(() => {
        if (!team) return [];
        const raw = db.getTeamMembers(team.id).map(m => ({ ...m, score: db.getStudentSocialScoreTotal(m.userId) }));
        return [...raw].sort((a, b) => b.score - a.score);
    }, [team]);

    const achievements = useMemo(() => (team ? db.getTeamAchievements(team.id) : []), [team]);
    // Yutuqning yangi shakli: `title`/`place`/`level` (izohi
    // config/clubAchievements.js da). Xronologiya komponenti o'z shaklini
    // kutadi, shuning uchun shu yerda o'giriladi.
    const achievementItems = useMemo(
        () => achievements.map(a => ({
            id: a.id, label: a.title, date: a.date, place: a.place, level: a.level,
        })),
        [achievements]
    );

    if (!team) {
        return (
            <div className="text-center py-20">
                <p className="text-gray-400 mb-4">Jamoa topilmadi</p>
                <Button variant="outline" icon={ArrowLeft} onClick={() => navigate(routes.list)}>Klublar ro'yxatiga qaytish</Button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <Button
                variant="outline"
                size="sm"
                icon={ArrowLeft}
                onClick={() => (club ? navigate(`${routes.clubBase}/${slugify(club.name)}?tab=teams`) : navigate(routes.list))}
            >
                {club ? club.name : 'Klublar ro\'yxati'}
            </Button>

            <div className="bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-700 rounded-3xl p-8 text-white shadow-xl">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                    {club && <Badge variant="default">{club.name}</Badge>}
                    {rank > 0 && <span className="text-xs font-bold text-white/80">#{rank} klub ichida</span>}
                    <CopyableId value={`Jamoa #${team.displayNumber}`} className="text-xs font-bold text-white/60 hover:text-white">
                        Jamoa #{team.displayNumber}
                    </CopyableId>
                </div>
                <h1 className="text-2xl md:text-3xl font-black mb-2">{team.name}</h1>
                {team.description && <p className="text-white/80 text-sm max-w-xl">{team.description}</p>}
                {team.foundedAt && (
                    <p className="text-white/70 text-xs mt-3 flex items-center gap-1.5">
                        <Calendar size={12} /> {new Date(team.foundedAt).toLocaleDateString('uz-UZ', { day: '2-digit', month: 'long', year: 'numeric' })} dan beri
                    </p>
                )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                    { icon: Users, value: members.length, label: "A'zolar" },
                    { icon: Trophy, value: achievements.length, label: 'Yutuqlar' },
                    { icon: Shield, value: rank > 0 ? `#${rank}` : '—', label: 'Reyting' }
                ].map(s => (
                    <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
                        <s.icon className="w-5 h-5 text-indigo-500 mx-auto mb-1.5" />
                        <p className="text-xl font-black text-gray-900">{s.value}</p>
                        <p className="text-[11px] text-gray-400 font-bold uppercase">{s.label}</p>
                    </div>
                ))}
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <h3 className="font-bold text-gray-900 mb-4">A'zolar</h3>
                {members.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">Jamoada hali a'zolar yo'q</p>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {members.map(m => (
                            <div key={m.userId} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-gray-100">
                                <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold shrink-0">
                                    {m.student?.fullName?.charAt(0) || '?'}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="font-bold text-gray-900 text-sm truncate">{m.student?.fullName || m.userId}</p>
                                    <p className="text-[11px] text-gray-400 truncate">
                                        {m.student?.displayNumber && (
                                            <>
                                                <CopyableId value={`Talaba #${m.student.displayNumber}`}>Talaba #{m.student.displayNumber}</CopyableId>
                                                {' • '}
                                            </>
                                        )}
                                        {m.student?.course ? `${m.student.course}-kurs` : ''} {m.student?.faculty ? `• ${m.student.faculty}` : ''}
                                    </p>
                                </div>
                                <Badge variant={m.role === 'captain' ? 'primary' : 'default'} size="sm">
                                    {m.role === 'captain' ? 'Kapitan' : "A'zo"}
                                </Badge>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div>
                <h3 className="font-bold text-gray-900 mb-4 px-1">Yutuqlar</h3>
                <AchievementsTimeline items={achievementItems} />
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <h3 className="font-bold text-gray-900 p-6 pb-0">So'nggi turnirlar</h3>
                {achievements.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-8">Hali turnirlarda ishtirok etilmagan</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm mt-2">
                            <thead>
                                <tr className="text-[11px] font-bold text-gray-400 uppercase border-b border-gray-100">
                                    <th className="px-6 py-3">Turnir</th>
                                    <th className="px-6 py-3">Natija</th>
                                    <th className="px-6 py-3">Sana</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {[...achievements].sort((a, b) => new Date(b.date) - new Date(a.date)).map(a => (
                                    <tr key={a.id}>
                                        <td className="px-6 py-3 font-semibold text-gray-800">
                                            {a.title}
                                            <span className="block text-[11px] font-normal text-gray-400">
                                                {levelLabel(a.level)}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3">
                                            <Badge variant="warning" size="sm">{placeLabel(a.place)}</Badge>
                                        </td>
                                        <td className="px-6 py-3 text-gray-500">{new Date(a.date).toLocaleDateString('uz-UZ', { day: '2-digit', month: 'long', year: 'numeric' })}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TeamProfilePage;
