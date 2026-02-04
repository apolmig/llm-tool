import React from 'react';

const TitleBar: React.FC = () => {
    return (
        <div className="h-[35px] w-full bg-slate-950 flex items-center select-none relative z-50 flex-shrink-0 border-b border-slate-800/50">
            {/* Drag Region */}
            <div
                className="flex-1 h-full flex items-center px-4"
                style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
            >
                <div className="flex items-center gap-3 opacity-80">
                    <img src="./presidencia-logo.png" className="h-5" alt="App Icon" />
                    <span className="text-[10px] uppercase font-bold text-slate-500 tracking-widest border-l border-slate-700 pl-3">CiudadanIA</span>
                </div>
            </div>

            {/* Window Controls Spacer (handled by Electron Overlay) */}
            <div className="w-[140px] h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} />
        </div>
    );
};

export default TitleBar;
