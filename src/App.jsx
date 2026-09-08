import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useSearchParams, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth, ROLES } from './contexts/AuthContext';
import DashboardLayout from './components/layout/DashboardLayout';
import LoginPage from './pages/auth/LoginPage';
import StudentDashboard from './pages/student/StudentDashboard';
import SocialActivityIndex from './pages/student/SocialActivityIndex';
import TestsModule from './components/student/TestsModule';
import LibraryModule from './components/student/LibraryModule';
import ReadingModule from './components/student/ReadingModule';
import EventsCalendar from './components/student/EventsCalendar';
import AttendanceModule from './components/student/AttendanceModule';
import ScholarshipsModule from './components/student/ScholarshipsModule';
import WardrobeModule from './components/student/WardrobeModule';
import CertificatesPage from './pages/student/CertificatesPage';
import AchievementsPage from './pages/student/AchievementsPage';
import MyDevelopmentPage from './pages/student/MyDevelopmentPage';
import OpportunitiesPage from './pages/student/OpportunitiesPage';
import AchievementsHubPage from './pages/student/AchievementsHubPage';
import AdminDashboard from './pages/admin/AdminDashboard';
import TestManagement from './components/admin/TestManagement';
import EventManagement from './components/admin/EventManagement';
import SocialActivityManagement from './components/admin/SocialActivityManagement';
import ActivityAndRankingsPage from './pages/admin/ActivityAndRankingsPage';
import MarifatLessonsPage from './pages/admin/MarifatLessonsPage';
import TutorWorkspacePage from './pages/tutor/TutorWorkspacePage';

import ReportingModule from './components/admin/ReportingModule';
// LibraryManagement.jsx MARSHRUTDAN CHIQARILDI: uning butun mazmuni
// (ReadingTestsPanel) endi "Kutubxona va testlar" bo'limining "Kitoblar"
// tabi ichida. Fayl diskda qoldirildi - loyihadagi boshqa iste'mol
// qilingan ekranlar bilan bir xil tartib.
import ScholarshipManagement from './components/admin/ScholarshipManagement';
import AttendanceManagement from './components/admin/AttendanceManagement';
import WardrobeManagement from './components/admin/WardrobeManagement';
import StudentsManagement from './components/admin/StudentsManagement';
import SettingsPage from './pages/admin/SettingsPage';
import AwardRegistryPage from './pages/admin/AwardRegistryPage';
import AcademicRecordsPage from './pages/admin/AcademicRecordsPage';
import TalentModulePage from './pages/admin/TalentModulePage';
import ManagementDashboard from './pages/management/ManagementDashboard';
import StatisticsPage from './pages/management/StatisticsPage';
import RankingsPage from './pages/management/RankingsPage';
import ReportsPage from './pages/management/ReportsPage';
import FacultiesPage from './pages/management/FacultiesPage';
import ScholarshipsOverviewPage from './pages/management/ScholarshipsOverviewPage';
import TalentPipelinePage from './pages/management/TalentPipelinePage';
import NotificationList from './pages/common/NotificationList';
import ScholarshipEvaluationPage from './pages/common/ScholarshipEvaluationPage';
import MyMenteesPage from './pages/common/MyMenteesPage';
import MyDormitoryPage from './pages/common/MyDormitoryPage';
import ProfilePage from './pages/common/ProfilePage';
import CompetitionWorkspacePage from './pages/admin/CompetitionWorkspacePage';
import EventWorkspacePage from './pages/admin/EventWorkspacePage';
import ReadingTestsModule from './components/student/ReadingTestsModule';
import LibraryAndTestsPage from './pages/student/LibraryAndTestsPage';
import ClubsDirectoryPage from './components/clubs/ClubsDirectoryPage';
import ClubProfilePage from './components/clubs/ClubProfilePage';
import TeamProfilePage from './components/clubs/TeamProfilePage';
import CompetitionLiveScreenPage from './pages/public/CompetitionLiveScreenPage';
import PublicActivityPage from './pages/public/PublicActivityPage';
import DocumentVerifyPage from './pages/public/DocumentVerifyPage';
import ClubVerifyPage from './pages/public/ClubVerifyPage';
import ClubApplicationCreatePage from './pages/student/ClubApplicationCreatePage';
import MyClubApplicationsPage from './pages/student/MyClubApplicationsPage';
import ClubApplicationsPage from './pages/admin/ClubApplicationsPage';
import EventCollectionsPage from './pages/admin/EventCollectionsPage';
import EventCollectionDetailPage from './pages/admin/EventCollectionDetailPage';
import EventCollectionsListPage from './pages/student/EventCollectionsListPage';
import EventCollectionDetailStudentPage from './pages/student/EventCollectionDetailStudentPage';
import IncentiveAwardsPage from './pages/admin/IncentiveAwardsPage';


