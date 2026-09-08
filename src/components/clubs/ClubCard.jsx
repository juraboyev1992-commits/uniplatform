import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, UsersRound, Trophy, Calendar, Award, Archive, Lock } from 'lucide-react';
import Badge from '../common/Badge';
import Button from '../common/Button';
import { slugify } from '../../utils/slug';

const BANNER_GRADIENTS = [
    'from-indigo-500 to-purple-600',
    'from-emerald-500 to-teal-600',
    'from-rose-500 to-orange-500',
    'from-blue-500 to-cyan-500',
    'from-amber-500 to-orange-600',
    'from-fuchsia-500 to-pink-600'
];

const RANK_MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };

// Expects `club` already enriched by ClubsDirectoryPage: { ...club, direction, score, rank, teamCount,
// eventCount, competitionCount, achievementCount, coordinator }.
//
// MUQOVA VA LOGO ixtiyoriy (koordinator yuklaydi, supabase/club_media.sql).
// Yuklanmagan bo'lsa gradient rang va nomning birinchi harfi qoladi - ular
// vaqtinchalik o'rin egallovchi emas, to'liq yaroqli ko'rinish. Shu sababli
// rasm yo'qligi hech qayerda "to'ldirilmagan" deb belgilanmaydi.
const ClubCard = ({ club, clubBase }) => {
    const navigate = useNavigate();
    const slug = slugify(club.name);
    const bannerGradient = BANNER_GRADIENTS[(parseInt(club.id, 10) || 0) % BANNER_GRADIENTS.length];

    return (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all overflow-hidden flex flex-col">
            {/* Banner (16:5) */}
            <div className={`relative h-24 ${club.bannerUrl ? 'bg-gray-100' : `bg-gradient-to-r ${bannerGradient}`}`}>
                {club.bannerUrl && (
                    <img src={club.bannerUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                )}
                <div className="absolute -bottom-6 left-5 w-14 h-14 rounded-2xl bg-white shadow-md flex items-center justify-center font-black text-xl text-indigo-600 border-4 border-white overflow-hidden">
                    {club.logoUrl ? <img src={club.logoUrl} alt={club.name} className="w-full h-full object-cover" /> : club.name.charAt(0)}
                </div>
                {club.rank <= 3 && (
                    <span className="absolute top-3 right-3 text-lg" title={`#${club.rank}`}>{RANK_MEDALS[club.rank]}</span>
                )}
            </div>

            <div className="p-5 pt-8 flex-1 flex flex-col">
                <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-extrabold text-gray-900 leading-tight">{club.name}</h3>
                    <Badge variant="primary" size="sm">{club.direction}</Badge>
                </div>

                {/* Holat va a'zolik tartibi - kartadan darrov ko'rinsin.
                    Arizali klubga "A'zo bo'lish" bosgan talaba aks holda
                    faqat klub sahifasida bilib olardi. */}
                {(club.status === 'archived' || club.joinPolicy === 'application') && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                        {club.status === 'archived' && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700">
                                <Archive size={10} /> Arxivda
                            </span>
                        )}
                        {club.joinPolicy === 'application' && club.status !== 'archived' && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700">
                                <Lock size={10} /> Ariza orqali
                            </span>
                        )}
                    </div>
                )}
                <p className="text-sm text-gray-500 line-clamp-2 mb-4" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {club.description || "Tavsif kiritilmagan"}
                </p>

                {club.coordinator && (
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-[11px] shrink-0">
                            {club.coordinator.fullName?.charAt(0)}
                        </div>
                        <span className="text-xs font-semibold text-gray-600 truncate">{club.coordinator.fullName}</span>
                    </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-center mb-5 mt-auto">
                    <div>
                        <p className="font-black text-gray-900 text-sm flex items-center justify-center gap-1"><Users size={12} className="text-gray-400" />{club.membersCount || 0}</p>
                        <p className="text-[10px] text-gray-400 font-semibold uppercase">A'zolar</p>
                    </div>
                    <div>
                        <p className="font-black text-gray-900 text-sm flex items-center justify-center gap-1"><UsersRound size={12} className="text-gray-400" />{club.teamCount}</p>
                        <p className="text-[10px] text-gray-400 font-semibold uppercase">Jamoalar</p>
                    </div>
                    <div>
                        <p className="font-black text-gray-900 text-sm flex items-center justify-center gap-1"><Calendar size={12} className="text-gray-400" />{club.eventCount ?? 0}</p>
                        <p className="text-[10px] text-gray-400 font-semibold uppercase">Tadbirlar</p>
                    </div>
                    <div>
                        <p className="font-black text-gray-900 text-sm flex items-center justify-center gap-1"><Trophy size={12} className="text-gray-400" />{club.competitionCount ?? 0}</p>
                        <p className="text-[10px] text-gray-400 font-semibold uppercase">Musobaqalar</p>
                    </div>
                    <div>
                        <p className="font-black text-gray-900 text-sm flex items-center justify-center gap-1"><Award size={12} className="text-gray-400" />{club.achievementCount}</p>
                        <p className="text-[10px] text-gray-400 font-semibold uppercase">Yutuqlar</p>
                    </div>
                </div>

                <Button variant="primary" size="sm" className="w-full" onClick={() => navigate(`${clubBase}/${slug}`)}>
                    Batafsil
                </Button>
            </div>
        </div>
    );
};

export default ClubCard;
