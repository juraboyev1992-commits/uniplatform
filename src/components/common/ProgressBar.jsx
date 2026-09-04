import React from 'react';

const ProgressBar = ({
    value,
    max = 100,
    label,
    showPercentage = true,
    color = 'primary',
    size = 'md',
    animated = true,
    className = ''
}) => {
    const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

    const colors = {
        primary: 'bg-primary-500',
        success: 'bg-green-500',
        warning: 'bg-yellow-500',
        danger: 'bg-red-500',
        info: 'bg-blue-500'
    };

    const sizes = {
        sm: 'h-2',
        md: 'h-3',
        lg: 'h-4'
    };

    const getColorByPercentage = () => {
        if (percentage >= 90) return colors.success;
        if (percentage >= 70) return colors.primary;
        if (percentage >= 50) return colors.warning;
        return colors.danger;
    };

    const barColor = color === 'auto' ? getColorByPercentage() : colors[color];

    return (
        <div className={`w-full ${className}`}>
            {label && (
                <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-700">{label}</span>
                    {showPercentage && (
                        <span className="text-sm font-semibold text-gray-900">
                            {percentage.toFixed(0)}%
                        </span>
                    )}
                </div>
            )}
            <div className={`w-full bg-gray-200 rounded-full overflow-hidden ${sizes[size]}`}>
                <div
                    className={`${barColor} ${sizes[size]} rounded-full transition-all duration-500 ease-out ${animated ? 'animate-pulse-slow' : ''}`}
                    style={{ width: `${percentage}%` }}
                />
            </div>
        </div>
    );
};

export default ProgressBar;