// Qaysi panelga kirmoqchi bo'lgan bo'lsa - o'sha panelning kirish sahifasi.
// Xodim `/admin/awards` havolasini ochsa, talaba sahifasiga emas, `/admin` ga tushadi.
const loginPathFor = (pathname) => {
    if (pathname.startsWith('/admin')) return '/admin';
    if (pathname.startsWith('/management')) return '/rahbariyat';
    if (pathname.startsWith('/tutor')) return '/tyutor';
    return '/';
};

// Protected Route Component
const ProtectedRoute = ({ children, allowedRoles }) => {
    const { isAuthenticated, user, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="spinner" />
            </div>
        );
    }

    if (!isAuthenticated) {
        // Asosiy kirish sahifasi "/" - talabalar uchun; xodim o'z sahifasiga
        // yo'naltiriladi. Ochmoqchi bo'lgan manzil `?redirect=` da saqlanadi -
        // kirgandan keyin aynan o'sha sahifa ochiladi.
        const target = encodeURIComponent(location.pathname + location.search);
        return <Navigate to={`${loginPathFor(location.pathname)}?redirect=${target}`} replace />;
    }

    if (allowedRoles && !allowedRoles.includes(user?.role)) {
        return <Navigate to="/" replace />;
    }

    return children;
};

// Main App Router
const AppRouter = () => {
    const { isAuthenticated, user } = useAuth();
    const [searchParams] = useSearchParams();

    // Redirect to appropriate dashboard based on role.
    // Kirilmagan bo'lsa - asosiy sahifa ("/", talabalar uchun kirish/ro'yxatdan o'tish).
    const getDefaultRoute = () => {
        if (!isAuthenticated) return '/';

        switch (user?.role) {
            case ROLES.STUDENT:
                return '/student/dashboard';
            case ROLES.ADMIN:
                return '/admin/dashboard';
            case ROLES.MANAGEMENT:
                return '/management/dashboard';
            case ROLES.TUTOR:
                return '/tutor/workspace';
            default:
                // Noma'lum/berilmagan rol - panelga o'tkazilmaydi, kirish sahifasida qoladi.
                return '/';
        }
    };

    // "Ulashish" (PublicActivityPage) sends anonymous visitors to /login?redirect=/musobaqa/:id (or
    // /tadbir/:id) — once authenticated, this sends them right back instead of the generic role
    // dashboard. Only a same-origin relative path is honored (must start with '/', not '//') so a
    // crafted redirect value can never send a just-logged-in user off-site.
    const getRedirectTarget = () => {
        const raw = searchParams.get('redirect');
        if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw;
        return getDefaultRoute();
    };

    return (
        <Routes>
            {/* KIRISH SAHIFALARI - har rol uchun alohida manzil.
                Bu faqat KIRISH NUQTASI, huquq emas: rol har doim bazadagi
                `profiles.role` dan olinadi, shuning uchun /admin sahifasidan
                kirgan talaba ham baribir talaba paneliga tushadi. */}
            <Route
                path="/"
                element={
                    isAuthenticated ? <Navigate to={getRedirectTarget()} replace /> : <LoginPage variant="student" />
                }
            />
            <Route
                path="/admin"
                element={
                    isAuthenticated ? <Navigate to={getRedirectTarget()} replace /> : <LoginPage variant="admin" />
                }
            />
            <Route
                path="/rahbariyat"
                element={
                    isAuthenticated ? <Navigate to={getRedirectTarget()} replace /> : <LoginPage variant="management" />
                }
            />
            <Route
                path="/tyutor"
                element={
                    isAuthenticated ? <Navigate to={getRedirectTarget()} replace /> : <LoginPage variant="tutor" />
                }
            />
            {/* Eski manzil saqlanadi - havola va xatcho'plar buzilmasin. */}
            <Route path="/login" element={<Navigate to="/" replace />} />

            {/* Public Routes */}
            {/* "Live ekran" public view (spec §11) — no auth, read-only, meant for a projector tab */}
            <Route path="/live/:competitionId" element={<CompetitionLiveScreenPage />} />
            {/* Public musobaqa/tadbir info+registration page — the "Ulashish" share link's real
                destination (see CompetitionPassportHero.jsx's onShare). No auth required to VIEW; an
                anonymous visitor sees a "Kirish/Ro'yxatdan o'tish" CTA instead of the registration panel
                (PublicActivityPage.jsx handles both states itself). */}
            {/* QR koddan keladigan ochiq tekshiruv - login talab qilinmaydi (ProtectedRoute'siz). */}
            <Route path="/verify/:token" element={<DocumentVerifyPage />} />
            {/* Klub guvohnomasidagi QR - reyestr raqami bo'yicha, login talab qilinmaydi. */}
            <Route path="/verify/club/:registryNumber" element={<ClubVerifyPage />} />
            <Route path="/musobaqa/:id" element={<PublicActivityPage activityType="competition" />} />
            <Route path="/tadbir/:id" element={<PublicActivityPage activityType="event" />} />

            {/* Student Routes */}
            <Route
                path="/student/*"
                element={
                    <ProtectedRoute allowedRoles={[ROLES.STUDENT]}>
                        <DashboardLayout>
                            <Routes>
                                <Route path="dashboard" element={<StudentDashboard />} />
                                <Route path="social-activity" element={<SocialActivityIndex />} />
                                {/* KUTUBXONA VA TESTLAR - bitta bo'lim, uchta tab.
                                    Ilgari uchta alohida bo'lim edi va talaba qaysi
                                    biriga kirishni bilmasdi (izohi
                                    LibraryAndTestsPage.jsx da).

                                    Eski manzillar SAQLANADI va kerakli tabga
                                    yo'naltiradi: ular tashqi havolalarda,
                                    bildirishnomalarda va bosh sahifadagi
                                    tugmalarda ishlatilgan. */}
                                <Route path="library" element={<LibraryAndTestsPage />} />
                                <Route path="tests" element={<Navigate to="/student/library?tab=testlar" replace />} />
                                <Route path="reading-tests" element={<Navigate to="/student/library?tab=kitobxonlik" replace />} />
                                <Route path="events" element={<EventsCalendar />} />
                                {/* Klub koordinatorining roli STUDENT bo'lib qolaveradi
                                    (koordinatorlik - a'zolikdagi rol), ya'ni /admin/* unga
                                    yopiq. Shu sabab tadbir ish maydoni bu yerda ham bor -
                                    aks holda koordinator hammasini bitta uzun oynadan
                                    boshqarardi. Sahifaning o'zi huquqni tekshiradi. */}
                                <Route path="events/:id" element={<EventWorkspacePage />} />
                                <Route path="clubs" element={<ClubsDirectoryPage />} />
                                {/* KLUB TASHKIL ETISH VA RASMIYLASHTIRISH (tashabbuskor yo'li) -
                                    aniq marshrutlar `:slug` dan OLDIN turishi shart, aks holda
                                    "create"/"applications" klub slugi deb o'qilib ketardi. */}
                                <Route path="clubs/create" element={<ClubApplicationCreatePage />} />
                                <Route path="clubs/create/:id" element={<ClubApplicationCreatePage />} />
                                <Route path="clubs/applications" element={<MyClubApplicationsPage />} />
                                <Route path="clubs/applications/:id" element={<MyClubApplicationsPage />} />
                                <Route path="clubs/:slug" element={<ClubProfilePage />} />
                                <Route path="teams/:slug" element={<TeamProfilePage />} />
                                {/* To'rtta bo'lim "Yutuq va imkoniyatlar" ichiga jamlandi.
                                    Eski manzillar ishlashda davom etadi - eski havola va
                                    xatcho'plar buzilmasin. */}
                                <Route path="achievements" element={<AchievementsHubPage />} />
                                <Route path="scholarships" element={<Navigate to="/student/achievements?tab=applications" replace />} />
                                <Route path="development" element={<Navigate to="/student/achievements?tab=development" replace />} />
                                <Route path="opportunities" element={<Navigate to="/student/achievements" replace />} />
                                <Route path="certificates" element={<CertificatesPage />} />
                                {/* Fakultet komissiyasiga biriktirilgan har qanday akkaunt uchun -
                                    dekanat xodimi qaysi rol ostida kirishi oldindan ma'lum emas. */}
                                <Route path="scholarship-evaluation" element={<ScholarshipEvaluationPage />} />
                                <Route path="my-mentees" element={<MyMenteesPage />} />
                                {/* Yotoqxona mudiri - rol emas, biriktiruv bo'yicha ochiladi. */}
                                <Route path="my-dormitory" element={<MyDormitoryPage />} />
                                <Route path="attendance" element={<AttendanceModule />} />
                                <Route path="wardrobe" element={<WardrobeModule />} />
                                <Route path="competitions/:id" element={<CompetitionWorkspacePage />} />
                                <Route path="event-collections" element={<EventCollectionsListPage />} />
                                <Route path="event-collections/:id" element={<EventCollectionDetailStudentPage />} />
                                <Route path="incentive-awards" element={<IncentiveAwardsPage />} />
                                <Route path="profile" element={<ProfilePage />} />
                                <Route path="notifications" element={<NotificationList />} />
                                <Route path="*" element={<Navigate to="/student/dashboard" replace />} />
                            </Routes>
                        </DashboardLayout>
                    </ProtectedRoute>
                }
            />

            {/* Admin Routes */}
            <Route
                path="/admin/*"
                element={
                    <ProtectedRoute allowedRoles={[ROLES.ADMIN]}>
                        <DashboardLayout>
                            <Routes>
                                <Route path="dashboard" element={<AdminDashboard />} />
                                <Route path="students" element={<StudentsManagement />} />
                                {/* Old CRUD-only club management page — edit/delete moved into ClubProfilePage's admin-only "Sozlash" */}
                                <Route path="clubs" element={<Navigate to="/admin/clubs-directory" replace />} />
                                {/* KLUB TASHKIL ETISH VA RASMIYLASHTIRISH (admin review tomoni). */}
                                <Route path="clubs/applications" element={<ClubApplicationsPage />} />
                                <Route path="clubs/applications/:id" element={<ClubApplicationsPage />} />
                                <Route path="clubs-directory" element={<ClubsDirectoryPage />} />
                                <Route path="clubs-directory/:slug" element={<ClubProfilePage />} />
                                <Route path="teams-directory/:slug" element={<TeamProfilePage />} />
                                <Route path="events" element={<EventManagement />} />
                                {/* Tadbir boshqaruvi — kalendarda yaratish/tahrirlash, bu yerda
                                    o'tkazish (davomat, ball, vazifalar, hisobot, bayonnoma).
                                    Musobaqadagi competitions/:id bilan bir xil naqsh. */}
                                <Route path="events/:id" element={<EventWorkspacePage />} />
                                <Route path="competitions" element={<CompetitionWorkspacePage />} />
                                <Route path="competitions/:id" element={<CompetitionWorkspacePage />} />
                                <Route path="event-collections" element={<EventCollectionsPage />} />
                                <Route path="event-collections/:id" element={<EventCollectionDetailPage />} />
                                {/* KUTUBXONA VA TESTLAR - bitta bo'lim.
                                    Kitoblar ro'yxati testlar bo'limining tabi
                                    bo'lib qoldi: har asarning testi baribir shu
                                    yerda sozlanardi va ikki bo'lim orasida
                                    borib-kelish bitta ishning ikkiga bo'linishi edi.

                                    Ikkala manzil ham ishlaydi - eski havolalar
                                    (`/admin/tests?reading=...`) buzilmasin. */}
                                <Route path="tests" element={<TestManagement />} />
                                {/* "Ijtimoiy faollik" va "Reytinglar" bitta bo'limga birlashtirildi
                                    (ikkalasi bir xil narsani o'lchardi, hatto talabalar ro'yxati ham
                                    ikki nusxada edi). Eski `/admin/rankings` manzili pastda saqlanib
                                    qolgan - u yangi bo'limning "Tahlil" guruhiga yo'naltiradi, shunda
                                    saqlab qo'yilgan havolalar va eski xatcho'plar buzilmaydi. */}
                                <Route path="social-activity" element={<ActivityAndRankingsPage />} />
                                {/* 7-mezon: Ma'rifat darslari auditoriya kesimida
                                    rejalashtiriladi, shuning uchun tadbirlardan alohida. */}
                                <Route path="marifat" element={<MarifatLessonsPage />} />
                                <Route path="rankings" element={<Navigate to="/admin/social-activity?bolim=tahlil" replace />} />
                                <Route path="reports" element={<ReportingModule />} />
                                <Route path="library" element={<TestManagement />} />
                                <Route path="scholarships" element={<ScholarshipManagement />} />
                                <Route path="attendance" element={<AttendanceManagement />} />
                                <Route path="wardrobe" element={<WardrobeManagement />} />
                                <Route path="monitoring" element={<Navigate to="/admin/social-activity" replace />} />
                                <Route path="verification" element={<Navigate to="/admin/social-activity" replace />} />

                                <Route path="scholarship-evaluation" element={<ScholarshipEvaluationPage />} />
                                <Route path="my-mentees" element={<MyMenteesPage />} />
                                {/* Yotoqxona mudiri - rol emas, biriktiruv bo'yicha ochiladi. */}
                                <Route path="my-dormitory" element={<MyDormitoryPage />} />
                                <Route path="academic" element={<AcademicRecordsPage />} />
                                <Route path="talent" element={<TalentModulePage />} />
                                <Route path="awards" element={<AwardRegistryPage />} />
                                <Route path="incentive-awards" element={<IncentiveAwardsPage />} />
                                <Route path="settings" element={<SettingsPage />} />
                                <Route path="profile" element={<ProfilePage />} />
                                <Route path="notifications" element={<NotificationList />} />
                                <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
                            </Routes>
                        </DashboardLayout>
                    </ProtectedRoute>
                }
            />

            {/* TYUTOR — ijtimoiy faollik metodikasi mas'ul sifatida aynan
                tyutorni ko'rsatadigan ishlar uchun. Vakolat ROLGA emas,
                BIRIKTIRUVGA bog'liq: sahifa faqat biriktirilgan talabalarni
                ko'rsatadi. */}
            <Route
                path="/tutor/*"
                element={
                    <ProtectedRoute allowedRoles={[ROLES.TUTOR]}>
                        <DashboardLayout>
                            <Routes>
                                <Route path="workspace" element={<TutorWorkspacePage />} />
                                {/* Yon menyu biriktiruv bo'yicha `${base}/my-mentees` va
                                    `${base}/scholarship-evaluation` havolalarini qo'shadi -
                                    ular shu yerda ham bo'lishi SHART, aks holda havola
                                    ish maydoniga qaytarib yuborardi. */}
                                <Route path="my-mentees" element={<MyMenteesPage />} />
                                <Route path="scholarship-evaluation" element={<ScholarshipEvaluationPage />} />
                                <Route path="my-dormitory" element={<MyDormitoryPage />} />
                                <Route path="marifat" element={<MarifatLessonsPage />} />
                                {/* Yuqoridagi paneldagi profil va bildirishnoma tugmalari
                                    ham shu marshrutlarga boradi. */}
                                <Route path="profile" element={<ProfilePage />} />
                                <Route path="notifications" element={<NotificationList />} />
                                <Route path="*" element={<Navigate to="/tutor/workspace" replace />} />
                            </Routes>
                        </DashboardLayout>
                    </ProtectedRoute>
                }
            />

            {/* Management Routes */}
            <Route
                path="/management/*"
                element={
                    <ProtectedRoute allowedRoles={[ROLES.MANAGEMENT]}>
                        <DashboardLayout>
                            <Routes>
                                <Route path="dashboard" element={<ManagementDashboard />} />
                                <Route path="statistics" element={<StatisticsPage />} />
                                <Route path="clubs-directory" element={<ClubsDirectoryPage />} />
                                <Route path="clubs-directory/:slug" element={<ClubProfilePage />} />
                                <Route path="teams-directory/:slug" element={<TeamProfilePage />} />
                                <Route path="rankings" element={<RankingsPage />} />
                                <Route path="reports" element={<ReportsPage />} />
                                <Route path="faculties" element={<FacultiesPage />} />
                                <Route path="scholarships" element={<ScholarshipsOverviewPage />} />
                                <Route path="talent" element={<TalentPipelinePage />} />
                                <Route path="scholarship-evaluation" element={<ScholarshipEvaluationPage />} />
                                <Route path="my-mentees" element={<MyMenteesPage />} />
                                {/* Yotoqxona mudiri - rol emas, biriktiruv bo'yicha ochiladi. */}
                                <Route path="my-dormitory" element={<MyDormitoryPage />} />
                                <Route path="profile" element={<ProfilePage />} />
                                <Route path="notifications" element={<NotificationList />} />
                                <Route path="*" element={<Navigate to="/management/dashboard" replace />} />
                            </Routes>
                        </DashboardLayout>
                    </ProtectedRoute>
                }
            />

            {/* Topilmagan manzil - roliga qarab o'z paneliga, kirilmagan bo'lsa asosiy sahifaga. */}
            <Route path="*" element={<Navigate to={getDefaultRoute()} replace />} />
        </Routes>
    );
};

function App() {
    return (
        <AuthProvider>
            <Router>
                <AppRouter />
            </Router>
        </AuthProvider>
    );
}

export default App;
