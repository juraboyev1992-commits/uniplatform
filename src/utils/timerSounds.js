// TAYMER OVOZLARI.
//
// NEGA FAYL EMAS: ovoz fayllari yuklanishi kerak, zalda esa internet
// uzilishi mumkin va aynan o'sha paytda taymer jim qolardi. Brauzerning
// o'zi ovoz hosil qila oladi (Web Audio) - fayl ham, yuklanish ham,
// kutish ham yo'q. Qo'shimcha foyda: ovoz balandligi va uzunligi aniq
// boshqariladi, ya'ni zalda eshitiladigan qilib sozlash mumkin.
//
// BRAUZER QOIDASI: ovoz faqat odam biror narsani BOSGANDAN keyin
// chiqadi. Operator "Boshlash" tugmasini bosadi - shu kifoya, lekin
// audio kontekstini o'sha bosishda uyg'otish kerak (`unlock`), aks holda
// birinchi signal jim ketadi.

// Har ovoz: chastota (Hz), to'lqin shakli va uzunligi.
// `end` - vaqt tugagandagi signal, u har doim uzunroq va pastroq.
export const TIMER_SOUNDS = [
    {
        id: 'beep',
        label: 'Yumshoq signal',
        tick: { freq: 880, type: 'sine', ms: 110 },
        end: { freq: 440, type: 'sine', ms: 900 },
    },
    {
        id: 'sharp',
        label: 'Keskin signal',
        tick: { freq: 1200, type: 'square', ms: 70 },
        end: { freq: 600, type: 'square', ms: 800 },
    },
    {
        id: 'bell',
        label: "Qo'ng'iroq",
        tick: { freq: 1568, type: 'triangle', ms: 160 },
        end: { freq: 784, type: 'triangle', ms: 1200 },
    },
    {
        id: 'metronome',
        label: 'Metronom',
        tick: { freq: 300, type: 'square', ms: 45 },
        end: { freq: 180, type: 'square', ms: 700 },
    },
    {
        id: 'silent',
        label: 'Ovozsiz',
        tick: null,
        end: null,
    },
];

export const getTimerSound = (id) =>
    TIMER_SOUNDS.find(s => s.id === id) || TIMER_SOUNDS[0];

let ctx = null;

const audioContext = () => {
    if (ctx) return ctx;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    try { ctx = new Ctor(); } catch { return null; }
    return ctx;
};

// Operator tugmani bosganda chaqiriladi. Brauzer audio kontekstni
// "to'xtatilgan" holatda yaratadi va uni faqat odam harakatidan keyin
// uyg'otishga ruxsat beradi.
export const unlockAudio = () => {
    const c = audioContext();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
};

// Bitta signal. Ovoz oxirida BIRDAN uzilmaydi - tez so'nadi, aks holda
// karnayda "chirt" etgan tovush qoladi.
const play = (spec, volume) => {
    if (!spec) return;
    const c = audioContext();
    if (!c || c.state !== 'running') return;
    try {
        const osc = c.createOscillator();
        const gain = c.createGain();
        const now = c.currentTime;
        const dur = spec.ms / 1000;

        osc.type = spec.type;
        osc.frequency.setValueAtTime(spec.freq, now);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(volume, now + 0.012);
        gain.gain.setValueAtTime(volume, now + Math.max(0.012, dur - 0.05));
        gain.gain.linearRampToValueAtTime(0, now + dur);

        osc.connect(gain);
        gain.connect(c.destination);
        osc.start(now);
        osc.stop(now + dur + 0.02);
    } catch {
        // Ovoz chiqmasa taymer baribir ishlayveradi - bu halokat emas.
    }
};

export const playTick = (soundId, volume = 0.35) => play(getTimerSound(soundId).tick, volume);
export const playEnd = (soundId, volume = 0.5) => play(getTimerSound(soundId).end, volume);
