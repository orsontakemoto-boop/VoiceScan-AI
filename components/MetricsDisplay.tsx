import React from 'react';
import { AudioMetrics } from '../types';

interface MetricsDisplayProps {
  metrics: AudioMetrics;
}

export const MetricsDisplay: React.FC<MetricsDisplayProps> = ({ metrics }) => {
  // Normalize dB for visualization bar (-60dB to 0dB range typically)
  const normalizedVol = Math.min(100, Math.max(0, (metrics.volume + 60) * (100 / 60)));

  return (
    <div className="grid grid-cols-2 gap-4 w-full max-w-2xl mx-auto my-6">
      {/* Frequency / Pitch Card */}
      <div className="bg-sci-fi-panel border border-sci-fi-accent/30 p-4 rounded-xl flex flex-col items-center justify-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-sci-fi-accent to-transparent opacity-50"></div>
        <h3 className="text-gray-400 text-sm font-mono uppercase tracking-widest mb-1">Frequência (Pitch)</h3>
        <div className="text-4xl font-bold text-white tabular-nums tracking-tighter">
          {metrics.pitch > 0 ? Math.round(metrics.pitch) : '--'} 
          <span className="text-lg text-sci-fi-accent ml-1 font-normal">Hz</span>
        </div>
        <div className="text-xs text-gray-500 mt-2">
            {metrics.pitch > 0 && metrics.pitch < 165 ? "Grave (Baixo)" : 
             metrics.pitch >= 165 && metrics.pitch < 255 ? "Médio (Tenor/Alto)" : 
             metrics.pitch >= 255 ? "Agudo (Soprano)" : "Silêncio"}
        </div>
      </div>

      {/* Intensity / dB Card */}
      <div className="bg-sci-fi-panel border border-sci-fi-secondary/30 p-4 rounded-xl flex flex-col items-center justify-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-sci-fi-secondary to-transparent opacity-50"></div>
        <h3 className="text-gray-400 text-sm font-mono uppercase tracking-widest mb-1">Intensidade</h3>
        <div className="text-4xl font-bold text-white tabular-nums tracking-tighter">
          {Math.round(metrics.volume)} 
          <span className="text-lg text-sci-fi-secondary ml-1 font-normal">dB</span>
        </div>
        
        {/* Volume Bar */}
        <div className="w-full h-2 bg-gray-800 rounded-full mt-3 overflow-hidden">
          <div 
            className="h-full bg-sci-fi-secondary transition-all duration-75 ease-out"
            style={{ width: `${normalizedVol}%` }}
          ></div>
        </div>
      </div>
    </div>
  );
};