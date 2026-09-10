import React, { useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth, ROLES } from '../../contexts/AuthContext';
import {
    LayoutDashboard,
    BookOpen,
    Calendar,
    Users,
    Award,
    GraduationCap,
    BarChart3,
    FileText,
    Settings,
    ClipboardList,
    Library,
    Trophy,
    Heart,
    Shirt,
    CheckSquare,
    Scale,
    Sparkles,
    Rocket,
    Target,
    Lightbulb,
    UserCheck,
    Building,
    Layers,
    Gift
} from 'lucide-react';
import { db } from '../../services/db';
import { getMenuBadges } from '../../utils/workQueue';

const Sidebar = ({ isOpen, onClose }) => {
    const { user, hasRole, isClubManager } = useAuth();
    const location = useLocation();

    // Menyudagi qizil raqamlar. JAMI ish emas, YANGI ish soni: foydalanuvchi tegishli
    // tabni ochgach raqam yo'qoladi (utils/workQueue.js dagi "o'qildi" modeli).
    // Manzil o'zgarganda qayta hisoblanadi - shu bilan bo'limga kirilgach raqam
    // darhol so'nadi.
    const badges = useMemo(
        () => db.withCachedReads(() => getMenuBadges(db, user, { isClubManager })),
        [user, isClubManager, location.pathname, location.search]
    );

    const studentMenuItems = [
        { icon: LayoutDashboard, label: 'Bosh sahifa', path: '/student/dashboard' },
        // Talabaning ikkala bali shu yerda: rasmiy indeks va umumiy skoring (TAS).
        // TAS ilgari "Mening profilim" sahifasida, menyuda ko'rinmaydigan joyda edi.
        { icon: BarChart3, label: 'Faollik va skoring', path: '/student/social-activity' },
        // Uchta alohida bo'lim ("Testlar", "Kutubxona", "Kitobxonlik testi")
        // bittaga birlashtirildi. Ular bir-biriga shu qadar yaqin ediki,
        // talaba qaysi biriga kirishni bilmasdi: kutubxona asarlar ro'yxati,
        // kitobxonlik testi esa AYNAN O'SHA asarlarning testlari edi.
        { icon: Library, label: 'Kutubxona va testlar', path: '/student/library' },
        { icon: Calendar, label: 'Tadbirlar', path: '/student/events' },
        { icon: Layers, label: 'Loyihalar', path: '/student/event-collections' },
        { icon: Users, label: 'Klublar', path: '/student/clubs' },
        // Klub koordinatorlari uchun - g'oliblarni rag'bat puliga taklif qilish.
        // FAQAT koordinatorga ko'rinadi: ilgari u hamma talabaga ko'rinardi va vakolati
        // yo'q talaba ochganda bo'sh sahifa bilan qolardi. Bo'sh sahifa "hali hech narsa
        // yo'q" degan xato taassurot berardi, holbuki bo'lim unga umuman tegishli emas.
        ...(isClubManager
            ? [{ icon: Gift, label: "Rag'bat va mukofot", path: '/student/incentive-awards' }]
            : []),
        // To'rtta alohida bo'lim ("Imkoniyatlar", "Stipendiyalar", "Yutuqlar va
        // imtiyozlar", "Mening rivojlanishim") bitta jamlovchi bo'limga birlashtirildi -
        // ular bir-birining davomi edi.
        { icon: Trophy, label: 'Yutuq va imkoniyatlar', path: '/student/achievements' },
        // CV alohida band: u talaba TASHQARIGA olib chiqadigan yagona hujjat,
        // yuqoridagi bo'lim esa universitet ichidagi jarayonlar. CV hujjat
        // boshqarmaydi - uni yuqoridagi bo'limdan o'qiydi.
        { icon: FileText, label: 'CV / Portfolio', path: '/student/cv' },
        // "Davomat" emas, "Ishtirokim": bu sahifa dars davomatini ko'rsatmaydi (u
        // HEMIS tomonida), tadbir va musobaqalardagi qatnashuvni ko'rsatadi.
        { icon: CheckSquare, label: 'Ishtirokim', path: '/student/attendance' },
        { icon: Shirt, label: 'Garderob', path: '/student/wardrobe' },
    ];

    const adminMenuItems = [
        { icon: LayoutDashboard, label: 'Bosh sahifa', path: '/admin/dashboard' },
        // 'Talabalar' menu item removed per Reytinglar refactor — the full StudentsManagement module now
        // lives inside Reytinglar -> "Global talabalar" tab, so this no longer needs its own entry point.
        // /admin/students itself is untouched and still resolves (App.jsx route unchanged) for anyone
        // with an old link/bookmark.
        { icon: Trophy, label: 'Klublar katalogi', path: '/admin/clubs-directory' },
        // Ikkita alohida yozuv ("Tadbirlar" va "Musobaqalar") bittaga
        // birlashtirildi: ular bir xil ish - faoliyat o'tkazish - va talaba
        // panelida ham allaqachon bitta bo'lim edi. Ichida ikkita tab.
        // `/admin/competitions` manzili ishlayveradi, faqat musobaqa tabi
        // ochilgan holda - eski havolalar buzilmasin.
        { icon: Calendar, label: 'Tadbirlar va musobaqalar', path: '/admin/events' },
        { icon: Layers, label: "Tadbirlar to'plami", path: '/admin/event-collections' },
        // "Ijtimoiy faollik" va "Reytinglar" bitta bo'lim bo'ldi: ikkalasi bir xil
        // narsani o'lchardi va har birida alohida talabalar ro'yxati bor edi, ya'ni
        // admin bitta talaba haqida ikki xil ballni ikki sahifada ko'rardi. Ichida
        // ikkita guruh: "Ish jarayoni" va "Tahlil" (ActivityAndRankingsPage.jsx).
        { icon: BarChart3, label: 'Ijtimoiy faollik va reyting', path: '/admin/social-activity' },
        // Indeksning 7-mezoni. "Tadbirlar" dan alohida turadi: Ma'rifat darsi
        // auditoriya kesimida rejalashtiriladi va davomat foizi shu doirada
        // hisoblanadi.
        { icon: Lightbulb, label: "Ma'rifat darslari", path: '/admin/marifat' },
        // "Taqdirlash reestri" va "Rag'bat va mukofot" bitta bo'lim bo'ldi: ular bir
        // zanjirning ikki yarmi edi (koordinator taklif qiladi -> admin tasdiqlaydi ->
        // natija reestrga tushadi), lekin menyuda ikki alohida element bo'lib turardi.
        // Ichida ikkita guruh: "Ish jarayoni" va "Reestr" (AwardsAndIncentivesPage.jsx).
        { icon: Trophy, label: "Taqdirlash va rag'bat", path: '/admin/awards' },
        { icon: FileText, label: 'Hisobotlar', path: '/admin/reports' },
        // "Testlar" va "Kutubxona" bittaga birlashtirildi: har asarning testi
        // baribir testlar bo'limida sozlanardi.
        { icon: Library, label: 'Kutubxona va testlar', path: '/admin/library' },
        // "Iqtidorli talabalar" va "Stipendiyalar" bitta bo'lim bo'ldi: Talent'ning
        // "Nomzodlar" tabi stipendiya arizasini yaratardi, ya'ni ular bir zanjirning
        // bo'laklari edi va menyu o'rtasida uzilardi. Ichida ikki guruh:
        // "Rivojlantirish" va "Stipendiya" (TalentAndScholarshipPage.jsx).
        { icon: Sparkles, label: 'Iqtidor va stipendiya', path: '/admin/talent' },
        { icon: BookOpen, label: 'Akademik ko\'rsatkich', path: '/admin/academic' },
        { icon: CheckSquare, label: 'Davomat', path: '/admin/attendance' },
        { icon: Shirt, label: 'Do\'kon', path: '/admin/wardrobe' },
        { icon: Settings, label: 'Sozlamalar', path: '/admin/settings' },
    ];

    const managementMenuItems = [
        { icon: LayoutDashboard, label: 'Bosh sahifa', path: '/management/dashboard' },
        { icon: BarChart3, label: 'Statistika', path: '/management/statistics' },
        { icon: Users, label: 'Klublar katalogi', path: '/management/clubs-directory' },
        { icon: Trophy, label: 'Reytinglar', path: '/management/rankings' },
        { icon: FileText, label: 'Hisobotlar', path: '/management/reports' },
        { icon: GraduationCap, label: 'Fakultetlar', path: '/management/faculties' },
        { icon: Sparkles, label: 'Talent Pipeline', path: '/management/talent' },
        { icon: Award, label: 'Stipendiyalar', path: '/management/scholarships' },
    ];

    // Tyutor menyusi ATAYLAB qisqa: uning vakolati biriktirilgan talabalar
    // doirasi bilan cheklangan, universitet miqyosidagi bo'limlar ko'rinmaydi.
    const tutorMenuItems = [
        { icon: UserCheck, label: 'Ish maydoni', path: '/tutor/workspace' },
        { icon: Lightbulb, label: "Ma'rifat darslari", path: '/tutor/marifat' },
    ];

    let menuItems = [];
    let base = '';
    if (hasRole(ROLES.STUDENT)) { menuItems = studentMenuItems; base = '/student'; }
    else if (hasRole(ROLES.ADMIN)) { menuItems = adminMenuItems; base = '/admin'; }
    else if (hasRole(ROLES.MANAGEMENT)) { menuItems = managementMenuItems; base = '/management'; }
    else if (hasRole(ROLES.TUTOR)) { menuItems = tutorMenuItems; base = '/tutor'; }

    // "Ariza baholash" - roldan qat'i nazar, faqat fakultet komissiyasiga biriktirilgan
    // akkauntga ko'rinadi. Platformada hali "dekan" roli yo'q, shuning uchun menyu ham
    // biriktiruv bo'yicha ochiladi (sahifaning o'zi ham xuddi shu tekshiruvni takrorlaydi).
    const isEvaluator = user?.username ? db.isScholarshipEvaluator(user.username) : false;
    if (base && isEvaluator) {
        menuItems = [...menuItems, {
            icon: Scale, label: 'Ariza baholash', path: `${base}/scholarship-evaluation`
        }];
    }

    // "Mening shogirdlarim" - xuddi shu tamoyil: rol emas, biriktiruv hal qiladi.
    // Mentor, tyutor va ilmiy rahbar bitta sahifani ko'radi.
    const isMentor = user?.username ? db.isTalentMentor(user.username) : false;
    if (base && isMentor) {
        menuItems = [...menuItems, {
            icon: Users, label: 'Mening shogirdlarim', path: `${base}/my-mentees`
        }];
    }

    // "Mening yotoqxonam" - yana o'sha tamoyil. Yotoqxona mudiri uchun alohida
    // rol ochilmadi: mavjud akkaunt yotoqxonaga biriktiriladi.
    const isDormLead = user?.username ? db.isDormResponsible(user.username) : false;
    if (base && isDormLead) {
        menuItems = [...menuItems, {
            icon: Building, label: 'Mening yotoqxonam', path: `${base}/my-dormitory`
        }];
    }

    return (
        <>
            {/* Mobile Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
                    onClick={onClose}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`
          fixed lg:sticky top-0 left-0 h-screen bg-white border-r border-gray-200 z-40
          transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          w-64 flex flex-col
        `}
            >
                {/* Sidebar Header - only visible on mobile */}
                <div className="lg:hidden p-4 border-b border-gray-200">
                    <div className="flex items-center">
                        <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-700 rounded-lg flex items-center justify-center shadow-md">
                            <span className="text-white font-bold text-xl">U</span>
                        </div>
                        <div className="ml-3">
                            <h1 className="text-lg font-bold gradient-text">UniPlatform</h1>
                        </div>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 overflow-y-auto p-4 space-y-1">
                    {menuItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            onClick={() => onClose && onClose()}
                            className={({ isActive }) =>
                                `flex items-center px-4 py-3 rounded-lg transition-all duration-200 group ${isActive
                                    ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-md'
                                    : 'text-gray-700 hover:bg-gray-100'
                                }`
                            }
                        >
                            {({ isActive }) => (
                                <>
                                    <item.icon
                                        className={`w-5 h-5 mr-3 ${isActive ? 'text-white' : 'text-gray-500 group-hover:text-primary-500'
                                            }`}
                                    />
                                    <span className="font-medium">{item.label}</span>
                                    {/* Nol bo'lsa umuman chizilmaydi - "0" yozib qo'yish
                                        e'tiborni behuda tortadi. */}
                                    {badges[item.path] > 0 && (
                                        <span
                                            className={`ml-auto shrink-0 min-w-[1.25rem] px-1.5 py-0.5 rounded-full text-[11px] font-black text-center ${
                                                isActive ? 'bg-white text-red-600' : 'bg-red-500 text-white'
                                            }`}
                                            title={`${badges[item.path]} ta yangi ish`}
                                        >
                                            {badges[item.path] > 99 ? '99+' : badges[item.path]}
                                        </span>
                                    )}
                                </>
                            )}
                        </NavLink>
                    ))}
                </nav>

                {/* Sidebar Footer */}
                <div className="p-4 border-t border-gray-200">
                    <div className="bg-gradient-to-br from-primary-50 to-primary-100 rounded-lg p-4">
                        <div className="flex items-center mb-2">
                            <Heart className="w-5 h-5 text-primary-500 mr-2" />
                            <span className="font-semibold text-primary-900">Yordam kerakmi?</span>
                        </div>
                        <p className="text-sm text-primary-700 mb-3">
                            Savollaringiz bo'lsa, biz bilan bog'laning
                        </p>
                        <button className="w-full bg-primary-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors">
                            Qo'llab-quvvatlash
                        </button>
                    </div>
                </div>
            </aside>
        </>
    );
};

export default Sidebar;
