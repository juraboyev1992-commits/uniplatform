import React, { useState } from 'react';
import {
    Book,
    Search,
    BookOpen,
    CheckCircle,
    Star,
    ArrowRight,
    Clock,
    Filter,
    Eye,
    Bookmark
} from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import ProgressBar from '../../components/common/ProgressBar';

const LibraryModule = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [activeCategory, setActiveCategory] = useState('Barchasi');

    // Categories based on 5 initiatives
    const categories = ['Barchasi', 'Badiiy', 'Ilmiy', 'IT', 'Biznes', 'Siyosat'];

    // Mock books data
    const books = [
        {
            id: 1,
            title: 'O\'tkan kunlar',
            author: 'Abdulla Qodiriy',
            progress: 100,
            category: 'Badiiy',
            rating: 4.9,
            testStatus: 'completed',
            cover: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&q=80&w=200',
            description: 'O\'zbek adabiyotining durdonasi hisoblangan ilk roman.'
        },
        {
            id: 2,
            title: 'Mehrobdan chayon',
            author: 'Abdulla Qodiriy',
            progress: 65,
            category: 'Badiiy',
            rating: 4.8,
            testStatus: 'pending',
            cover: 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?auto=format&fit=crop&q=80&w=200',
            description: 'Tarixiy voqealar asosida yozilgan o\'lmas asar.'
        },
        {
            id: 3,
            title: 'Clean Code',
            author: 'Robert C. Martin',
            progress: 20,
            category: 'IT',
            rating: 5.0,
            testStatus: 'not_started',
            cover: 'https://images.unsplash.com/photo-1512428559083-a401c3384075?auto=format&fit=crop&q=80&w=200',
            description: 'Dasturchilar uchun xato va toza kod haqida qo\'llanma.'
        },
        {
            id: 4,
            title: 'Shavkat Mirziyoyev: Strategiya',
            author: 'Davlat nashriyoti',
            progress: 0,
            category: 'Siyosat',
            rating: 4.5,
            testStatus: 'not_started',
            cover: 'https://images.unsplash.com/photo-1532012197267-da84d127e765?auto=format&fit=crop&q=80&w=200',
            description: 'O\'zbekistonning yangi rivojlanish strategiyasi haqida.'
        },
        {
            id: 5,
            title: 'Atom odatlari',
            author: 'James Clear',
            progress: 0,
            category: 'Biznes',
            rating: 4.7,
            testStatus: 'not_started',
            cover: 'https://images.unsplash.com/photo-1506880018603-83d5b814b5a6?auto=format&fit=crop&q=80&w=200',
            description: 'Yaxshi odatlarni shakllantirish bo\'yicha dunyo bestselleri.'
        }
    ];

    const filteredBooks = books.filter(book => {
        const matchesSearch = book.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            book.author.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = activeCategory === 'Barchasi' || book.category === activeCategory;
        return matchesSearch && matchesCategory;
    });

    return (
        <div className="space-y-6">
            <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-2xl p-8 text-white shadow-xl flex flex-col md:flex-row justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold mb-2">Elektron Kutubxona</h1>
                    <p className="text-emerald-100 italic">O'qing, o'rganing va bilimingizni boyiting</p>
                </div>
                <div className="mt-6 md:mt-0 flex items-center bg-white/20 backdrop-blur-md px-6 py-4 rounded-2xl border border-white/30">
                    <Book className="w-8 h-8 mr-4" />
                    <div>
                        <p className="text-2xl font-bold">100 ta</p>
                        <p className="text-sm opacity-80">Tavsiya etilgan kitoblar</p>
                    </div>
                </div>
            </div>

            {/* Search and Filters */}
            <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                        type="text"
                        placeholder="Kitob nomi yoki muallif bo'yicha qidirish..."
                        className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 transition-all shadow-sm"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex bg-white p-1 rounded-xl shadow-sm border border-gray-100 overflow-x-auto no-scrollbar">
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setActiveCategory(cat)}
                            className={`
                px-6 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap
                ${activeCategory === cat ? 'bg-emerald-500 text-white shadow-md' : 'text-gray-600 hover:bg-gray-50'}
              `}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="bg-emerald-50 border-none">
                    <p className="text-sm text-emerald-700 font-medium mb-1">O'qilgan</p>
                    <p className="text-3xl font-bold text-emerald-900">12 ta</p>
                </Card>
                <Card className="bg-blue-50 border-none">
                    <p className="text-sm text-blue-700 font-medium mb-1">Hozir o'qilmoqda</p>
                    <p className="text-3xl font-bold text-blue-900">3 ta</p>
                </Card>
                <Card className="bg-purple-50 border-none">
                    <p className="text-sm text-purple-700 font-medium mb-1">To'plangan ball</p>
                    <p className="text-3xl font-bold text-purple-900">24 ball</p>
                </Card>
                <Card className="bg-orange-50 border-none">
                    <p className="text-sm text-orange-700 font-medium mb-1">Reytingdagi o'rni</p>
                    <p className="text-3xl font-bold text-orange-900">15-o'rin</p>
                </Card>
            </div>

            {/* Book List */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {filteredBooks.map(book => (
                    <Card key={book.id} className="group overflow-hidden">
                        <div className="flex flex-col sm:flex-row gap-6">
                            <div className="w-full sm:w-40 h-56 flex-shrink-0 relative">
                                <img
                                    src={book.cover}
                                    alt={book.title}
                                    className="w-full h-full object-cover rounded-xl shadow-lg group-hover:scale-105 transition-transform duration-300"
                                />
                                {book.progress === 100 && (
                                    <div className="absolute -top-2 -right-2 bg-green-500 text-white p-1.5 rounded-full shadow-lg">
                                        <CheckCircle className="w-5 h-5" />
                                    </div>
                                )}
                            </div>

                            <div className="flex-1 flex flex-col">
                                <div className="flex justify-between items-start mb-2">
                                    <Badge variant="info">{book.category}</Badge>
                                    <div className="flex items-center text-yellow-500">
                                        <Star className="w-4 h-4 fill-current mr-1" />
                                        <span className="text-sm font-bold text-gray-700">{book.rating}</span>
                                    </div>
                                </div>

                                <h3 className="text-xl font-bold text-gray-900 mb-1">{book.title}</h3>
                                <p className="text-sm text-gray-500 mb-4">{book.author}</p>
                                <p className="text-sm text-gray-600 line-clamp-2 mb-6 flex-1 italic">
                                    "{book.description}"
                                </p>

                                <div className="space-y-4">
                                    <div>
                                        <div className="flex justify-between text-xs mb-1">
                                            <span className="text-gray-500 font-medium">O'qish jarayoni</span>
                                            <span className="text-emerald-600 font-bold">{book.progress}%</span>
                                        </div>
                                        <ProgressBar value={book.progress} color="success" size="sm" />
                                    </div>

                                    <div className="flex gap-2">
                                        <Button variant="outline" size="sm" className="flex-1" icon={Eye}>Mutolaa</Button>
                                        {book.progress === 100 && book.testStatus !== 'completed' ? (
                                            <Button variant="primary" size="sm" className="flex-1" icon={ArrowRight}>Test topshirish</Button>
                                        ) : book.testStatus === 'completed' ? (
                                            <Button variant="secondary" size="sm" className="flex-1" disabled icon={CheckCircle}>Test topshirildi</Button>
                                        ) : (
                                            <Button variant="secondary" size="sm" className="flex-1" icon={Bookmark}>Saqlash</Button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Card>
                ))}
            </div>
        </div>
    );
};

export default LibraryModule;
