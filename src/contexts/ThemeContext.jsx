import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'uniplatform_theme';
const THEME_EVENT = 'uniplatform:theme-change';

const readStoredTheme = () => {
    if (typeof window === 'undefined') return 'light';
    return localStorage.getItem(STORAGE_KEY) || 'light';
};

const applyThemeClass = (theme) => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
};

// No <ThemeProvider> wraps the app root — existing pages never render `dark:` classes, so a global
// provider would be dead weight, and wiring one in means editing App.jsx's existing tree (out of scope
// for this additive pass). Each new component that needs the current theme calls useTheme() directly;
// state stays in sync across simultaneously-mounted new components via a window CustomEvent instead of
// React context, since there's no shared ancestor to put a provider on without touching App.jsx.
export const useTheme = () => {
    const [theme, setTheme] = useState(readStoredTheme);

    useEffect(() => {
        applyThemeClass(theme);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const handler = (e) => setTheme(e.detail);
        window.addEventListener(THEME_EVENT, handler);
        return () => window.removeEventListener(THEME_EVENT, handler);
    }, []);

    const toggleTheme = useCallback(() => {
        setTheme(prev => {
            const next = prev === 'dark' ? 'light' : 'dark';
            localStorage.setItem(STORAGE_KEY, next);
            applyThemeClass(next);
            window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: next }));
            return next;
        });
    }, []);

    return { theme, toggleTheme, isDark: theme === 'dark' };
};
