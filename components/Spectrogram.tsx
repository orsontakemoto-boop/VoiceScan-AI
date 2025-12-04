import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

interface SpectrogramProps {
  dataArray: Uint8Array;
  isActive: boolean;
}

export interface SpectrogramHandle {
  getCanvasImage: () => string | null;
}

const Spectrogram = forwardRef<SpectrogramHandle, SpectrogramProps>(({ dataArray, isActive }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tempCanvasRef = useRef<HTMLCanvasElement>(null);

  useImperativeHandle(ref, () => ({
    getCanvasImage: () => {
      return canvasRef.current ? canvasRef.current.toDataURL('image/png') : null;
    }
  }));

  useEffect(() => {
    // Initialize temp canvas once
    if (!tempCanvasRef.current) {
        tempCanvasRef.current = document.createElement('canvas');
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const tempCanvas = tempCanvasRef.current;
    if (!canvas || !tempCanvas || !isActive || dataArray.length === 0) return;

    const ctx = canvas.getContext('2d');
    const tempCtx = tempCanvas.getContext('2d');
    if (!ctx || !tempCtx) return;

    // Match dimensions
    if (tempCanvas.width !== canvas.width || tempCanvas.height !== canvas.height) {
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
    }

    const width = canvas.width;
    const height = canvas.height;
    
    // 1. Draw current state to temp canvas
    tempCtx.drawImage(canvas, 0, 0);

    // 2. Draw everything shifted left by 2 pixels
    ctx.fillStyle = '#050505'; // Background color
    ctx.fillRect(0, 0, width, height);
    
    // Draw back the old image shifted
    ctx.drawImage(tempCanvas, -2, 0);

    // 3. Draw new data column on the right edge
    // We only want the bottom half of frequencies usually for voice (0-4kHz is most relevant)
    // but we will map the full buffer to the height.
    const sliceWidth = 2;
    const x = width - sliceWidth;

    // The dataArray contains 0-255 values for frequency bins.
    // We iterate from low freq (index 0) to high freq (end).
    // In spectrograms, usually low freq is at bottom.
    
    const binCount = dataArray.length;
    // Map binCount to height
    
    for (let i = 0; i < height; i++) {
        // Map pixel y to frequency index
        // y=height is low freq (index 0), y=0 is high freq
        const freqIndex = Math.floor(((height - i) / height) * (binCount / 1.5)); // Cut off ultra high freqs
        
        if (freqIndex < binCount) {
            const value = dataArray[freqIndex];
            
            // Color mapping based on intensity (0-255)
            if (value > 10) {
                // Hue varies by intensity: Cold (Blue) -> Hot (Red/White)
                // 0 -> Blue/Black
                // 128 -> Purple
                // 200 -> Cyan
                // 255 -> White
                
                let r=0, g=0, b=0;
                
                if (value < 128) {
                    // Dark Blue to Purple
                    r = value; 
                    g = 0;
                    b = 100 + value;
                } else if (value < 200) {
                    // Purple to Cyan
                    r = 128 - (value - 128);
                    g = (value - 128) * 3;
                    b = 255;
                } else {
                    // Cyan to White
                    r = (value - 200) * 5;
                    g = 255;
                    b = 255;
                }

                ctx.fillStyle = `rgb(${r},${g},${b})`;
                ctx.fillRect(x, i, sliceWidth, 1);
            }
        }
    }

  }, [dataArray, isActive]);

  return (
    <div className="relative w-full h-64 bg-sci-fi-panel border border-gray-800 rounded-lg overflow-hidden shadow-[0_0_15px_rgba(0,240,255,0.1)]">
        <canvas 
            ref={canvasRef} 
            width={800} 
            height={400} 
            className="w-full h-full object-cover"
        />
        <div className="absolute bottom-2 right-2 text-xs text-gray-500 font-mono">
            Tempo &rarr;
        </div>
        <div className="absolute top-2 left-2 text-xs text-gray-500 font-mono">
            Freq &uarr;
        </div>
    </div>
  );
});

export default Spectrogram;