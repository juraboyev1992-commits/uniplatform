import React from 'react';
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';

const range = (start, end) => Array.from({ length: end - start + 1 }, (_, i) => start + i);

// Windowed "1 2 3 4 5 ... N" page-number range (siblingCount=1), same algorithm MUI's usePagination
// uses: always show page 1 and the last page, plus one sibling on each side of the current page,
// collapsing the rest into a single ellipsis.
// Exported for the rare consumer (e.g. CompetitionResultsCenter's dark-mode-aware footer) that needs
// the same page-number windowing but must render its own themed buttons instead of this component.
export const getPageRange = (current, total) => {
    const siblingCount = 1;
    const totalPageNumbers = siblingCount * 2 + 5;
    if (totalPageNumbers >= total) return range(1, total);

    const leftSibling = Math.max(current - siblingCount, 1);
    const rightSibling = Math.min(current + siblingCount, total);
    const showLeftDots = leftSibling > 2;
    const showRightDots = rightSibling < total - 2;

    if (!showLeftDots && showRightDots) {
        return [...range(1, 3 + siblingCount * 2), '...', total];
    }
    if (showLeftDots && !showRightDots) {
        return [1, '...', ...range(total - (3 + siblingCount * 2) + 1, total)];
    }
    return [1, '...', ...range(leftSibling, rightSibling), '...', total];
};

// Single pagination bar used across every paginated list in the app: numbered page buttons with an
// ellipsis-windowed range, prev/next arrows, and an optional page-size dropdown (only rendered when
// the caller passes onPageSizeChange, i.e. only where pageSize is real adjustable state). `pageSize`
// (and an entry in `pageSizeOptions`) may be the literal string 'all' — lets a user switch between
// "somebody pages through it" and "somebody just wants to see everything at once" from the same control,
// instead of the numbered buttons disappearing outright once there's nothing left to page through.
const Pagination = ({
    currentPage,
    totalPages,
    onPageChange,
    pageSize,
    onPageSizeChange,
    pageSizeOptions = [10, 20, 30, 50],
    totalItems,
    className = ''
}) => {
    const showPager = pageSize !== 'all' && totalPages > 1;
    if (!showPager && !onPageSizeChange) return null;

    const pages = showPager ? getPageRange(currentPage, totalPages) : [];
    const rangeEnd = pageSize === 'all' ? totalItems : Math.min(currentPage * pageSize, totalItems);

    return (
        <div className={`flex flex-wrap items-center justify-between gap-3 ${className}`}>
            {totalItems != null && pageSize != null ? (
                <p className="text-xs text-gray-500">
                    {totalItems === 0 ? 0 : (pageSize === 'all' ? 1 : (currentPage - 1) * pageSize + 1)}-{rangeEnd} / {totalItems} ta natija
                </p>
            ) : <span />}

            <div className="flex items-center gap-3 ml-auto">
                {showPager && (
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                            disabled={currentPage === 1}
                            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                        >
                            <ChevronLeft size={15} />
                        </button>
                        {pages.map((p, i) => p === '...' ? (
                            <span key={`dots-${i}`} className="w-8 h-8 flex items-center justify-center text-gray-400 text-xs select-none">&hellip;</span>
                        ) : (
                            <button
                                type="button"
                                key={p}
                                onClick={() => onPageChange(p)}
                                className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold transition-colors ${
                                    p === currentPage
                                        ? 'border-2 border-indigo-600 text-indigo-600 bg-indigo-50'
                                        : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                                }`}
                            >
                                {p}
                            </button>
                        ))}
                        <button
                            type="button"
                            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                            disabled={currentPage === totalPages}
                            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                        >
                            <ChevronRight size={15} />
                        </button>
                    </div>
                )}

                {onPageSizeChange && (
                    <div className="relative">
                        <select
                            value={pageSize}
                            onChange={e => onPageSizeChange(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                            className="appearance-none pl-3 pr-7 h-8 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 bg-white hover:bg-gray-50 transition-colors cursor-pointer outline-none"
                        >
                            {pageSizeOptions.map(n => (
                                <option key={n} value={n}>{n === 'all' ? 'Hammasi' : `${n} / page`}</option>
                            ))}
                        </select>
                        <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400" />
                    </div>
                )}
            </div>
        </div>
    );
};

export default Pagination;
