import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

const ThemeToggle = ({ className = '' }) => {
    const { isDark, toggleTheme } = useTheme();

    return (
        <button
            type="button"
            onClick={toggleTheme}
            title={isDark ? "Yorug' rejim" : "Qorong'i rejim"}
            className={`inline-flex items-center justify-center w-9 h-9 rounded-2xl border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${className}`}
        >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
    );
};

export default ThemeToggle;
