import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AudioAnalyzer } from './services/audioAnalyzer';
import { analyzeAudioWithGemini } from './services/geminiService';
import Spectrogram, { SpectrogramHandle } from './components/Spectrogram';
import { MetricsDisplay } from './components/MetricsDisplay';
import { AnalysisStatus, AudioMetrics } from './types';
import { Mic, Square, Activity, Cpu, Volume2, BookOpen, SkipForward } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const analyzer = new AudioAnalyzer();

// Phrase designed to test sibilants, vowels, and intonation range
const TEST_PHRASE = "O brilho intenso do sol revela a força da natureza, enquanto o vento sopra suavemente pelas árvores antigas.";

export default function App() {
  const [status, setStatus] = useState<AnalysisStatus>(AnalysisStatus.IDLE);
  const [metrics, setMetrics] = useState<AudioMetrics>({ pitch: 0, volume: -100, clarity: 0 });
  const [frequencyData, setFrequencyData] = useState<Uint8Array>(new Uint8Array(0));
  const [geminiAnalysis, setGeminiAnalysis] = useState<string | null>(null);
  const [isSpeakingInstructions, setIsSpeakingInstructions] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const animationRef = useRef<number>();
  const spectrogramRef = useRef<SpectrogramHandle>(null);
  const availableVoices = useRef<SpeechSynthesisVoice[]>([]);
  
  // Ref to manually resolve the instruction promise if needed (Skip button)
  const instructionResolverRef = useRef<(() => void) | null>(null);

  const updateMetrics = useCallback(() => {
    if (status === AnalysisStatus.RECORDING) {
      const pitch = analyzer.getPitch();
      const volume = analyzer.getVolume();
      const freqData = analyzer.getFrequencyData();
      
      // Update state for UI
      setMetrics({ pitch, volume, clarity: 0 });
      // Create a copy to trigger React render for Spectrogram
      setFrequencyData(new Uint8Array(freqData));
      
      animationRef.current = requestAnimationFrame(updateMetrics);
    }
  }, [status]);

  useEffect(() => {
    if (status === AnalysisStatus.RECORDING) {
      updateMetrics();
    } else {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    }
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [status, updateMetrics]);

  // Load voices eagerly to ensure they are available
  useEffect(() => {
    const loadVoices = () => {
        availableVoices.current = window.speechSynthesis.getVoices();
    };
    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  const skipInstructions = useCallback(() => {
    window.speechSynthesis.cancel();
    if (instructionResolverRef.current) {
        instructionResolverRef.current();
        instructionResolverRef.current = null;
    }
    setIsSpeakingInstructions(false);
  }, []);

  const speakInstructions = (): Promise<void> => {
    return new Promise((resolve) => {
      instructionResolverRef.current = resolve;
      
      // Safety timeout: If TTS hangs for more than 10s, auto-skip
      const timeoutId = setTimeout(() => {
          console.warn("TTS timeout exceeded. Skipping instructions.");
          skipInstructions();
      }, 10000);

      // 1. Reset synthesis
      window.speechSynthesis.cancel();

      setIsSpeakingInstructions(true);
      const text = "Para análise perfeita, leia a frase na tela. Varie a entonação do grave ao agudo. Comece agora.";
      const utterance = new SpeechSynthesisUtterance(text);
      
      // 2. Refresh voices list
      let voices = availableVoices.current;
      if (voices.length === 0) {
        voices = window.speechSynthesis.getVoices();
      }

      // 3. Voice Selection Strategy
      const ptVoices = voices.filter(v => v.lang.toLowerCase().includes('pt'));
      const femaleKeywords = ['female', 'women', 'feminino', 'luciana', 'joana', 'maria', 'google português'];
      
      let selectedVoice = ptVoices.find(v => 
        femaleKeywords.some(keyword => v.name.toLowerCase().includes(keyword))
      );

      if (!selectedVoice && ptVoices.length > 0) {
        selectedVoice = ptVoices[0];
      }

      if (selectedVoice) {
        utterance.voice = selectedVoice;
        utterance.lang = selectedVoice.lang;
      } else {
        utterance.lang = 'pt-BR'; 
      }

      utterance.rate = 1.1; // Slightly faster for better UX
      utterance.volume = 1.0;

      utterance.onend = () => {
        clearTimeout(timeoutId);
        skipInstructions(); // Reusing logic to resolve and cleanup
      };
      
      utterance.onerror = (e) => {
        console.warn("TTS Error:", e);
        clearTimeout(timeoutId);
        skipInstructions();
      };

      // 4. Speak
      try {
          window.speechSynthesis.speak(utterance);
      } catch (err) {
          console.error("TTS Launch Error:", err);
          skipInstructions();
      }
    });
  };

  const startAnalysisFlow = async () => {
    try {
        setGeminiAnalysis(null);
        
        // 1. Initialize Audio Context (must be user gesture)
        const stream = await analyzer.start();

        // 2. Play Instructions (with Wait)
        // Note: We await this so recording starts AFTER instructions
        await speakInstructions();

        // 3. Start Recording Logic
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        chunksRef.current = [];

        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
            chunksRef.current.push(e.data);
            }
        };

        recorder.start();
        setStatus(AnalysisStatus.RECORDING);

    } catch (err) {
        console.error("Error flow:", err);
        alert("Erro ao iniciar. Verifique permissões de microfone.");
        setStatus(AnalysisStatus.IDLE);
    }
  };

  const stopRecording = async () => {
    // Stop speaking if user interrupts
    window.speechSynthesis.cancel();
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      // Capture spectrogram image before stopping updates
      const spectrogramImage = spectrogramRef.current?.getCanvasImage();
      
      mediaRecorderRef.current.stop();
      analyzer.stop();
      setStatus(AnalysisStatus.PROCESSING);

      // Wait for recorder to finalize
      mediaRecorderRef.current.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        await performGeminiAnalysis(blob, spectrogramImage);
      };
    }
  };

  const performGeminiAnalysis = async (audioBlob: Blob, spectrogramImage?: string | null) => {
    try {
      const result = await analyzeAudioWithGemini(audioBlob, spectrogramImage || undefined);
      setGeminiAnalysis(result);
      setStatus(AnalysisStatus.COMPLETED);
    } catch (e) {
      setGeminiAnalysis("Falha na análise da IA.");
      setStatus(AnalysisStatus.ERROR);
    }
  };

  return (
    <div className="min-h-screen bg-sci-fi-bg text-gray-200 p-4 md:p-8 font-sans selection:bg-sci-fi-accent selection:text-black">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex items-center justify-between border-b border-gray-800 pb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-sci-fi-panel border border-sci-fi-accent rounded-lg shadow-[0_0_10px_rgba(0,240,255,0.2)]">
               <Activity className="w-6 h-6 text-sci-fi-accent" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
                VocalScan <span className="text-sci-fi-accent">AI</span>
              </h1>
              <p className="text-xs text-gray-500 font-mono tracking-wider">
                SISTEMA DE ANÁLISE ESPECTRAL E SEMÂNTICA
              </p>
            </div>
          </div>
          
          <div className="hidden md:flex items-center gap-2 text-xs font-mono text-gray-500">
             <span className={`w-2 h-2 rounded-full ${status === AnalysisStatus.RECORDING ? 'bg-red-500 animate-pulse' : 'bg-gray-700'}`}></span>
             STATUS: {isSpeakingInstructions ? "INSTRUINDO" : status}
          </div>
        </header>

        {/* Main Display Area */}
        <main className="space-y-6">
          
          {/* Visualizer Section */}
          <section className="relative">
             <Spectrogram 
               ref={spectrogramRef}
               dataArray={frequencyData} 
               isActive={status === AnalysisStatus.RECORDING} 
             />
             
             {status === AnalysisStatus.IDLE && !geminiAnalysis && !isSpeakingInstructions && (
               <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                 <p className="text-gray-600 font-mono text-sm bg-black/50 px-4 py-2 rounded border border-gray-800">
                   AGUARDANDO ENTRADA DE ÁUDIO...
                 </p>
               </div>
             )}

            {isSpeakingInstructions && (
               <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/60 backdrop-blur-sm transition-all">
                 <div className="bg-sci-fi-panel border border-sci-fi-accent p-6 rounded-xl shadow-2xl flex flex-col items-center max-w-sm mx-auto">
                    <Volume2 className="w-12 h-12 text-sci-fi-accent animate-pulse mb-4" />
                    <p className="text-white font-bold text-lg mb-1">Ouvindo Instruções...</p>
                    <p className="text-gray-400 text-xs mb-6 text-center">Aguarde o final ou pule para gravar</p>
                    
                    <button 
                        onClick={skipInstructions}
                        className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white text-sm px-4 py-2 rounded-full transition-colors border border-gray-600"
                    >
                        <SkipForward className="w-4 h-4" />
                        PULAR INSTRUÇÃO
                    </button>
                 </div>
               </div>
             )}
          </section>
          
          {/* Reading Prompt - Only Visible During Recording/Instructions */}
          {(status === AnalysisStatus.RECORDING || isSpeakingInstructions) && (
             <div className="bg-sci-fi-panel border-l-4 border-sci-fi-secondary p-6 rounded-r-lg shadow-lg relative overflow-hidden transition-all animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-start gap-4">
                    <BookOpen className="w-6 h-6 text-sci-fi-secondary flex-shrink-0 mt-1" />
                    <div>
                        <h3 className="text-sm text-gray-400 uppercase tracking-widest font-mono mb-2">
                            Texto para Leitura
                        </h3>
                        <p className="text-xl md:text-2xl text-white font-medium leading-relaxed">
                            "{TEST_PHRASE}"
                        </p>
                    </div>
                </div>
             </div>
          )}

          {/* Real-time Metrics */}
          <MetricsDisplay metrics={metrics} />

          {/* Controls */}
          <div className="flex justify-center gap-6 py-4">
            {status === AnalysisStatus.RECORDING ? (
              <button 
                onClick={stopRecording}
                className="group relative px-8 py-4 bg-red-900/20 border border-red-500 text-red-500 rounded-full hover:bg-red-500 hover:text-white transition-all duration-300 flex items-center gap-3 font-bold tracking-wider"
              >
                <span className="absolute inset-0 rounded-full border border-red-500 opacity-50 animate-ping group-hover:animate-none"></span>
                <Square className="w-5 h-5 fill-current" />
                PARAR ANÁLISE
              </button>
            ) : (
              <button 
                onClick={startAnalysisFlow}
                disabled={status === AnalysisStatus.PROCESSING || isSpeakingInstructions}
                className={`px-8 py-4 rounded-full border flex items-center gap-3 font-bold tracking-wider transition-all duration-300 shadow-[0_0_20px_rgba(0,240,255,0.15)]
                  ${status === AnalysisStatus.PROCESSING || isSpeakingInstructions
                    ? 'bg-gray-800 border-gray-700 text-gray-500 cursor-not-allowed' 
                    : 'bg-sci-fi-panel border-sci-fi-accent text-sci-fi-accent hover:bg-sci-fi-accent hover:text-black hover:shadow-[0_0_30px_rgba(0,240,255,0.4)]'
                  }`}
              >
                 {status === AnalysisStatus.PROCESSING ? (
                   <>
                    <Cpu className="w-5 h-5 animate-spin" />
                    PROCESSANDO IA...
                   </>
                 ) : isSpeakingInstructions ? (
                    <>
                    <Volume2 className="w-5 h-5 animate-pulse" />
                    INSTRUINDO...
                   </>
                 ) : (
                   <>
                    <Mic className="w-5 h-5" />
                    INICIAR TESTE
                   </>
                 )}
              </button>
            )}
          </div>

          {/* Gemini Analysis Result */}
          {geminiAnalysis && (
            <div className="mt-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className="bg-[#0a0a0a] border border-gray-800 rounded-xl p-6 md:p-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                   <Cpu className="w-24 h-24 text-white" />
                </div>
                
                <h2 className="text-xl text-sci-fi-accent font-bold mb-6 flex items-center gap-2 border-b border-gray-800 pb-4">
                  <span className="text-lg">✨</span> RELATÓRIO DE ANÁLISE VOCAL
                </h2>
                
                <div className="prose prose-invert prose-p:text-gray-300 prose-headings:text-gray-100 prose-li:text-gray-300 max-w-none">
                  <ReactMarkdown>{geminiAnalysis}</ReactMarkdown>
                </div>
                
                <div className="mt-6 pt-6 border-t border-gray-800 flex justify-between items-center">
                    <p className="text-xs text-gray-600 font-mono">
                      Gerado por Gemini 2.5 Flash
                    </p>
                    <button 
                      onClick={() => setGeminiAnalysis(null)}
                      className="text-xs text-sci-fi-accent hover:underline"
                    >
                      Limpar Resultado
                    </button>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}