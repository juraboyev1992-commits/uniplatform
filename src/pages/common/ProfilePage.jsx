import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
    User,
    Mail,
    Phone,
    MapPin,
    Camera,
    Shield,
    Bell,
    Lock,
    Award,
    Star,
    Edit3,
    Check
} from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { useAuth, ROLES } from '../../contexts/AuthContext';

// TAS (skoring) bloki bu sahifadan OLIB TASHLANDI — u endi "Faollik va skoring" bo'limida
// (pages/student/MyActivityAndScoringPage.jsx). Profil shaxsiy ma'lumot va sozlamalar uchun
// qoladi; skoring hisobi, grafiklari va PDF eksporti o'sha bo'limga ko'chdi, bu yerda faqat
// havola turadi. Shu sababli recharts / studentScoring / ScoreCardExport importlari ham
// kerak emas.
const ProfilePage = () => {
    const { user } = useAuth();
    const isStudent = user?.role === ROLES.STUDENT;
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState({
        displayName: user?.name || 'Anvar Azizov',
        email: 'anvar@unip.uz',
        phone: '+998 90 123 45 67',
        faculty: 'Dasturiy muhandislik',
        course: '3-kurs',
        bio: 'Dasturlash va robototexnikaga qiziqaman. Bo\'sh vaqtimda badiiy kitoblar o\'qiyman.'
    });

    const handleSave = () => {
        setIsEditing(false);
        // Mock save logic
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6 pb-12">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-900">Mening profilim</h1>
                <Button
                    variant={isEditing ? 'success' : 'outline'}
                    onClick={() => isEditing ? handleSave() : setIsEditing(true)}
                    className="flex items-center gap-2"
                >
                    {isEditing ? <Check size={18} /> : <Edit3 size={18} />}
                    {isEditing ? 'Saqlash' : 'Tahrirlash'}
                </Button>
            </div>

            {/* Profile Header */}
            <Card className="p-0 overflow-hidden border-none shadow-sm">
                <div className="h-32 bg-gradient-to-r from-indigo-600 to-blue-500"></div>
                <div className="px-8 pb-8">
                    <div className="relative -mt-16 flex items-end justify-between">
                        <div className="relative">
                            <div className="w-32 h-32 rounded-3xl bg-white p-2 shadow-xl">
                                <div className="w-full h-full rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                                    <User size={64} />
                                </div>
                            </div>
                            <button className="absolute bottom-2 right-2 p-2 bg-white rounded-xl shadow-lg border border-gray-100 text-gray-600 hover:text-indigo-600 transition-colors">
                                <Camera size={18} />
                            </button>
                        </div>
                        <div className="flex gap-4 mb-4">
                            <div className="text-center">
                                <p className="text-xl font-bold text-gray-900">94</p>
                                <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Ball</p>
                            </div>
                            <div className="w-px h-8 bg-gray-100 self-center"></div>
                            <div className="text-center">
                                <p className="text-xl font-bold text-gray-900">#3</p>
                                <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Reyting</p>
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <h2 className="text-2xl font-black text-gray-900">{formData.displayName}</h2>
                            <p className="text-gray-500 font-medium flex items-center gap-2">
                                <MapPin size={16} />
                                {formData.faculty} | {formData.course}
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <Badge variant="primary">Talaba</Badge>
                            <Badge variant="success">Faol</Badge>
                        </div>
                    </div>
                </div>
            </Card>

            {/* TAS bloki bu sahifadan "Faollik va skoring" bo'limiga ko'chirildi
                (pages/student/MyActivityAndScoringPage.jsx). Sababi: profil — shaxsiy
                ma'lumot va sozlamalar sahifasi, talabaning eng muhim raqami esa menyuda
                ko'rinadigan joyda turishi kerak edi. Bu yerda faqat havola qoladi. */}
            {isStudent && (
                <Card className="p-5 border-none bg-white/80">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                            <p className="font-bold text-gray-900">Skoring va ijtimoiy faollik</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                                Ballaringiz, ular qaysi yozuvdan chiqqani va nima yetishmayotgani
                            </p>
                        </div>
                        <Link
                            to="/student/social-activity?bolim=skoring"
                            className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700"
                        >
                            Skoringni ochish
                        </Link>
                    </div>
                </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Left Column - Details */}
                <div className="md:col-span-2 space-y-6">
                    <Card className="p-6 border-none bg-white/80">
                        <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
                            <User size={20} className="text-indigo-600" />
                            Shaxsiy ma'lumotlar
                        </h3>
                        {isEditing ? (
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-gray-400 uppercase">F.I.SH.</label>
                                        <input
                                            type="text"
                                            className="w-full px-4 py-2 border border-gray-100 rounded-xl focus:ring-2 focus:ring-indigo-500/20"
                                            value={formData.displayName}
                                            onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-gray-400 uppercase">Email</label>
                                        <input
                                            type="email"
                                            className="w-full px-4 py-2 border border-gray-100 rounded-xl focus:ring-2 focus:ring-indigo-500/20"
                                            value={formData.email}
                                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-gray-400 uppercase">Telefon</label>
                                        <input
                                            type="text"
                                            className="w-full px-4 py-2 border border-gray-100 rounded-xl focus:ring-2 focus:ring-indigo-500/20"
                                            value={formData.phone}
                                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-gray-400 uppercase">Bio</label>
                                    <textarea
                                        className="w-full px-4 py-2 border border-gray-100 rounded-xl focus:ring-2 focus:ring-indigo-500/20"
                                        rows="3"
                                        value={formData.bio}
                                        onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-4">
                                <div className="flex items-start gap-3">
                                    <Mail className="text-gray-400 mt-1" size={18} />
                                    <div>
                                        <p className="text-xs font-bold text-gray-400 uppercase">Email</p>
                                        <p className="text-sm font-semibold text-gray-700">{formData.email}</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <Phone className="text-gray-400 mt-1" size={18} />
                                    <div>
                                        <p className="text-xs font-bold text-gray-400 uppercase">Telefon</p>
                                        <p className="text-sm font-semibold text-gray-700">{formData.phone}</p>
                                    </div>
                                </div>
                                <div className="md:col-span-2 flex items-start gap-3">
                                    <Edit3 className="text-gray-400 mt-1" size={18} />
                                    <div>
                                        <p className="text-xs font-bold text-gray-400 uppercase">Bio</p>
                                        <p className="text-sm text-gray-600 mt-1">{formData.bio}</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </Card>

                    <Card className="p-6 border-none bg-white/80">
                        <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
                            <Award size={20} className="text-amber-500" />
                            Yutuqlar
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {[
                                { label: 'Kitobxon', icon: Star, color: 'text-amber-500' },
                                { label: 'Sportchi', icon: Star, color: 'text-indigo-500' },
                                { label: 'Volontyor', icon: Star, color: 'text-emerald-500' },
                                { label: 'Innovator', icon: Star, color: 'text-rose-500' },
                            ].map((badge, i) => (
                                <div key={i} className="text-center p-4 bg-gray-50 rounded-2xl flex flex-col items-center gap-2 border border-gray-100 shadow-sm">
                                    <badge.icon className={badge.color} size={24} fill="currentColor" />
                                    <span className="text-xs font-bold text-gray-700">{badge.label}</span>
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>

                {/* Right Column - Security & Settings */}
                <div className="space-y-6">
                    <Card className="p-6 border-none bg-white/80">
                        <h3 className="text-md font-bold text-gray-900 mb-4 flex items-center gap-2">
                            <Shield size={18} className="text-emerald-500" />
                            Xavfsizlik
                        </h3>
                        <div className="space-y-3">
                            <button className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700">
                                <span className="flex items-center gap-3">
                                    <Lock size={16} />
                                    Parolni o'zgartirish
                                </span>
                            </button>
                            <button className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700">
                                <span className="flex items-center gap-3">
                                    <Shield size={16} />
                                    2FA himoyasi
                                </span>
                                <Badge variant="secondary">OFF</Badge>
                            </button>
                        </div>
                    </Card>

                    <Card className="p-6 border-none bg-white/80">
                        <h3 className="text-md font-bold text-gray-900 mb-4 flex items-center gap-2">
                            <Bell size={18} className="text-blue-500" />
                            Bildirishnomalar
                        </h3>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-700">Email bildirishnomalar</span>
                                <div className="w-10 h-5 bg-indigo-600 rounded-full relative">
                                    <div className="absolute right-1 top-1 w-3 h-3 bg-white rounded-full"></div>
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-700">Tizim bildirishnomalari</span>
                                <div className="w-10 h-5 bg-indigo-600 rounded-full relative">
                                    <div className="absolute right-1 top-1 w-3 h-3 bg-white rounded-full"></div>
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default ProfilePage;
