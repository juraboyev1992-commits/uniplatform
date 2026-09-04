// The Clubs Directory is mounted at a different path segment per role (see App.jsx):
//   /student/clubs + /student/clubs/:slug + /student/teams/:slug
//   /admin/clubs-directory + /admin/clubs-directory/:slug + /admin/teams-directory/:slug
//   /management/clubs-directory + /management/clubs-directory/:slug + /management/teams-directory/:slug
// (admin's plain /admin/clubs now just redirects to /admin/clubs-directory — see App.jsx — the old
// ClubManagement CRUD tool it used to point at is retired/unrouted, so the directory doesn't reuse that
// segment). This resolves the right base from the current pathname so every "Profil"/"Jamoalar" link
// lands on a route that actually exists.
export const getClubsRoutes = (pathname) => {
    if (pathname.startsWith('/admin')) {
        return { list: '/admin/clubs-directory', clubBase: '/admin/clubs-directory', teamBase: '/admin/teams-directory' };
    }
    if (pathname.startsWith('/management')) {
        return { list: '/management/clubs-directory', clubBase: '/management/clubs-directory', teamBase: '/management/teams-directory' };
    }
    return { list: '/student/clubs', clubBase: '/student/clubs', teamBase: '/student/teams' };
};
