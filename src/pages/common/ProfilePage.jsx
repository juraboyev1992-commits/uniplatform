import React, { useMemo, useRef, useState } from 'react';
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
    Check,
    Trophy,
    UserCheck
} from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import ScoreCardExport from '../../components/common/ScoreCardExport';
import TasVerificationFooter from '../../components/common/TasVerificationFooter';
import { db } from '../../services/db';
import { useAuth, ROLES } from '../../contexts/AuthContext';
import { computeStudentTAS, TAS_TIERS, TAS_MAX_TOTAL } from '../../utils/studentScoring';
import { TasBreakdownRows, TasSourceList } from '../../components/common/TasBreakdown';

const ProfilePage = () => {
    const { user } = useAuth();
    const isStudent = user?.role === ROLES.STUDENT;
    // NOTE: `user.username` is the mock-login identity ('talaba'), a separate id space from the
    // generateMockStudents() pool db.js's student-domain functions expect (see studentScoring.js) —
    // db.getStudentPortfolio/getSocialApplications naturally return empty/zero for it rather than a
    // fabricated match. Endi TAS'ning to'rt o'lchovi ham HAQIQIY yozuvdan olingani uchun bunday
    // akkauntda ko'rsatkichlar "Ma'lumot yo'q" bo'lib chiqadi — bu to'g'ri xatti-harakat: ilgari
    // o'sha bo'sh holat ham urug'lantirilgan tasodifiy son bilan to'ldirilib ketardi.
    const tas = useMemo(() => (isStudent && user?.username ? computeStudentTAS(db, user.username) : null), [isStudent, user?.username]);
    const skoringRef = useRef(null);
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

            {/* Skoring — Talaba Analitik Skori (TAS), student-only, additive. Same computeStudentTAS
                function StudentsManagement.jsx's admin modal uses for this same student id, so the two
                surfaces always agree on the numbers. */}
            {isStudent && tas && (
                <div className="space-y-4" ref={skoringRef}>
                    <div className="flex items-center justify-between" data-html2canvas-ignore="true">
                        <h3 className="text-lg font-bold text-gray-900">Skoring</h3>
                        <ScoreCardExport
                            contentRef={skoringRef}
                            fileName={`${formData.displayName}_TAS_hisobot`}
                        />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-3xl p-5 text-white flex items-center gap-5 shadow-lg">
                            <div className="relative w-28 h-28 shrink-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={[{ value: tas.total }, { value: Math.max(0, TAS_MAX_TOTAL - tas.total) }]}
                                            dataKey="value" startAngle={90} endAngle={-270}
                                            innerRadius={38} outerRadius={50} stroke="none"
                                        >
                                            <Cell fill="#ffffff" />
                                            <Cell fill="rgba(255,255,255,0.2)" />
                                        </Pie>
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <span className="text-xl font-black">{tas.total}</span>
                                    <span className="text-[10px] text-white/70 font-bold">/ 1000</span>
                                </div>
                            </div>
                            <div className="min-w-0">
                                <h4 className="font-bold text-sm">Talaba Analitik Skori (TAS)</h4>
                                <p className="text-xs text-white/70 mt-1 leading-relaxed">
                                    TAS — talabaning akademik muvaffaqiyati, ijtimoiy faolligi, liderlik salohiyati va intizomiy ishonchliligini kompleks baholaydigan analitik ko'rsatkich.
                                </p>
                                {/* "O'tgan oyga nisbatan" belgisi olib tashlandi: oldingi oyning bali
                                    hech qayerda saqlanmaydi, shuning uchun u sun'iy chiziqdan
                                    hisoblanardi. O'rniga hisobning to'liqligi ko'rsatiladi. */}
                                <span className={`inline-flex items-center gap-1 mt-2 px-2.5 py-1 rounded-full text-[11px] font-bold ${tas.complete ? 'bg-emerald-400/90 text-emerald-950' : 'bg-amber-300/90 text-amber-950'}`}>
                                    {tas.complete
                                        ? "To'rt o'lchov ham hisoblandi"
                                        : `${tas.dimensionCount} o'lchovdan ${tas.measuredCount} tasi hisoblandi`}
                                </span>
                            </div>
                        </div>

                        <div className="bg-white/80 rounded-3xl p-5 border border-gray-100">
                            <p className="text-xs font-bold text-gray-700 mb-2">Skor tarkibi</p>
                            <TasBreakdownRows tas={tas} />
                        </div>
                    </div>

                    {/* Ilgari bu joyda "Skor dinamikasi (so'nggi 6 oy)" grafigi turardi. Ball
                        suratlari (snapshot) saqlanmagani uchun oldingi oylarning bali ma'lum emas
                        edi — chiziq oxirgi baldan orqaga qarab o'ylab topilardi. O'rniga har bir
                        o'lchov qaysi yozuvdan chiqqani ko'rsatiladi: talaba o'z balini tekshira
                        oladi va nima yetishmayotganini ko'radi. */}
                    <div className="bg-white/80 rounded-3xl p-5 border border-gray-100">
                        <p className="text-xs font-bold text-gray-700 mb-3">Skor manbalari</p>
                        <TasSourceList tas={tas} />
                        {tas.pending.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-gray-100">
                                <p className="text-[11px] font-bold text-amber-600 mb-1">Hisoblanmagan o'lchovlar</p>
                                {tas.pending.map(p => (
                                    <p key={p.key} className="text-[11px] text-gray-500">{p.label} — {p.missing}</p>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="bg-white/80 rounded-3xl p-5 border border-gray-100">
                            <p className="text-xs font-bold text-gray-700 mb-3 flex items-center gap-1.5"><Trophy size={13} className="text-amber-500" /> Reyting darajalari</p>
                            <div className="space-y-1.5">
                                {TAS_TIERS.map(t => (
                                    <div
                                        key={t.label}
                                        className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs ${tas.tier === t.label ? 'bg-indigo-50 border border-indigo-200 font-bold text-indigo-700' : 'text-gray-500'}`}
                                    >
                                        <span>{t.label}</span>
                                        <span>{t.range}</span>
                                    </div>
                                ))}
                            </div>
                            {!tas.complete && (
                                <p className="text-[11px] text-amber-600 mt-2">
                                    Daraja hali belgilanmadi — barcha o'lchovlar hisoblanishi kerak.
                                </p>
                            )}
                        </div>

                        {tas.recommendations.length > 0 && (
                            <div className="bg-indigo-50 rounded-3xl p-5" data-html2canvas-ignore="true">
                                <p className="text-xs font-bold text-indigo-700 mb-3">Rivojlanish tavsiyalari</p>
                                <div className="space-y-2">
                                    {tas.recommendations.map((r, i) => (
                                        <div key={i} className="flex items-start gap-2.5 bg-white rounded-xl p-3">
                                            <UserCheck size={15} className="text-emerald-500 shrink-0 mt-0.5" />
                                            <div className="min-w-0">
                                                <p className="text-xs font-bold text-gray-800">{r.text}</p>
                                                <p className="text-[11px] text-gray-500 mt-0.5">{r.detail}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="bg-white/80 rounded-3xl p-5 border border-gray-100">
                        <p className="text-xs font-bold text-gray-700 mb-3">Faoliyat tarixi</p>
                        {tas.activityHistory.length === 0 ? (
                            <p className="text-xs text-gray-400">Tasdiqlangan faoliyat topilmadi</p>
                        ) : (
                            <div className="space-y-3">
                                {tas.activityHistory.map((h, i) => (
                                    <div key={i} className="relative pl-4 border-l-2 border-indigo-100 flex items-center justify-between gap-2">
                                        <span className="absolute -left-[5px] top-1 w-2 h-2 rounded-full bg-indigo-500" />
                                        <div className="min-w-0">
                                            <p className="text-xs font-semibold text-gray-800 truncate">{h.title}</p>
                                            <p className="text-[10px] text-gray-400">{new Date(h.date).toLocaleDateString('uz-UZ')}</p>
                                        </div>
                                        <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full shrink-0">+{h.delta}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <TasVerificationFooter verifyId={`TAS-${user.username}`} />
                </div>
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
