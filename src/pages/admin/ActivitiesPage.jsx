import React from 'react';
import EventManagement from '../../components/admin/EventManagement';

// TADBIRLAR VA MUSOBAQALAR — bitta bo'lim.
//
// Bu sahifaning o'zida endi hech qanday tab yo'q: "Tadbirlar / Musobaqa-
// Turnirlar" almashtirgichi ko'rish komponentining ICHIDA turadi (talaba
// panelidagi bilan ayni komponent). Ilgari bu yerda ikkinchi tab qatori bor
// edi va ekranda ikkita bir xil almashtirgich chiqib qolardi.
//
// Ikkala eski manzil ham ishlayveradi, faqat kerakli tab ochilgan holda:
// avval yuborilgan havolalar buzilmasin.
const ActivitiesPage = ({ defaultKind = 'events' }) => (
    <EventManagement defaultKind={defaultKind} />
);

export default ActivitiesPage;
