// Utility functions for UniPlatform

// Format date to Uzbek locale
export const formatDate = (date) => {
    const months = [
        'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
        'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'
    ];

    const d = new Date(date);
    return `${d.getDate()}-${months[d.getMonth()]}`;
};

// Calculate social activity status
export const getSocialActivityStatus = (score) => {
    if (score >= 90) return { label: 'Alo', variant: 'excellent', color: 'green' };
    if (score >= 70) return { label: 'Yaxshi', variant: 'good', color: 'blue' };
    if (score >= 50) return { label: 'O\'rtacha', variant: 'average', color: 'yellow' };
    return { label: 'Past', variant: 'poor', color: 'red' };
};

// Calculate GPA to points (max 10)
export const gpaToPoints = (gpa, maxGpa = 4.0, maxPoints = 10) => {
    return (gpa / maxGpa) * maxPoints;
};

// Calculate attendance to points (max 5)
export const attendanceToPoints = (attendanceRate, maxPoints = 5) => {
    return (attendanceRate / 100) * maxPoints;
};

// Validate file upload
export const validateFile = (file, maxSizeMB = 5, allowedTypes = ['application/pdf', 'image/jpeg', 'image/png']) => {
    const maxSize = maxSizeMB * 1024 * 1024; // Convert to bytes

    if (file.size > maxSize) {
        return { valid: false, error: `Fayl hajmi ${maxSizeMB}MB dan oshmasligi kerak` };
    }

    if (!allowedTypes.includes(file.type)) {
        return { valid: false, error: 'Faqat PDF, JPG, PNG fayllar qabul qilinadi' };
    }

    return { valid: true };
};

// Generate random ID
export const generateId = () => {
    return Math.random().toString(36).substr(2, 9);
};

// Truncate text
export const truncateText = (text, maxLength = 50) => {
    if (text.length <= maxLength) return text;
    return text.substr(0, maxLength) + '...';
};

// Format number with spaces (1000 -> 1 000)
export const formatNumber = (num) => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};

// Calculate percentage
export const calculatePercentage = (value, total) => {
    if (total === 0) return 0;
    return Math.round((value / total) * 100);
};

// Sort array by key
export const sortBy = (array, key, order = 'asc') => {
    return [...array].sort((a, b) => {
        if (order === 'asc') {
            return a[key] > b[key] ? 1 : -1;
        }
        return a[key] < b[key] ? 1 : -1;
    });
};

// Group array by key
export const groupBy = (array, key) => {
    return array.reduce((result, item) => {
        const group = item[key];
        if (!result[group]) {
            result[group] = [];
        }
        result[group].push(item);
        return result;
    }, {});
};

// Debounce function
export const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

// Check if object is empty
export const isEmpty = (obj) => {
    return Object.keys(obj).length === 0;
};

// Deep clone object
export const deepClone = (obj) => {
    return JSON.parse(JSON.stringify(obj));
};
