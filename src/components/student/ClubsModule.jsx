import React, { useState, useEffect } from 'react';
import {
    Users,
    Search,
    ShieldCheck,
    Target,
    Globe,
    Music,
    Dumbbell,
    BookOpen,
    Laptop,
    Plus,
    MessageCircle,
    ArrowLeft,
    Trophy
} from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import TournamentScoring from '../common/TournamentScoring';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';

const iconMap = {
    'San\'at': Music,
    'Sport': Dumbbell,
    'IT': Laptop,
    'Kitobxonlik': BookOpen,
    'Biznes': Target,
    'Default': Globe
};

const ClubsModule = () => {
    const { user, hasClubRole, refreshClubRoles } = useAuth();
    const [searchTerm, setSearchTerm] = useState('');
    const [allClubs, setAllClubs] = useState([]);
    const [myMemberships, setMyMemberships] = useState([]);
    const [selectedClubId, setSelectedClubId] = useState(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = () => {
        // Arxivlangan klublar ko'rsatilmaydi - ularga a'zo bo'lib bo'lmaydi.
        const clubs = db.getActiveClubs();
        setAllClubs(clubs);
        if (user) {
            // Real Supabase FK/RLS keys off the profile UUID (user.id), not the display username.
            setMyMemberships(db.getUserMemberships(user.id));
        }
    };

    const handleJoinClub = async (clubId) => {
        // Ariza orqali a'zo qabul qiladigan klubda `joinClub` xato beradi -
        // u shu yerda ko'rsatiladi, klub sahifasida esa ariza oynasi bor.
        try {
            await db.joinClub(user.id, clubId, 'member');
        } catch (e) {
            alert(e?.message || "A'zo bo'lib bo'lmadi");
            return;
        }
        loadData();
        refreshClubRoles();
        alert('Klubga muvaffaqiyatli a\'zo bo\'ldingiz!');
    };

    const isMember = (clubId) => {
        return myMemberships.some(m => m.clubId === clubId);
    };

    const filteredClubs = allClubs.filter(club => 
        club.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        club.category.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (selectedClubId) {
        const club = allClubs.find(c => c.id === selectedClubId);
        const Icon = iconMap[club?.category] || iconMap.Default;

        return (
            <div className="space-y-6">
                {/* Back button and Header */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={() => setSelectedClubId(null)}
                            className="p-2 text-gray-500 hover:bg-gray-100 rounded-xl transition-colors focus:outline-none focus:ring-0"
                        >
                            <ArrowLeft className="w-6 h-6 text-gray-700" />
                        </button>
                        <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center">
                            <Icon className="w-6 h-6 text-indigo-500" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900">{club?.name}</h2>
                            <span className="text-xs text-gray-500 capitalize">Klub Sahifasi • {club?.category}</span>
                        </div>
                    </div>
                    
                    <div className="flex gap-2">
                        <Badge variant="primary" size="md">
                            {club?.membersCount || 0} a'zo
                        </Badge>
                        <Badge variant="success" size="md">
                            Ball Ko'paytiruvchi: x{club?.pointsModifier || 1.0}
                        </Badge>
                    </div>
                </div>

                {/* Tournament Scoring Module embedded */}
                <div>
                    <TournamentScoring contextType="club" contextId={selectedClubId} title={`${club?.name} - Turnirlar va Baholash`} />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="bg-gradient-to-r from-orange-500 to-red-600 rounded-2xl p-8 text-white shadow-xl flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold mb-2">Klublar va To'garaklar</h1>
                    <p className="text-orange-100 italic">O'z qiziqishlaringiz bo'yicha jamoaga qo'shiling va faol bo'ling</p>
                </div>
                <div className="hidden lg:block">
                    <Button variant="outline" className="bg-white/20 border-white/30 text-white hover:bg-white/30" icon={Plus}>Yangi klub ochish so'rovi</Button>
                </div>
            </div>

            {/* My Clubs Section */}
            {myMemberships.length > 0 && (
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
                        <ShieldCheck className="w-6 h-6 mr-2 text-indigo-600" />
                        Mening Klublarim
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {myMemberships.map(membership => {
                            const club = allClubs.find(c => c.id === membership.clubId);
                            if (!club) return null;
                            const Icon = iconMap[club.category] || iconMap.Default;
                            
                            return (
                                <Card key={membership.id} className="border-t-4 border-t-indigo-500 hover:shadow-md transition-shadow">
                                    <div className="flex items-center gap-4 mb-3">
                                        <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center">
                                            <Icon className="w-6 h-6 text-indigo-500" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-gray-900 leading-tight">{club.name}</h3>
                                            <span className="text-xs text-gray-500 capitalize">{membership.role}</span>
                                        </div>
                                    </div>
                                    <Button variant="outline" size="sm" className="w-full" onClick={() => setSelectedClubId(club.id)}>Klub sahifasi</Button>
                                </Card>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Discover More Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    <div className="flex justify-between items-center">
                        <h2 className="text-2xl font-bold text-gray-900">Barcha Klublar</h2>
                        <div className="relative w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Qidiruv..."
                                className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filteredClubs.map(club => (
                            <Card key={club.id} className="flex justify-between items-center border-l-4 border-l-indigo-500 hover:shadow-md transition-shadow">
                                <div>
                                    <h4 className="font-bold text-gray-900">{club.name}</h4>
                                    <div className="flex gap-2 mt-1">
                                        <Badge variant="secondary" size="sm">{club.category}</Badge>
                                        <span className="text-xs text-gray-500 flex items-center">
                                            <Users className="w-3 h-3 mr-1" /> {club.membersCount || 0}
                                        </span>
                                    </div>
                                    {club.pointsModifier > 1 && (
                                        <span className="text-xs text-emerald-600 font-bold mt-1 block">Tadbirlarda x{club.pointsModifier} ball</span>
                                    )}
                                </div>
                                {isMember(club.id) ? (
                                    <div className="flex gap-2">
                                        <Button variant="ghost" size="sm" className="text-green-600 font-bold cursor-default">A'zo</Button>
                                        <Button variant="outline" size="sm" onClick={() => setSelectedClubId(club.id)}>Sahifa</Button>
                                    </div>
                                ) : (
                                    <Button variant="primary" size="sm" onClick={() => handleJoinClub(club.id)}>A'zo bo'lish</Button>
                                )}
                            </Card>
                        ))}
                        {filteredClubs.length === 0 && (
                            <p className="text-gray-500 col-span-full">Klublar topilmadi.</p>
                        )}
                    </div>
                </div>

                {/* Community Sidebar */}
                <Card title="Hamjamiyat" subtitle="Muloqot va muhokamalar">
                    <div className="space-y-4">
                        <div className="p-4 bg-gray-50 rounded-xl">
                            <p className="font-bold text-gray-900 text-sm">Umumiy Chat</p>
                            <p className="text-xs text-gray-500 mb-3">Barcha talabalar bu yerda</p>
                            <Button variant="primary" className="w-full" icon={MessageCircle}>Kirish</Button>
                        </div>
                        <div className="border-t border-gray-100 pt-4">
                            <p className="font-bold text-gray-900 text-sm mb-3">Eng yirik klublar</p>
                            <div className="space-y-3">
                                {allClubs.sort((a, b) => (b.membersCount || 0) - (a.membersCount || 0)).slice(0, 3).map((c, i) => (
                                    <div key={c.id} className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center font-bold text-indigo-600 text-xs">#{i + 1}</div>
                                        <div className="flex-1">
                                            <p className="text-sm font-medium text-gray-800">{c.name}</p>
                                            <div className="h-1 bg-gray-100 rounded-full mt-1">
                                                <div className="h-full bg-indigo-500 rounded-full" style={{ width: i === 0 ? '100%' : i === 1 ? '75%' : '50%' }}></div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default ClubsModule;
