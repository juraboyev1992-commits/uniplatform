import React, { useState } from 'react';
import {
    Shirt,
    Plus,
    Edit,
    Trash2,
    Database,
    Tag,
    ShoppingBag,
    TrendingUp,
    Search,
    Filter,
    BarChart3,
    Package,
    Coins,
    Image as ImageIcon,
    CheckCircle
} from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';

const WardrobeManagement = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [isStoreModalOpen, setIsStoreModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);

    // Mock store items
    const [storeItems, setStoreItems] = useState([
        {
            id: 1,
            name: "Oq-ko'k Hoodie (Logo bilan)",
            category: 'Kiyim-kechak',
            price: 500,
            stock: 25,
            sold: 142,
            image: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&q=80&w=200',
            description: 'Universitet logotipi tushirilgan, yuqori sifatli paxtadan tayyorlangan hoodie.'
        },
        {
            id: 2,
            name: 'Akademik Bloknot (Charm)',
            category: 'Kanselyariya',
            price: 150,
            stock: 120,
            sold: 310,
            image: 'https://images.unsplash.com/photo-1531346878377-a5be20888e57?auto=format&fit=crop&q=80&w=200',
            description: 'Eslatmalar va rejalar uchun qulay charm jildli bloknot.'
        },
        {
            id: 3,
            name: 'Sport futbolkasi (Besh tashabbus)',
            category: 'Kiyim-kechak',
            price: 300,
            stock: 15,
            sold: 84,
            image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&q=80&w=200',
            description: 'Besh tashabbus loyihasi ranglaridagi sport futbolkasi.'
        }
    ]);

    const stats = [
        { label: 'Umumiy Sotuvlar', value: '536', icon: ShoppingBag, color: 'text-indigo-600', bg: 'bg-indigo-50' },
        { label: 'Jami Tangalar', value: '185,400', icon: Coins, color: 'text-yellow-600', bg: 'bg-yellow-50' },
        { label: "Kamyob tovarlar", value: '12', icon: Package, color: 'text-orange-600', bg: 'bg-orange-50' },
        { label: "Oylik o'sish", value: '+24%', icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' }
    ];

    const handleDelete = (id) => {
        if (window.confirm('Ushbu mahsulotni do\'kondan olib tashlamoqchimisiz?')) {
            setStoreItems(storeItems.filter(item => item.id !== id));
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tighter flex items-center gap-3 italic">
                        <ShoppingBag className="w-8 h-8 text-indigo-600" />
                        Garderob & Do'kon Boshqaruvi
                    </h1>
                    <p className="text-gray-500 font-medium italic">Tangalar (coins) evaziga beriladigan mahsulotlar nazorati</p>
                </div>
                <Button
                    variant="primary"
                    icon={Plus}
                    onClick={() => {
                        setEditingItem(null);
                        setIsStoreModalOpen(true);
                    }}
                    className="font-black bg-indigo-600 shadow-lg shadow-indigo-100 italic"
                >
                    Yangi Mahsulot Qo'shish
                </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {stats.map((stat, idx) => (
                    <Card key={idx} className="border-none shadow-sm h-full overflow-hidden relative">
                        <div className="flex items-center gap-4 z-10 relative">
                            <div className={`p-4 rounded-2xl ${stat.bg}`}>
                                <stat.icon className={`w-6 h-6 ${stat.color}`} />
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-gray-400 border-b border-gray-100 pb-1 mb-1.5 uppercase tracking-widest">{stat.label}</p>
                                <p className="text-2xl font-black text-gray-900 leading-none">{stat.value}</p>
                            </div>
                        </div>
                    </Card>
                ))}
            </div>

            {/* Filter */}
            <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                        type="text"
                        placeholder="Mahsulot nomi bo'yicha qidirish..."
                        className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 transition-all font-bold italic"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-2 bg-white px-4 py-2 border border-gray-100 rounded-2xl shadow-sm">
                    <Filter className="w-4 h-4 text-gray-400" />
                    <select className="bg-transparent font-bold text-sm text-gray-600 focus:outline-none">
                        <option>Barcha turdagi</option>
                        <option>Kiyimlar</option>
                        <option>Aksessuarlar</option>
                        <option>Kanselyariya</option>
                    </select>
                </div>
            </div>

            {/* Products Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {storeItems.map(item => (
                    <Card key={item.id} className="group overflow-hidden border-none shadow-sm hover:shadow-xl transition-all duration-300">
                        <div className="relative h-48 -mx-6 -mt-6 mb-4 overflow-hidden">
                            <img src={item.image} alt={item.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                            <div className="absolute top-4 left-4">
                                <Badge variant="primary" className="font-black italic shadow-lg">{item.category}</Badge>
                            </div>
                            <div className="absolute top-4 right-4 flex gap-2">
                                <button
                                    onClick={() => {
                                        setEditingItem(item);
                                        setIsStoreModalOpen(true);
                                    }}
                                    className="p-2 bg-white/90 backdrop-blur-sm text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                                >
                                    <Edit size={16} />
                                </button>
                                <button
                                    onClick={() => handleDelete(item.id)}
                                    className="p-2 bg-white/90 backdrop-blur-sm text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-all shadow-sm"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>

                        <div className="flex justify-between items-start mb-2">
                            <h3 className="text-lg font-black text-gray-900 leading-tight tracking-tighter">{item.name}</h3>
                            <div className="flex items-center gap-1 text-yellow-600 bg-yellow-50 px-2 py-1 rounded-lg">
                                <Coins size={14} className="fill-current" />
                                <span className="text-sm font-black">{item.price}</span>
                            </div>
                        </div>

                        <p className="text-xs text-gray-500 italic mb-4 line-clamp-2">"{item.description}"</p>

                        <div className="grid grid-cols-2 gap-3 pt-4 border-t border-gray-50">
                            <div className="bg-gray-50 p-2 rounded-xl text-center">
                                <p className="text-[10px] font-black text-gray-400 uppercase">Qoldiq</p>
                                <p className={`text-sm font-black ${item.stock < 20 ? 'text-red-600' : 'text-gray-900'}`}>{item.stock} ta</p>
                            </div>
                            <div className="bg-indigo-50 p-2 rounded-xl text-center">
                                <p className="text-[10px] font-black text-indigo-400 uppercase">Sotildi</p>
                                <p className="text-sm font-black text-indigo-900">{item.sold} ta</p>
                            </div>
                        </div>
                    </Card>
                ))}
            </div>

            {/* Store Item Modal */}
            <Modal
                isOpen={isStoreModalOpen}
                onClose={() => setIsStoreModalOpen(false)}
                title={editingItem ? "Mahsulotni tahrirlash" : "Yangi mahsulot qo'shish"}
                headerClassName="bg-indigo-600 text-white italic"
                size="xl"
            >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-1">
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5">Mahsulot nomi</label>
                            <input
                                type="text"
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-indigo-500 font-bold"
                                placeholder="Masalan: Hoodie Gold Edition"
                                defaultValue={editingItem?.name}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5">Narxi (Coins)</label>
                                <div className="relative">
                                    <Coins className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-yellow-500" />
                                    <input
                                        type="number"
                                        className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-indigo-500 font-bold"
                                        defaultValue={editingItem?.price}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5">Ombor (Soni)</label>
                                <div className="relative">
                                    <Package className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-500" />
                                    <input
                                        type="number"
                                        className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-indigo-500 font-bold"
                                        defaultValue={editingItem?.stock}
                                    />
                                </div>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5">Kategoriya</label>
                            <select className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-indigo-500 font-bold appearance-none">
                                <option>Kiyim-kechak</option>
                                <option>Aksessuarlar</option>
                                <option>Kanselyariya</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5">Tavsif</label>
                            <textarea
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-indigo-500 font-bold h-24 resize-none italic"
                                placeholder="Mahsulot haqida batafsil..."
                                defaultValue={editingItem?.description}
                            ></textarea>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="aspect-square border-4 border-dashed border-gray-100 rounded-3xl flex flex-col items-center justify-center text-center p-8 group hover:border-indigo-500 hover:bg-indigo-50/50 transition-all cursor-pointer">
                            <div className="w-20 h-20 bg-gray-50 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-soft">
                                <ImageIcon className="w-10 h-10 text-gray-300 group-hover:text-indigo-600" />
                            </div>
                            <p className="text-sm font-black text-gray-900 mb-1 italic">Rasm yuklang</p>
                            <p className="text-[10px] text-gray-400 uppercase font-black">PNG, JPG formatlar (Max 5MB)</p>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <Button variant="outline" className="flex-1 font-black h-12" onClick={() => setIsStoreModalOpen(false)}>BEKOR QILISH</Button>
                            <Button variant="primary" className="flex-1 font-black h-12 bg-indigo-600 shadow-xl shadow-indigo-100">SAQLASH</Button>
                        </div>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default WardrobeManagement;
