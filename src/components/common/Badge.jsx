import React from 'react';

const Badge = ({
    children,
    variant = 'default',
    size = 'md',
    className = ''
}) => {
    const variants = {
        default: 'bg-gray-100 text-gray-800',
        primary: 'bg-primary-100 text-primary-800',
        success: 'bg-green-100 text-green-800',
        warning: 'bg-yellow-100 text-yellow-800',
        danger: 'bg-red-100 text-red-800',
        info: 'bg-blue-100 text-blue-800',
        // Status badges for social activity
        excellent: 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-md',
        good: 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-md',
        average: 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white shadow-md',
        poor: 'bg-gradient-to-r from-red-500 to-pink-500 text-white shadow-md'
    };

    const sizes = {
        sm: 'px-2 py-0.5 text-xs',
        md: 'px-3 py-1 text-sm',
        lg: 'px-4 py-1.5 text-base'
    };

    return (
        <span
            className={`
        inline-flex items-center justify-center font-semibold rounded-full
        ${variants[variant]} ${sizes[size]} ${className}
      `}
        >
            {children}
        </span>
    );
};

export default Badge;
