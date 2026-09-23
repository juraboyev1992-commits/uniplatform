import React, { useState } from 'react';
import { REGION_OPTIONS, districtsOf } from '../../config/socialActivityIndex';

// HUDUD VA TUMAN TANLASH.
//
// Ikki joyda kerak - talaba tashrifni qayd etganda va administrator joylar
// katalogiga joy qo'shganda. Ikkalasi bir xil qiymat yozishi SHART: 9-mezon
// qoidasi hudud nomiga qarab ishlaydi, ikki joyda ikki xil yozuv bo'lsa
// qoida jim turib buziladi. Shuning uchun bitta komponent.
//
// NEGA HUDUD RO'YXATDAN, TUMAN ERKIN:
//   Hudud - 14 ta, o'zgarmaydi va qoida aynan shunga tayanadi. Erkin matnda
//   "Toshkent", "toshkent sh.", "Тошкент" uch xil qiymat bo'lib qolardi.
//   Tuman - 200 dan ortiq, yangisi tuzilishi va nomi o'zgarishi mumkin.
//   Eskirgan ro'yxat tufayli qaydni umuman yoza olmay qolish ro'yxatdagi
//   kamchilikdan yomonroq, shuning uchun "Boshqa" varianti bor.
//
// Fragment qaytaradi (o'rab turuvchi div yo'q) - chaqiruvchi joydagi
// grid ikkala maydonni o'z kataklariga joylashtira olsin.
const FIELD = 'w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm';

const RegionPicker = ({ region = '', district = '', onChange }) => {
    const [manual, setManual] = useState(false);
    const districts = districtsOf(region);

    const set = (next) => onChange?.({ region, district, ...next });

    return (
        <>
            <select
                value={region}
                onChange={(e) => {
                    setManual(false);
                    set({ region: e.target.value, district: '' });
                }}
                className={`${FIELD} bg-white`}
            >
                <option value="">Hudud (viloyat / shahar)...</option>
                {REGION_OPTIONS.map(r => (
                    <option key={r.code} value={r.name}>{r.name}</option>
                ))}
            </select>

            {region && !manual && districts.length > 0 && (
                <select
                    value={district}
                    onChange={(e) => {
                        if (e.target.value === '__other__') {
                            setManual(true);
                            set({ district: '' });
                        } else set({ district: e.target.value });
                    }}
                    className={`${FIELD} bg-white`}
                >
                    <option value="">Tuman / shahar...</option>
                    {districts.map(d => <option key={d} value={d}>{d}</option>)}
                    <option value="__other__">Boshqa &mdash; qo&rsquo;lda yozish</option>
                </select>
            )}

            {region && (manual || districts.length === 0) && (
                <input
                    type="text"
                    value={district}
                    onChange={(e) => set({ district: e.target.value })}
                    placeholder={districts.length === 0 ? 'Davlat va shahar' : 'Tuman / shahar'}
                    className={FIELD}
                />
            )}
        </>
    );
};

export default RegionPicker;
