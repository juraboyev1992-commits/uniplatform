import { db } from '../services/db';

// Thin wrapper around db.getCompetitionDelegations, mirroring the convention in permissions.js (wraps
// existing checks rather than replacing them). A delegated grant is an ADDITIVE capability — it never
// changes what TournamentScoring.jsx's getUserRole() returns, it only adds an extra OR-condition to the
// two access-check functions that already gate scoring/admin actions.
export const hasDelegatedPermission = (user, competition, permissionKey) => {
    if (!user || !competition) return false;
    const delegations = db.getCompetitionDelegations(competition.id);
    return delegations.some(d => d.granteeUsername === user.username && d.permissions.includes(permissionKey));
};

// Event-scoped sibling of hasDelegatedPermission above (eventDelegations mirrors competitionDelegations'
// shape exactly) — lets an event coordinator grant someone else attendance-marking rights on an event.
export const hasEventDelegatedPermission = (user, event, permissionKey) => {
    if (!user || !event) return false;
    const delegations = db.getEventDelegations(event.id);
    return delegations.some(d => d.granteeUsername === user.username && d.permissions.includes(permissionKey));
};

// Permission keys grantable via the "Vakolatlar" drawer — kept here (not duplicated in the drawer
// component) so the drawer's checkbox list and any future access check stay in sync.
export const COMPETITION_DELEGATION_PERMISSIONS = [
    { key: 'result_entry', label: 'Natija kiritish' },
    { key: 'live_scoring', label: 'Live scoring' },
    { key: 'attendance', label: 'Attendance' },
    { key: 'manage_teams', label: "Jamoalarni boshqarish" },
    { key: 'judge', label: 'Hakam sifatida ishlash' },
    { key: 'view_appeals', label: "Apellyatsiyani ko'rish" },
    // Full control over "Turlarni boshqarish -> Guruh bosqichlari" (CompetitionAdvancementPanel.jsx):
    // guruh yaratish/o'chirish, jamoa biriktirish (qo'lda/ommaviy/tasodifiy), birlashish nuqtasini
    // belgilash, top-N, tay-brek, va "Finalga chiqarish" — hammasi, admin bilan bir xil darajada.
    { key: 'manage_groups', label: 'Guruh bosqichlarini boshqarish' }
];
