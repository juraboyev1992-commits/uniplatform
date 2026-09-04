import React, { useState, useEffect } from 'react';
import { Trophy, Medal, Star, TrendingUp } from 'lucide-react';
import Card from '../../components/common/Card';
import { db } from '../../services/db';

const LeaderboardModule = () => {
    const [leaderboard, setLeaderboard] = useState([]);

    useEffect(() => {
        // Build leaderboard from DB
        const scores = db.getScores();
        const userTotals = {};
        scores.forEach(s => {
            userTotals[s.userId] = (userTotals[s.userId] || 0) + s.points;
        });

        const sorted = Object.entries(userTotals)
            .map(([userId, total]) => ({ userId, total }))
            .sort((a, b) => b.total - a.total);

        // Add dummy students to make it look full if we don't have enough data
        if (sorted.length < 5) {
            sorted.push({ userId: 'Karimova N.', total: 120 });
            sorted.push({ userId: 'Azizov S.', total: 85 });
            sorted.push({ userId: 'Rahimov T.', total: 60 });
            sorted.sort((a, b) => b.total - a.total);
        }

        setLeaderboard(sorted);
    }, []);

    const getMedalColor = (index) => {
        if (index === 0) return 'text-yellow-500 bg-yellow-100';
        if (index === 1) return 'text-gray-400 bg-gray-100';
        if (index === 2) return 'text-amber-700 bg-amber-100';
        return 'text-indigo-500 bg-indigo-50';
    };

    return (
        <Card title="Umumiy Reyting" subtitle="Eng faol talabalar" icon={Trophy} className="border-t-4 border-t-yellow-400">
            <div className="space-y-4">
                {leaderboard.map((user, index) => (
                    <div key={user.userId + index} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-xl transition-colors border border-transparent hover:border-gray-100">
                        <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${getMedalColor(index)}`}>
                                {index < 3 ? <Medal size={20} /> : index + 1}
                            </div>
                            <div>
                                <h4 className="font-bold text-gray-900">{user.userId === 'talaba' ? 'Siz (Aliyev Sardor)' : user.userId}</h4>
                                <div className="flex items-center text-xs text-gray-500 gap-1">
                                    <Star size={12} className="text-yellow-400" /> 
                                    Top {(index + 1) * 5}%
                                </div>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="font-black text-lg text-indigo-600">{user.total}</div>
                            <div className="text-[10px] uppercase font-bold text-gray-400">Ball</div>
                        </div>
                    </div>
                ))}
            </div>
            <div className="mt-6 pt-4 border-t border-gray-100 text-center">
                <button className="text-sm font-bold text-indigo-600 flex items-center justify-center w-full gap-2 hover:text-indigo-800 transition-colors">
                    <TrendingUp size={16} /> Barcha reytingni ko'rish
                </button>
            </div>
        </Card>
    );
};

export default LeaderboardModule;
