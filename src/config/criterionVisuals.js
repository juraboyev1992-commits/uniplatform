import {
    BookOpen, Users, GraduationCap, Scale, Trophy,
    CalendarCheck, Lightbulb, HeartHandshake, Landmark, Dumbbell, Sparkles,
} from 'lucide-react';

// 11 mezonning ikonkasi va rangi.
//
// Alohida faylda turadi, chunki bir necha ekran (admin ro'yxati, talaba
// kabineti, hisobotlar) BIR XIL mezonni ko'rsatadi - ikonka joyiga qarab
// o'zgarsa, foydalanuvchi ularni boshqa-boshqa narsa deb o'ylaydi.
//
// Kalitlar INDEX_CRITERIA_ORDER bilan bir xil. Bu yerda faqat KO'RINISH bor:
// ball, ship va qoidalar socialActivityIndex.js da qoladi.
export const CRITERION_VISUALS = {
    READING: { icon: BookOpen, color: 'text-blue-600', bg: 'bg-blue-50' },
    CLUBS: { icon: Users, color: 'text-purple-600', bg: 'bg-purple-50' },
    ACADEMIC: { icon: GraduationCap, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    DISCIPLINE: { icon: Scale, color: 'text-rose-600', bg: 'bg-rose-50' },
    COMPETITIONS: { icon: Trophy, color: 'text-amber-600', bg: 'bg-amber-50' },
    ATTENDANCE: { icon: CalendarCheck, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    EDUCATION: { icon: Lightbulb, color: 'text-orange-600', bg: 'bg-orange-50' },
    VOLUNTEERING: { icon: HeartHandshake, color: 'text-pink-600', bg: 'bg-pink-50' },
    CULTURAL: { icon: Landmark, color: 'text-teal-600', bg: 'bg-teal-50' },
    SPORTS: { icon: Dumbbell, color: 'text-cyan-600', bg: 'bg-cyan-50' },
    OTHER: { icon: Sparkles, color: 'text-violet-600', bg: 'bg-violet-50' },
};

export const DEFAULT_CRITERION_VISUAL = { icon: Sparkles, color: 'text-gray-500', bg: 'bg-gray-50' };

export const criterionVisual = (key) => CRITERION_VISUALS[key] || DEFAULT_CRITERION_VISUAL;
