import React from 'react';
import { Check } from 'lucide-react';

// 1-2-3-4 step indicator + progress bar for the tournament creation wizard.
const StepIndicator = ({ currentStep, steps }) => {
    const progressPct = ((currentStep - 1) / (steps.length - 1)) * 100;

    return (
        <div className="px-6 pt-6 pb-2">
            <div className="flex items-center justify-between max-w-3xl mx-auto">
                {steps.map((step, idx) => {
                    const stepNum = idx + 1;
                    const isCompleted = stepNum < currentStep;
                    const isActive = stepNum === currentStep;
                    return (
                        <div key={step.id} className="flex-1 flex flex-col items-center relative">
                            {idx > 0 && (
                                <div
                                    className={`absolute top-4 right-1/2 w-full h-0.5 -z-0 ${
                                        stepNum <= currentStep ? 'bg-indigo-600' : 'bg-gray-200'
                                    }`}
                                />
                            )}
                            <div
                                className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs border-2 transition-all ${
                                    isCompleted
                                        ? 'bg-indigo-600 border-indigo-600 text-white'
                                        : isActive
                                            ? 'bg-white border-indigo-600 text-indigo-600'
                                            : 'bg-white border-gray-200 text-gray-400'
                                }`}
                            >
                                {isCompleted ? <Check size={14} strokeWidth={3} /> : stepNum}
                            </div>
                            <span className={`mt-2 text-[11px] font-semibold text-center ${isActive ? 'text-indigo-600' : isCompleted ? 'text-gray-700' : 'text-gray-400'}`}>
                                {step.label}
                            </span>
                        </div>
                    );
                })}
            </div>
            <div className="max-w-3xl mx-auto mt-4 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                    className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                />
            </div>
        </div>
    );
};

export default StepIndicator;
