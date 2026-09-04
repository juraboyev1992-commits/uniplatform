import React from 'react';
import { ChevronUp, ChevronDown, ArrowUpDown, Minus, TrendingUp, TrendingDown } from 'lucide-react';

// Shared by GlobalStudentsRankings.jsx/GlobalClubsRankings.jsx and the Competition workspace tab
// components (CompetitionOverviewTab.jsx/CompetitionJudgesTab.jsx) — small pure leaf pieces,
// duplicated-across-several-new-files would be worse than the codebase's usual single-file inlining.

const STAT_ACCENTS = {
    indigo: 'bg-indigo-50 text-indigo-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    rose: 'bg-rose-50 text-rose-600',
    purple: 'bg-purple-50 text-purple-600'
};

export const StatCard = ({ icon: Icon, label, value, accent = 'indigo' }) => (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${STAT_ACCENTS[accent] || STAT_ACCENTS.indigo}`}>
            <Icon size={22} />
        </div>
        <div className="min-w-0">
            <p className="text-2xl font-extrabold text-gray-900 truncate">{value}</p>
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide truncate">{label}</p>
        </div>
    </div>
);

// Re-exported so existing `import { Pagination } from './RankingsSharedUI'` call sites keep working
// unchanged — the actual numbered-button implementation now lives in the single shared Pagination.jsx,
// used by every paginated list in the app.
export { default as Pagination } from './Pagination';

export const SortableTh = ({ label, sortKey, sortConfig, onSort, className = '' }) => {
    const isActive = sortConfig.key === sortKey;
    return (
        <th
            onClick={() => onSort(sortKey)}
            className={`px-5 py-3 text-xs font-semibold uppercase tracking-wider cursor-pointer select-none transition-colors ${
                isActive ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-700'
            } ${className}`}
        >
            <span className="inline-flex items-center gap-1">
                {label}
                {isActive ? (
                    sortConfig.direction === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />
                ) : (
                    <ArrowUpDown size={11} className="text-gray-300" />
                )}
            </span>
        </th>
    );
};

// rankChange: positive = moved up (better rank number is smaller), negative = moved down, 0/undefined = no change
export const RankChangeArrow = ({ change, size = 'sm' }) => {
    const textSize = size === 'lg' ? 'text-sm' : 'text-xs';
    if (!change) {
        return (
            <span className={`inline-flex items-center gap-1 ${textSize} font-semibold text-gray-400`}>
                <Minus size={size === 'lg' ? 16 : 13} /> 0
            </span>
        );
    }
    if (change > 0) {
        return (
            <span className={`inline-flex items-center gap-1 ${textSize} font-bold text-emerald-600`}>
                <TrendingUp size={size === 'lg' ? 16 : 13} /> +{change}
            </span>
        );
    }
    return (
        <span className={`inline-flex items-center gap-1 ${textSize} font-bold text-rose-600`}>
            <TrendingDown size={size === 'lg' ? 16 : 13} /> {change}
        </span>
    );
};
