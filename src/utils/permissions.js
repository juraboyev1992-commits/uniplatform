import { ROLES } from '../contexts/AuthContext';

// Shared permission helpers for the club-structure/position features (open positions, applications,
// promote/demote, override) added in this feature pass. Wraps the existing hasClubRole from
// AuthContext.jsx rather than replacing it — introduced because this pass adds several new
// permission-sensitive flows in one go across multiple new files, and repeating inline
// `user?.role === 'ADMINISTRATOR'` checks (the convention used everywhere else in the app) risks drift.
export const isClubCoordinator = (user, hasClubRole, clubId) =>
    !!user && hasClubRole(clubId, ['head_coordinator', 'coordinator']);

export const canManageClubStructure = (user, hasClubRole, clubId) =>
    user?.role === ROLES.ADMIN || isClubCoordinator(user, hasClubRole, clubId);

// Only an admin can give the final approval that actually grants a position's powers (spec: "Admin tasdiqlaydi").
export const canFinalizeClubStructure = (user) => user?.role === ROLES.ADMIN;

export const canOverrideClubStructure = (user, hasClubRole, clubId) =>
    user?.role === ROLES.ADMIN || user?.role === ROLES.MANAGEMENT || isClubCoordinator(user, hasClubRole, clubId);
