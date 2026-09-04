import React, { useRef, useState } from 'react';
import { Upload, FileText, X } from 'lucide-react';
import { TOURNAMENT_FILE_UPLOAD } from '../../constants';
import { SCORING_MODES, isMatchBasedEngine } from '../../config/competitionEngines';

const inputClass = "w-full px-4 py-3 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm";
const labelClass = "block text-xs font-bold text-gray-700 uppercase mb-1.5";

// Step 4 — review summary, description, and file attachment. The attachment is UI-only (validated +
// previewed client-side, bytes never persisted) — matches every other upload flow already in this
// codebase (SocialActivityIndex, ReportingModule, SettingsPage all work the same way; there is no real
// file-storage backend here to persist into).
const TournamentReviewStep = ({ data, onChange, club, preset }) => {
    const fileInputRef = useRef(null);
    const [fileError, setFileError] = useState('');

    const isQuizMixedPreset = preset?.scoringEngine === 'quiz_mixed';
    const isCorrectAnswerPreset = preset?.scoringEngine === 'correct_answer';
    // Kubok: per-Tur individually-built cupTurs. Liga: one shared "Tur andozasi" (leagueRoundTemplate)
    // repeated across leagueTours turs — see TournamentStructureStep.jsx.
    const cupAllRaunds = data.format === 'cup' ? data.cupTurs.flatMap(t => t.raunds) : [];
    const leagueTemplateQuestions = (data.leagueRoundTemplate || []).reduce((s, r) => s + (Number(r.questionsCount) || 0), 0);
    const roundsTotal = data.format === 'cup'
        ? cupAllRaunds.length
        : (data.leagueRoundTemplate || []).length * (Number(data.leagueTours) || 1);
    const questionsTotal = isCorrectAnswerPreset
        ? (data.format === 'cup'
            ? cupAllRaunds.reduce((s, r) => s + (Number(r.questionsCount) || 0), 0)
            : leagueTemplateQuestions * (Number(data.leagueTours) || 1))
        : null;
    // Same 4-way split buildCompetitionPayload uses — the summary line must describe whichever one
    // actually decides this competition's real structure, not always the Kubok/Liga fields.
    const structureSummary = (() => {
        if (isQuizMixedPreset && data.useFreeStructure) {
            const savolCount = (data.structure?.bosqichlar || []).reduce((sum, b) =>
                sum + b.turlar.reduce((s2, t) => s2 + t.raundlar.reduce((s3, r) => s3 + (Number(r.savolCount) || 0), 0), 0), 0);
            const turCount = (data.structure?.bosqichlar || []).reduce((sum, b) => sum + b.turlar.length, 0);
            return `Erkin tuzilma — ${turCount} Tur, ${savolCount} savol`;
        }
        if (isQuizMixedPreset && preset?.defaults?.stages) {
            return `${preset.label} andozasi — ${preset.defaults.roundRules.length} raund`;
        }
        if (isCorrectAnswerPreset) {
            return questionsTotal !== null ? `${roundsTotal} raund / ${questionsTotal} savol` : `${roundsTotal} raund`;
        }
        if (isMatchBasedEngine(preset?.scoringEngine)) {
            return "Guruh + Pley-off — jamoalar ro'yxatdan o'tgach shakllantiriladi";
        }
        return `${data.simpleRoundsCount} raund`;
    })();
    const summaryItems = [
        { label: 'Nomi', value: data.name || '—' },
        { label: 'Klub', value: club?.name || '—' },
        { label: 'Turnir turi', value: preset?.label || '—' },
        { label: 'Joy', value: data.location || '—' },
        { label: 'Boshlanish sanasi', value: data.startDate || '—' },
        {
            label: "Ro'yxatdan o'tish",
            value: data.registrationRequired
                ? `${data.registrationOpensAt ? new Date(data.registrationOpensAt).toLocaleString('uz-UZ') : '—'} dan${data.registrationClosesAt ? ` ${new Date(data.registrationClosesAt).toLocaleString('uz-UZ')} gacha` : ' turnir boshlanishigacha'}`
                : 'Kerak emas'
        },
        { label: 'Tuzilma', value: structureSummary },
        { label: 'Baholash rejimi', value: SCORING_MODES.find(m => m.id === data.scoringMode)?.label || '—' },
        ...(isCorrectAnswerPreset
            ? [{ label: 'Ball / jarima', value: `+${data.pointsPerCorrectAnswer} / -${data.penaltyPerWrongAnswer}${data.penaltyRuleNote ? ` — ${data.penaltyRuleNote}` : ''}` }]
            : []),
        // Only meaningful for team-type competitions — showing it for e.g. Zakovat/TEDx (individual)
        // was a leftover from before RegistrationSettingsFields.jsx's team-size fields were gated.
        ...(data.type === 'team' ? [{ label: 'Jamoa hajmi', value: `${data.teamMinSize}–${data.teamMaxSize} a'zo` }] : []),
        // New this session — free-structure-only fields, silently invisible here before this fix.
        ...(isQuizMixedPreset && data.useFreeStructure && data.groupingMode !== 'none'
            ? [{ label: 'Guruhlash mezoni', value: data.groupingMode === 'faculty' ? 'Fakultet kesimida' : 'Kurs kesimida' }]
            : []),
        ...(isQuizMixedPreset && data.useFreeStructure && data.pointTables
            ? [{ label: 'Ball jadvali', value: "Standart qiymatlardan o'zgartirilgan" }]
            : []),
    ];

    const handleFile = (file) => {
        setFileError('');
        if (!file) return;
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        if (!TOURNAMENT_FILE_UPLOAD.ALLOWED_EXTENSIONS.includes(ext)) {
            setFileError(`Ruxsat etilmagan format. Qabul qilinadi: ${TOURNAMENT_FILE_UPLOAD.ALLOWED_EXTENSIONS.join(', ')}`);
            return;
        }
        if (file.size > TOURNAMENT_FILE_UPLOAD.MAX_SIZE_MB * 1024 * 1024) {
            setFileError(`Fayl hajmi ${TOURNAMENT_FILE_UPLOAD.MAX_SIZE_MB} MB dan oshmasligi kerak.`);
            return;
        }
        const isImage = file.type.startsWith('image/');
        onChange({
            attachment: {
                name: file.name,
                sizeLabel: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
                previewUrl: isImage ? URL.createObjectURL(file) : null,
                isImage
            }
        });
    };

    return (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-6">
            <div>
                <h3 className="text-lg font-bold text-gray-900">4. Tavsif va hujjatlar</h3>
                <p className="text-sm text-gray-500">Turnir haqida qo'shimcha ma'lumot va hujjatlar</p>
            </div>

            <div className="p-4 bg-slate-50 border border-gray-100 rounded-2xl grid grid-cols-1 sm:grid-cols-2 gap-3">
                {summaryItems.map(item => (
                    <div key={item.label}>
                        <p className="text-[10px] font-bold text-gray-400 uppercase">{item.label}</p>
                        <p className="text-sm font-semibold text-gray-800 truncate">{item.value}</p>
                    </div>
                ))}
            </div>

            <div>
                <label className={labelClass}>Turnir haqida batafsil ma'lumot</label>
                <textarea
                    rows={5}
                    className={inputClass}
                    placeholder="Turnir qoidalari, maqsadi va boshqa muhim tafsilotlar..."
                    value={data.description}
                    onChange={e => onChange({ description: e.target.value })}
                />
            </div>

            <div>
                <label className={labelClass}>Hujjat yuklash (PDF, DOC, DOCX, JPG, PNG — max 30 MB)</label>
                <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept={TOURNAMENT_FILE_UPLOAD.ALLOWED_EXTENSIONS.join(',')}
                    onChange={e => handleFile(e.target.files?.[0])}
                />
                {!data.attachment ? (
                    <label
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]); }}
                        className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-2xl py-8 cursor-pointer hover:bg-gray-50 transition-colors"
                    >
                        <Upload size={22} className="text-gray-400" />
                        <span className="text-sm font-semibold text-gray-500">Faylni shu yerga tashlang yoki tanlash uchun bosing</span>
                    </label>
                ) : (
                    <div className="flex items-center gap-3 p-3 border border-gray-200 rounded-2xl">
                        {data.attachment.isImage ? (
                            <img src={data.attachment.previewUrl} alt="preview" className="w-12 h-12 object-cover rounded-lg" />
                        ) : (
                            <div className="w-12 h-12 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                                <FileText size={20} />
                            </div>
                        )}
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">{data.attachment.name}</p>
                            <p className="text-xs text-gray-400">{data.attachment.sizeLabel}</p>
                        </div>
                        <button type="button" onClick={() => onChange({ attachment: null })} className="p-1.5 text-gray-400 hover:text-red-500">
                            <X size={16} />
                        </button>
                    </div>
                )}
                {fileError && <p className="text-xs text-red-500 mt-1.5">{fileError}</p>}
            </div>
        </div>
    );
};

export default TournamentReviewStep;
