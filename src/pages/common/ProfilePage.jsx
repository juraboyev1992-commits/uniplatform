import React, { useEffect, useState } from 'react';
import { db } from '../../services/db';
import {
    NOTIFICATION_TYPES, NOTIFICATION_TYPE_ORDER,
} from '../../config/notificationTypes';
import { Link } from 'react-router-dom';
import {
    User,
    Mail,
    Phone,
    MapPin,
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
    // Bildirishnoma sozlamalari. Ilgari bu yerda ikkita SOXTA tugma turardi - oddiy
    // `div`, bosilmasdi va hech qayerga saqlanmasdi.
    const [notifPrefs, setNotifPrefs] = useState(
        () => (user?.username ? db.getNotificationPrefs(user.username) : {})
    );
    const toggleNotif = (typeId, next) => {
        db.setNotificationPref(user?.username, typeId, next);
        setNotifPrefs(db.getNotificationPrefs(user?.username));
    };
    // ALOQA MA'LUMOTLARI - talabaning raqamli pasportidan.
    //
    // Ilgari bu yerda SOXTA qiymatlar turardi: "Anvar Azizov",
    // "anvar@unip.uz", "Dasturiy muhandislik", "3-kurs" va o'ylab topilgan
    // bio. Ular ZAXIRA emas, DOIMIY edi - `user` obyektida `name` degan
    // maydon umuman yo'q (u `fullName` deb ataladi), shuning uchun
    // `user?.name || 'Anvar Azizov'` HAR DOIM "Anvar Azizov" ni berardi.
    // Ya'ni har bir foydalanuvchi begona odamning ismini o'z profilida
    // ko'rib turardi.
    //
    // Pasport LOGIN bo'yicha kalitlanadi (`student_id = current_username()`),
    // shuning uchun talaba o'zinikini o'qiy va yoza oladi.
    const [contact, setContact] = useState({ phone: '', email: '' });
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');

    useEffect(() => {
        if (!user?.username) return;
        const passport = db.getStudentPassportRaw(user.username);
        setContact({
            phone: passport?.sections?.contact?.phone || '',
            email: passport?.sections?.contact?.email || '',
        });
    }, [user?.username]);

    // Ism, fakultet, kurs va guruh BU YERDA TAHRIRLANMAYDI: ular rasmiy
    // ma'lumot va HEMIS/import orqali keladi. Talaba o'zini boshqa
    // fakultetga yozib qo'ya olmasligi kerak.
    const handleSave = async () => {
        if (saving) return;
        setSaving(true);
        setSaveError('');
        try {
            await db.setPassportFields({
                studentId: user.username,
                values: {
                    'contact.phone': contact.phone.trim(),
                    'contact.email': contact.email.trim(),
                },
                source: 'self',
                by: user.username,
            });
            setIsEditing(false);
        } catch (e) {
            setSaveError(e?.message || 'Saqlanmadi');
        } finally {
            setSaving(false);
        }
    };

    // Bo'sh qiymat o'rniga o'ylab topilgan matn EMAS, ochiq "yo'q".
    const shown = (v) => (String(v ?? '').trim() || "Ma'lumot yo'q");

    return (
        <div className="max-w-4xl mx-auto space-y-6 pb-12">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-900">Mening profilim</h1>
                <Button
                    variant={isEditing ? 'success' : 'outline'}
                    onClick={() => (isEditing ? handleSave() : setIsEditing(true))}
                    disabled={saving}
                    className="flex items-center gap-2"
                >
                    {isEditing ? <Check size={18} /> : <Edit3 size={18} />}
                    {isEditing ? (saving ? 'Saqlanmoqda...' : 'Saqlash') : 'Tahrirlash'}
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
                            {/* Rasm yuklash tugmasi OLIB TASHLANDI: u hech
                                narsa qilmasdi. Ishlamaydigan tugma
                                foydalanuvchini aldaydi - u bosadi va
                                nimadir bo'lishini kutadi. */}
                        </div>
                        {/* "94 ball" va "#3 reyting" OLIB TASHLANDI: ikkalasi
                            ham kodga qattiq yozilgan edi, ya'ni har kimga bir
                            xil ko'rinardi va hech qanday hisobga tayanmasdi.
                            Haqiqiy ball pastdagi "Skoringni ochish" havolasi
                            ortida - u yerda raqam manbasi bilan ko'rsatiladi. */}
                    </div>

                    <div className="mt-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <h2 className="text-2xl font-black text-gray-900">
                                {shown(user?.fullName)}
                            </h2>
                            <p className="text-gray-500 font-medium flex items-center gap-2">
                                <MapPin size={16} />
                                {isStudent
                                    ? [user?.faculty, user?.course && `${user.course}-kurs`, user?.group]
                                        .filter(Boolean).join(' | ') || "Ma'lumot yo'q"
                                    : shown(user?.username)}
                            </p>
                        </div>
                        <div className="flex gap-2">
                            {/* Rol HAQIQIY qiymatdan. Ilgari bu yerda har
                                kimga "Talaba" va "Faol" yozilardi - hatto
                                administrator ham o'zini talaba deb ko'rardi. */}
                            <Badge variant="primary">{shown(user?.role)}</Badge>
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
                                {/* F.I.Sh., fakultet va kurs BU YERDA
                                    TAHRIRLANMAYDI - ular rasmiy ma'lumot va
                                    import/HEMIS orqali keladi. Ilgari ism
                                    tahrirlanadigandek ko'rinardi, lekin
                                    saqlash hech qayerga yozmasdi. */}
                                <p className="text-[11px] text-gray-500 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 leading-relaxed">
                                    F.I.Sh., fakultet, kurs va guruh rasmiy ma&rsquo;lumot &mdash;
                                    ularni o&rsquo;zgartirish uchun bo&rsquo;limga murojaat qiling.
                                    Bu yerda aloqa ma&rsquo;lumotlaringizni yangilaysiz.
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-gray-400 uppercase">Email</label>
                                        <input
                                            type="email"
                                            className="w-full px-4 py-2 border border-gray-100 rounded-xl focus:ring-2 focus:ring-indigo-500/20"
                                            value={contact.email}
                                            placeholder="misol@gmail.com"
                                            onChange={(e) => setContact({ ...contact, email: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-gray-400 uppercase">Telefon</label>
                                        <input
                                            type="text"
                                            className="w-full px-4 py-2 border border-gray-100 rounded-xl focus:ring-2 focus:ring-indigo-500/20"
                                            value={contact.phone}
                                            placeholder="+998 90 123 45 67"
                                            onChange={(e) => setContact({ ...contact, phone: e.target.value })}
                                        />
                                    </div>
                                </div>
                                {saveError && (
                                    <p className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                                        {saveError}
                                    </p>
                                )}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-4">
                                <div className="flex items-start gap-3">
                                    <User className="text-gray-400 mt-1" size={18} />
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-gray-400 uppercase">F.I.Sh.</p>
                                        <p className="text-sm font-semibold text-gray-700">{shown(user?.fullName)}</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <Shield className="text-gray-400 mt-1" size={18} />
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-gray-400 uppercase">Login</p>
                                        <p className="text-sm font-semibold text-gray-700">{shown(user?.username)}</p>
                                    </div>
                                </div>
                                {isStudent && (
                                    <>
                                        <div className="flex items-start gap-3">
                                            <MapPin className="text-gray-400 mt-1" size={18} />
                                            <div className="min-w-0">
                                                <p className="text-xs font-bold text-gray-400 uppercase">Fakultet</p>
                                                <p className="text-sm font-semibold text-gray-700">{shown(user?.faculty)}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-3">
                                            <Award className="text-gray-400 mt-1" size={18} />
                                            <div className="min-w-0">
                                                <p className="text-xs font-bold text-gray-400 uppercase">Kurs va guruh</p>
                                                <p className="text-sm font-semibold text-gray-700">
                                                    {[user?.course && `${user.course}-kurs`, user?.group]
                                                        .filter(Boolean).join(', ') || "Ma'lumot yo'q"}
                                                </p>
                                            </div>
                                        </div>
                                    </>
                                )}
                                <div className="flex items-start gap-3">
                                    <Mail className="text-gray-400 mt-1" size={18} />
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-gray-400 uppercase">Email</p>
                                        <p className="text-sm font-semibold text-gray-700 break-words">{shown(contact.email)}</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <Phone className="text-gray-400 mt-1" size={18} />
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-gray-400 uppercase">Telefon</p>
                                        <p className="text-sm font-semibold text-gray-700">{shown(contact.phone)}</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </Card>

                    {/* SOXTA NISHONLAR OLIB TASHLANDI.
                        Ilgari bu yerda "Kitobxon / Sportchi / Volontyor /
                        Innovator" degan to'rtta nishon turardi - kodga
                        qattiq yozilgan va HAR BIR foydalanuvchiga bir xil
                        ko'rinardi. Ya'ni hech narsa qilmagan talaba ham
                        o'zini to'rt yo'nalishda yutuqli deb ko'rardi.
                        Haqiqiy yutuqlar alohida bo'limda, berilgan
                        diplom va e'tiroflardan hisoblanadi. */}
                    {isStudent && (
                    <Card className="p-5 border-none bg-white/80">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                                <p className="font-bold text-gray-900 flex items-center gap-2">
                                    <Award size={18} className="text-amber-500" />
                                    Yutuqlar va imkoniyatlar
                                </p>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Diplomlar, e&rsquo;tiroflar va sizga mos imkoniyatlar
                                </p>
                            </div>
                            <Link
                                to="/student/achievements"
                                className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600"
                            >
                                Ochish
                            </Link>
                        </div>
                    </Card>
                    )}
                </div>

                {/* Right Column - Security & Settings */}
                <div className="space-y-6">
                    <Card className="p-6 border-none bg-white/80">
                        <h3 className="text-md font-bold text-gray-900 mb-4 flex items-center gap-2">
                            <Shield size={18} className="text-emerald-500" />
                            Xavfsizlik
                        </h3>
                        <div className="space-y-3">
                            {/* IKKALA TUGMA HAM OLIB TASHLANDI - ular hech
                                narsa qilmasdi (`onClick` yo'q edi).
                                "Parolni o'zgartirish" bosilganda hech nima
                                bo'lmasdi, "2FA himoyasi" esa platformada
                                umuman yo'q funksiyani "OFF" deb ko'rsatib
                                turardi.
                                Ishlamaydigan tugma yo'q tugmadan yomonroq:
                                foydalanuvchi bosadi, kutadi va tizimga
                                ishonchini yo'qotadi. */}
                            <p className="text-xs text-gray-500 leading-relaxed">
                                Parolni o&rsquo;zgartirish uchun hozircha administratorga
                                murojaat qiling.
                            </p>
                        </div>
                    </Card>

                    <Card className="p-6 border-none bg-white/80">
                        <h3 className="text-md font-bold text-gray-900 mb-4 flex items-center gap-2">
                            <Bell size={18} className="text-blue-500" />
                            Bildirishnomalar
                        </h3>
                        <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                            Qaysi xabarlar kelishini o'zingiz belgilaysiz. Ba'zilari o'chirilmaydi —
                            ular xabar emas, sizdan kutilayotgan <b>ish</b>.
                        </p>
                        <div className="space-y-3">
                            {NOTIFICATION_TYPE_ORDER
                                // Xodimlarga mo'ljallangan turlar talabaga ko'rsatilmaydi va aksincha.
                                .filter(id => (NOTIFICATION_TYPES[id].audience === 'staff') !== isStudent)
                                .map(id => {
                                    const t = NOTIFICATION_TYPES[id];
                                    const on = notifPrefs[id] !== false;
                                    return (
                                        <div key={id} className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-gray-800">{t.label}</p>
                                                <p className="text-[11px] text-gray-500">{t.description}</p>
                                                {!t.optional && (
                                                    <p className="text-[11px] text-amber-600 mt-0.5">
                                                        O'chirib bo'lmaydi — {t.reason}
                                                    </p>
                                                )}
                                            </div>
                                            <button
                                                type="button"
                                                role="switch"
                                                aria-checked={on}
                                                aria-label={t.label}
                                                disabled={!t.optional}
                                                onClick={() => toggleNotif(id, !on)}
                                                className={`w-10 h-5 rounded-full relative shrink-0 mt-0.5 transition-colors ${
                                                    on ? 'bg-indigo-600' : 'bg-gray-300'
                                                } ${t.optional ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'}`}
                                            >
                                                <span className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${
                                                    on ? 'right-1' : 'left-1'
                                                }`} />
                                            </button>
                                        </div>
                                    );
                                })}
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default ProfilePage;
