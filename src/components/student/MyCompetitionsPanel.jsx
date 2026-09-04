import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Calendar, MapPin, Users, ChevronRight, ListOrdered } from 'lucide-react';
import Card from '../common/Card';
import Badge from '../common/Badge';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';

// "Mening turnirlarim" - talaba ro'yxatdan o'tgan musobaqalar.
//
// Kalendar "nima bo'lyapti" degan savolga javob beradi va u yerda BARCHA turnir
// ko'rinadi. Bu ro'yxat esa "men qayerda qatnashyapman" degan boshqa savolga
// javob beradi - shuning uchun alohida turadi.
//
// Turnirning TURLARI bu yerda ham, kalendarda ham ro'yxat qilib ko'rsatilmaydi:
// jadval turnirning o'z sahifasida. Bu yerda faqat Turlar SONI ko'rinadi, ya'ni
// talaba "bu turnir necha bosqichdan iborat" degan tasavvurga ega bo'ladi.

const fmtDate = (d) => (d
    ? new Date(d).toLocaleDateString('uz-UZ', { day: '2-digit', month: 'long', year: 'numeric' })
    : 'Sana belgilanmagan');

const REGISTRATION_LABEL = {
    registered: { label: "Ro'yxatdan o'tgan", variant: 'success' },
    pending: { label: 'Tasdiq kutilmoqda', variant: 'warning' },
    waitlisted: { label: 'Navbatda', variant: 'info' },
    invited: { label: 'Taklif qilingan', variant: 'info' },
};

const MyCompetitionsPanel = () => {
    const navigate = useNavigate();
    const { user } = useAuth();

    const competitions = useMemo(
        () => db.getStudentCompetitions(user?.username),
        [user?.username]
    );

    if (competitions.length === 0) {
        return (
            <Card>
                <div className="p-10 text-center space-y-2">
                    <Trophy className="w-8 h-8 text-gray-300 mx-auto" />
                    <p className="text-sm font-semibold text-gray-600">Hali birorta turnirda qatnashmayapsiz</p>
                    <p className="text-xs text-gray-400">
                        Kalendardan turnirni tanlab ro'yxatdan o'ting — u shu yerda paydo bo'ladi.
                    </p>
                </div>
            </Card>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {competitions.map(c => {
                const reg = REGISTRATION_LABEL[c.registrationStatus] || { label: c.registrationStatus, variant: 'default' };
                return (
                    <Card
                        key={c.id}
                        hover
                        className="cursor-pointer transition-all transform hover:-translate-y-1 border-l-4 border-l-amber-500"
                        onClick={() => navigate(`/student/competitions/${c.id}`)}
                    >
                        <div className="flex items-start justify-between gap-2 mb-2">
                            <Badge variant={reg.variant} size="sm">{reg.label}</Badge>
                            {c.turCount > 0 && (
                                <span className="flex items-center gap-1 text-[11px] font-bold text-gray-400">
                                    <ListOrdered size={11} /> {c.turCount} Tur
                                </span>
                            )}
                        </div>

                        <h3 className="font-bold text-gray-900 mb-2">{c.title}</h3>

                        <div className="space-y-1.5 text-sm text-gray-600">
                            <div className="flex items-center">
                                <Calendar className="w-4 h-4 mr-2 text-gray-400 shrink-0" />
                                {fmtDate(c.date)}
                            </div>
                            {c.location && (
                                <div className="flex items-center">
                                    <MapPin className="w-4 h-4 mr-2 text-gray-400 shrink-0" />
                                    <span className="truncate">{c.location}</span>
                                </div>
                            )}
                            {c.teamName && (
                                <div className="flex items-center">
                                    <Users className="w-4 h-4 mr-2 text-gray-400 shrink-0" />
                                    <span className="truncate">{c.teamName}</span>
                                </div>
                            )}
                        </div>

                        <div className="mt-3 flex items-center gap-1 text-xs font-bold text-amber-600">
                            Jadval va natijalarni ko'rish <ChevronRight size={13} />
                        </div>
                    </Card>
                );
            })}
        </div>
    );
};

export default MyCompetitionsPanel;
