import React, { useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, ChevronRight, MapPin, Users } from 'lucide-react';
import TournamentScoring from '../../components/common/TournamentScoring';
import Button from '../../components/common/Button';
import { db } from '../../services/db';

// Holat tasnifi (Ochilmagan/Davom etmoqda/Yakunlangan) bu yerdan OLIB TASHLANDI -
// uni "Musobaqa pasporti" (CompetitionPassportHero) o'zi hisoblab ko'rsatadi.
// Ikki joyda ikki xil hisoblanib qolish xavfi ham shu bilan yo'qoldi.

const CompetitionWorkspacePage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();

    // Always return to a REAL, FIXED route — never browser history (navigate(-1)/history.back()),
    // since that can send the user to whatever unrelated page they happened to arrive from (including
    // a direct/deep link, where there is no relevant history entry at all). Admin has a real
    // "/admin/competitions" list route; the student view has no equivalent list page, so it falls back
    // to the student dashboard instead of navigating to a route that doesn't exist for that role.
    // If arrived here via `location.state.from` (e.g. "Tadbirlar to'plami"'s "Ish maydoni" button),
    // that exact page wins over the generic list - otherwise the user "gets lost" back in a list they
    // didn't come from.
    const handleBackToCompetitions = () => {
        navigate(location.state?.from || (location.pathname.startsWith('/student/') ? '/student/dashboard' : '/admin/competitions'));
    };

    // Faqat navigatsiya qatori uchun kerak bo'lgani: nom (yo'lchi qatorda), klub va
    // joy. Sana ATAYLAB olinmaydi - u pasportning "Sana" katagida turibdi.
    const competition = useMemo(() => db.getCompetitionById(id), [id]);
    const club = useMemo(
        () => (competition?.contextType === 'club' ? db.getClubs().find(c => c.id === competition.contextId) : null),
        [competition]
    );

    return (
        <div className="space-y-4">
            {/* Faqat NAVIGATSIYA qatori.
                //
                Ilgari bu yerda katta sarlavha, holat yorlig'i va sana ham turardi -
                hammasi darhol ostidagi "Musobaqa pasporti" (CompetitionPassportHero)
                da qaytarilardi. Nom esa ikki marta: yo'lchi qatorda ham, sarlavhada
                ham. Ustiga har musobaqada bir xil turadigan "UniPlatform professional
                musobaqalar..." yozuvi bor edi - u bu musobaqa haqida hech narsa
                aytmaydi.
                //
                Endi bu qator faqat "qayerdaman va qanday qaytaman" degan savolga
                javob beradi. Musobaqaning O'ZI haqidagi hamma narsa pasportda.
                Klub va joy shu yerda qoladi - pasportda ular yo'q. */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white px-4 py-3 rounded-2xl shadow-sm border border-gray-100">
                <div className="flex items-center gap-3 min-w-0">
                    <Button
                        variant="outline"
                        size="sm"
                        icon={ArrowLeft}
                        onClick={handleBackToCompetitions}
                        className="rounded-xl shrink-0"
                    >
                        Orqaga
                    </Button>
                    <button
                        type="button"
                        onClick={handleBackToCompetitions}
                        className="flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-indigo-600 transition-colors min-w-0"
                    >
                        Musobaqalar
                        <ChevronRight size={12} className="shrink-0" />
                        <span className="text-gray-600 truncate">
                            {competition ? competition.name : 'Musobaqa'}
                        </span>
                    </button>
                </div>

                {competition && (club || competition.location) && (
                    <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
                        {club && (
                            <span className="flex items-center gap-1.5 font-semibold text-gray-600">
                                <Users size={13} className="text-indigo-500" />
                                {club.name}
                            </span>
                        )}
                        {competition.location && (
                            <span className="flex items-center gap-1.5">
                                <MapPin size={13} className="text-indigo-500" />
                                {competition.location}
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* Competition Workspace / Tournament Scoring */}
            <TournamentScoring competitionId={id} />
        </div>
    );
};

export default CompetitionWorkspacePage;
