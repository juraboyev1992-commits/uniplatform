import React from 'react';

const Card = ({
    children,
    title,
    subtitle,
    className = '',
    hover = false,
    padding = true,
    ...props
}) => {
    return (
        <div
            className={`
        bg-white rounded-xl shadow-md border border-gray-100
        ${hover ? 'card-hover cursor-pointer' : ''}
        ${padding ? 'p-6' : ''}
        ${className}
      `}
            {...props}
        >
            {(title || subtitle) && (
                <div className="mb-4">
                    {title && (
                        <h3 className="text-xl font-semibold text-gray-900">{title}</h3>
                    )}
                    {subtitle && (
                        <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
                    )}
                </div>
            )}
            {children}
        </div>
    );
};

export default Card;
