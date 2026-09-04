import React, { useState } from 'react';
import Pagination from '../common/Pagination';
import { placeIcon, placeLabel, levelLabel } from '../../config/clubAchievements';

const PAGE_SIZE_OPTIONS = [10, 20, 30, 100, 'all'];

// Yutuqlar xronologiyasi (TeamProfilePage ishlatadi).
//
// O'rin va daraja ro'yxati ENDI konfiguratsiyadan olinadi: ilgari bu yerda
// o'zining `'1st'/'2nd'/'3rd'` jadvali turardi, ya'ni yutuqlar shakli
// o'zgarganda bu komponent jimgina bo'sh belgi ko'rsatib qolardi.
//
// Kutilgan shakl: { id, label, date, place, level }.
const AchievementsTimeline = ({ items = [] }) => {
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[1]);

    const sorted = [...items].sort((a, b) => new Date(b.date) - new Date(a.date));

    if (sorted.length === 0) {
        return (
            <div className="text-center py-10 text-sm text-gray-400 bg-white rounded-2xl border border-dashed border-gray-200">
                Hozircha yutuqlar qayd etilmagan
            </div>
        );
    }

    const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(sorted.length / pageSize));
    const page = Math.min(currentPage, totalPages);
    const visible = pageSize === 'all' ? sorted : sorted.slice((page - 1) * pageSize, page * pageSize);

    return (
        <div className="space-y-3">
            {visible.map(item => (
                <div key={item.id} className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
                    <span className="text-2xl shrink-0" title={placeLabel(item.place)}>
                        {placeIcon(item.place)}
                    </span>
                    <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 truncate">{item.label}</p>
                        <p className="text-xs text-gray-400">
                            {item.level && <>{levelLabel(item.level)}{' · '}</>}
                            {item.date ? new Date(item.date).toLocaleDateString('uz-UZ', { day: '2-digit', month: 'long', year: 'numeric' }) : ''}
                        </p>
                    </div>
                    <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full shrink-0">
                        {placeLabel(item.place)}
                    </span>
                </div>
            ))}
            <Pagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                pageSize={pageSize}
                onPageSizeChange={size => { setPageSize(size); setCurrentPage(1); }}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
                totalItems={sorted.length}
                className="pt-2"
            />
        </div>
    );
};

export default AchievementsTimeline;
