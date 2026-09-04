import React, { useMemo } from 'react';
import { Users, UsersRound, Calendar, Trophy, Award, Radar } from 'lucide-react';
import { db } from '../../services/db';

// "Statistika" tab (spec section 1). Reuses club.rank/club.score from db.getRankedClubs() (already
// computed once in ClubProfilePage and passed down via `club`) rather than recomputing the ranking here.
const ClubStatisticsTab = ({ club, memberCount, teamCount, eventCount, achievementCount }) => {
    const competitionCount = useMemo(() => db.getClubCompetitions(club.id).length, [club.id]);
    const uniqueCoverage = useMemo(() => db.getClubUniqueCoverage(club.id), [club.id]);
    // Ariza bosqichida kiritilgan "taxminiy a'zolar soni" - REJA, haqiqiy
    // hisob emas (u yuqoridagi `memberCount`). Ikkalasi solishtirilsin
    // uchun yonma-yon ko'rsatiladi, aralashtirilmaydi.
    const foundingFields = db.getFoundingApplicationFields(club.id);

    const stats = [
        { icon: Users, value: memberCount, label: "A'zolar" },
        { icon: UsersRound, value: teamCount, label: 'Jamoalar' },
        { icon: Calendar, value: eventCount, label: 'Tadbirlar' },
        { icon: Trophy, value: competitionCount, label: 'Musobaqalar' },
        { icon: Award, value: achievementCount, label: 'Yutuqlar' },
        { icon: Radar, value: uniqueCoverage, label: 'Haqiqiy qamrov' }
    ];

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                {stats.map(s => (
                    <div key={s.label} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 text-center">
                        <s.icon className="w-5 h-5 text-indigo-500 mx-auto mb-1.5" />
                        <p className="text-xl font-black text-gray-900 dark:text-gray-100">{s.value}</p>
                        <p className="text-[11px] text-gray-400 font-bold uppercase">{s.label}</p>
                    </div>
                ))}
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
                <p className="text-[11px] text-gray-400 font-bold uppercase mb-1">Faollik reytingi</p>
                <p className="text-2xl font-black text-indigo-600">
                    #{club.rank} <span className="text-sm text-gray-400 font-bold">({club.score} ball)</span>
                </p>
            </div>

            {foundingFields?.estimatedMembers && (
                <p className="text-xs text-gray-400">
                    Arizada rejalashtirilgan a'zolar soni: <b className="text-gray-600">{foundingFields.estimatedMembers}</b> · haqiqiy a'zolar: <b className="text-gray-600">{memberCount}</b>
                </p>
            )}
        </div>
    );
};

export default ClubStatisticsTab;
