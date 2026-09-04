import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Users } from 'lucide-react';
import Badge from '../common/Badge';
import Button from '../common/Button';
import { slugify } from '../../utils/slug';

const BANNER_GRADIENTS = [
    'from-cyan-500 to-blue-600',
    'from-violet-500 to-purple-600',
    'from-lime-500 to-emerald-600',
    'from-pink-500 to-rose-600'
];

const RANK_MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };

// Expects `team` already enriched by ClubTeamsSection/ClubProfilePage: { ...team, clubName, members, achievementCount, rankPoints, rank }
const TeamCard = ({ team, teamBase }) => {
    const navigate = useNavigate();
    const slug = slugify(team.name);
    const teamIdNum = parseInt(String(team.id).replace('team_', ''), 10) || 0;
    const bannerGradient = BANNER_GRADIENTS[teamIdNum % BANNER_GRADIENTS.length];

    return (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all overflow-hidden flex flex-col">
            <div className={`relative h-20 bg-gradient-to-r ${bannerGradient} flex items-center justify-center`}>
                <span className="text-white font-black text-lg">{team.name}</span>
                {team.rank && team.rank <= 3 && (
                    <span className="absolute top-2 right-3 text-lg" title={`#${team.rank}`}>{RANK_MEDALS[team.rank]}</span>
                )}
            </div>

            <div className="p-5 flex-1 flex flex-col">
                {team.clubName && <p className="text-xs font-semibold text-indigo-600 mb-2">{team.clubName}</p>}

                <div className="flex items-center gap-1.5 mb-3">
                    {(team.members || []).slice(0, 5).map((m, i) => (
                        <div
                            key={m.userId}
                            title={m.student?.fullName}
                            className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-[10px] border-2 border-white"
                            style={{ marginLeft: i === 0 ? 0 : -10 }}
                        >
                            {m.student?.fullName?.charAt(0) || '?'}
                        </div>
                    ))}
                </div>

                <div className="flex gap-2 mb-4">
                    <Badge variant="default" size="sm">
                        <Users size={11} className="inline mr-1" />{(team.members || []).length} a'zo
                    </Badge>
                    <Badge variant="warning" size="sm">
                        <Trophy size={11} className="inline mr-1" />{team.achievementCount} yutuq
                    </Badge>
                </div>

                <Button variant="primary" size="sm" className="w-full mt-auto" onClick={() => navigate(`${teamBase}/${slug}`)}>
                    Jamoani ko'rish
                </Button>
            </div>
        </div>
    );
};

export default TeamCard;
