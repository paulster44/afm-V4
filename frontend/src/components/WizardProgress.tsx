import React from 'react';

type WizardProgressProps = {
    steps: string[];
    currentIndex: number;
    onStepClick: (index: number) => void;
};

const stepLabel = (name: string) => (name === '__review' ? 'Review' : name);

const WizardProgress: React.FC<WizardProgressProps> = ({ steps, currentIndex, onStepClick }) => (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 shadow-lg">
        {/* Step counter + current label */}
        <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-slate-300">
                Step {currentIndex + 1} of {steps.length}
            </span>
            <span className="text-sm font-medium text-emerald-400 truncate ml-2">
                {stepLabel(steps[currentIndex])}
            </span>
        </div>

        {/* Progress dots - always visible, wrap on all screens */}
        <div className="flex flex-wrap gap-1.5">
            {steps.map((name, i) => {
                const isActive = i === currentIndex;
                const isCompleted = i < currentIndex;
                return (
                    <button
                        key={name}
                        onClick={() => onStepClick(i)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                            isActive
                                ? 'bg-emerald-600 text-white'
                                : isCompleted
                                  ? 'bg-emerald-900/50 text-emerald-300 hover:bg-emerald-800/50'
                                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                        }`}
                        aria-label={`Go to step ${i + 1}: ${stepLabel(name)}`}
                    >
                        {isCompleted && (
                            <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                        )}
                        <span className="hidden sm:inline">{stepLabel(name)}</span>
                        <span className="sm:hidden">{i + 1}</span>
                    </button>
                );
            })}
        </div>
    </div>
);

export default WizardProgress;
