import React from 'react';

// First skeleton-loading primitive in the codebase (none existed before this feature pass) — block/row/card
// shapes, rounded-2xl/3xl to match the app's dominant radius vocabulary, dark:-aware. Existing pages render
// synchronously against localStorage and never needed this; only new components introduced alongside it use it.
const Skeleton = ({ className = '' }) => (
    <div className={`animate-pulse bg-gray-200 dark:bg-gray-700 rounded-2xl ${className}`} />
);

export const SkeletonBlock = ({ className = '' }) => <Skeleton className={`h-24 w-full ${className}`} />;

export const SkeletonRow = ({ className = '' }) => (
    <div className={`flex items-center gap-3 ${className}`}>
        <Skeleton className="w-10 h-10 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
        </div>
    </div>
);

export const SkeletonCard = ({ className = '' }) => (
    <div className={`bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 p-5 space-y-3 ${className}`}>
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
    </div>
);

export default Skeleton;
