
import React, { useState } from 'react';
import { FileUploader } from '../ui/FileUploader';
import { Wand2, Palette, Zap, Eraser, ArrowRight, Loader2, Download, Scissors, ArrowRightCircle } from 'lucide-react';
import { editImage } from '../../services/geminiService';
import { useLanguage } from '../../hooks/useLanguage';

type ToolMode = 'restore' | 'colorize' | 'enhance' | 'object-edit' | 'remove-bg';

interface ColorStyle {
  id: string;
  label: string;
  promptSuffix: string;
  color: string;
}

export const PhotoRestoration: React.FC = () => {
  const { t, language } = useLanguage();
  const [mode, setMode] = useState<ToolMode>('restore');
  const [image, setImage] = useState<File | null>(null);
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedColorStyle, setSelectedColorStyle] = useState<string>('realistic');

  const modes = [
    { id: 'restore', label: t.photo.modes.restore, icon: Wand2, desc: 'Remove scratches & fix tears' },
    { id: 'colorize', label: t.photo.modes.colorize, icon: Palette, desc: 'Turn B&W photos to color' },
    { id: 'enhance', label: t.photo.modes.enhance, icon: Zap, desc: 'Upscale & improve quality' },
    { id: 'remove-bg', label: t.photo.modes.removeBg, icon: Scissors, desc: 'Isolate subject on white' },
    { id: 'object-edit', label: t.photo.modes.magicEdit, icon: Eraser, desc: 'Nano Banana Smart Edits' },
  ];

  const colorStyles: ColorStyle[] = [
    { 
      id: 'realistic', 
      label: 'Realistic', 
      promptSuffix: 'Use strictly realistic colors, natural skin tones, and historically accurate colors.', 
      color: 'bg-green-500' 
    },
    { 
      id: 'vintage', 
      label: 'Vintage', 
      promptSuffix: 'Use a warm, slightly muted, nostalgic palette reminiscent of 1970s photography.', 
      color: 'bg-yellow-600' 
    },
    { 
      id: 'vibrant', 
      label: 'Vibrant', 
      promptSuffix: 'Use highly saturated, vibrant colors with high contrast for a modern cinematic look.', 
      color: 'bg-purple-500' 
    },
    { 
      id: 'pastel', 
      label: 'Pastel', 
      promptSuffix: 'Use a soft, dreamy, pastel color palette with low contrast.', 
      color: 'bg-pink-300' 
    },
    { 
      id: 'dramatic', 
      label: 'Dramatic', 
      promptSuffix: 'Use deep, moody lighting with strong shadows and rich colors.', 
      color: 'bg-red-700' 
    },
  ];

  const dataURLtoFile = (dataurl: string, filename: string) => {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
  };

  const getNextMode = (current: ToolMode): ToolMode | null => {
    switch (current) {
      case 'restore': return 'colorize';
      case 'colorize': return 'enhance';
      case 'enhance': return 'remove-bg';
      case 'remove-bg': return 'object-edit';
      default: return null;
    }
  };

  const handleSaveAndContinue = () => {
    if (resultImage) {
      const file = dataURLtoFile(resultImage, `edited-${Date.now()}.png`);
      setImage(file);
      setResultImage(null);
      
      const nextMode = getNextMode(mode);
      if (nextMode) {
        setMode(nextMode);
      }
      setError(null);
    }
  };

  const handleProcess = async () => {
    if (!image) return;
    
    setIsLoading(true);
    setError(null);
    setResultImage(null);

    let finalPrompt = "";
    let isRestorationMode = false;

    switch (mode) {
      case 'restore':
        isRestorationMode = true;
        // Explicitly forbid colorization and artistic style
        finalPrompt = "STRICT PHOTO RESTORATION TASK. 1. Remove all scratches, dust, tears, and noise. 2. DO NOT COLORIZE. If the image is Black & White, KEEP it Black & White. 3. DO NOT CHANGE THE STYLE. Do not make it look like an oil painting or illustration. 4. Sharpen facial details details naturally. Output must be photorealistic.";
        break;
      case 'colorize':
        isRestorationMode = true; // We use restoration mode to keep facial fidelity, but ask for color
        const style = colorStyles.find(s => s.id === selectedColorStyle);
        finalPrompt = `Colorize this black and white image. ${style?.promptSuffix || ''} Maintain the photorealistic texture of the skin and clothes. Do not turn into a painting.`;
        break;
      case 'enhance':
        isRestorationMode = true;
        finalPrompt = "High-Fidelity Image Enhancement. Upscale resolution, deblur, and denoise. STRICTLY maintain original colors and artistic style. Do not alter the subject's identity.";
        break;
      case 'remove-bg':
        isRestorationMode = true; // Keeping identity is crucial here too
        finalPrompt = "Identify the main subject of this image and isolate it. Replace the entire background with a clean SOLID WHITE background. Ensure the edges of the subject are sharp and precise. Do not modify the subject itself.";
        break;
      case 'object-edit':
        isRestorationMode = false; // Edits might be creative
        finalPrompt = `Edit this image using Nano Banana capabilities: ${prompt}. Maintain the style and lighting of the original image.`;
        break;
    }

    try {
      // Pass the isRestoration flag to the service
      const result = await editImage(image, finalPrompt, isRestorationMode);
      setResultImage(result);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to process image.");
    } finally {
      setIsLoading(false);
    }
  };

  const nextMode = getNextMode(mode);
  const nextModeLabel = nextMode ? modes.find(m => m.id === nextMode)?.label : '';

  return (
    <div className="max-w-[1600px] mx-auto px-4 pt-24 pb-20 min-h-screen">
      <div className="mb-10 text-center">
        <h2 className="text-3xl md:text-5xl font-heading font-bold uppercase tracking-tight mb-4 bg-gradient-to-b from-gray-900 via-gray-600 to-gray-800 dark:from-white dark:via-gray-200 dark:to-gray-500 bg-clip-text text-transparent drop-shadow-sm">
          {t.photo.restorationTitle}
        </h2>
        <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
          Advanced AI tools to bring your memories back to life.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-10">
        {modes.map((m) => (
          <button
            key={m.id}
            onClick={() => { setMode(m.id as ToolMode); setResultImage(null); setError(null); }}
            className={`flex flex-col items-center p-6 rounded-xl border transition-all duration-300 ${
              mode === m.id
                ? 'bg-black text-white dark:bg-white dark:text-black border-transparent shadow-lg transform scale-105'
                : 'bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-white/30'
            }`}
          >
            <m.icon className={`w-6 h-6 mb-3 ${mode === m.id ? 'text-current' : 'text-gray-400 dark:text-gray-500'}`} />
            <span className="font-bold text-sm uppercase tracking-wide whitespace-nowrap">{m.label}</span>
          </button>
        ))}
      </div>

      <div className="bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl p-6 lg:p-12 shadow-xl">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-12 xl:gap-16 items-start">
          
          {/* Input Section */}
          <div className="space-y-8">
            <div className="bg-gray-50 dark:bg-white/5 p-6 rounded-xl border border-gray-100 dark:border-white/5">
                <FileUploader 
                  label={t.photo.uploadLabel} 
                  onFileSelect={(f) => { setImage(f); setResultImage(null); }}
                  selectedFile={image}
                />
            </div>

            {mode === 'colorize' && (
              <div className="animate-fade-in space-y-3">
                <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                  {t.photo.styles}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {colorStyles.map((style) => (
                    <button
                      key={style.id}
                      onClick={() => setSelectedColorStyle(style.id)}
                      className={`relative px-3 py-4 rounded-lg border text-left transition-all ${
                        selectedColorStyle === style.id
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-500'
                          : 'border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5'
                      }`}
                    >
                      <div className={`w-3 h-3 rounded-full mb-2 ${style.color}`}></div>
                      <span className={`block text-xs font-bold ${selectedColorStyle === style.id ? 'text-blue-700 dark:text-blue-300' : 'text-gray-600 dark:text-gray-300'}`}>
                        {style.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {mode === 'object-edit' && (
              <div className="space-y-3 animate-fade-in">
                <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                  Nano Banana Instructions
                </label>
                <textarea 
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={t.photo.promptPlaceholder}
                  className="w-full bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-lg p-4 text-sm focus:outline-none focus:border-black dark:focus:border-white transition-colors min-h-[120px]"
                />
              </div>
            )}

            <button 
              onClick={handleProcess}
              disabled={!image || isLoading || (mode === 'object-edit' && !prompt.trim())}
              className={`w-full py-5 rounded-lg font-bold uppercase tracking-widest text-sm flex items-center justify-center space-x-2 rtl:space-x-reverse transition-all ${
                (!image || isLoading || (mode === 'object-edit' && !prompt.trim()))
                  ? 'bg-gray-200 dark:bg-white/10 text-gray-400 cursor-not-allowed'
                  : 'bg-black dark:bg-white text-white dark:text-black hover:opacity-90 shadow-lg' 
              }`}
            >
              {isLoading ? <Loader2 className="animate-spin" size={18} /> : <Wand2 size={18} />}
              <span>{isLoading ? t.common.processing : t.common.generate}</span>
            </button>
            
            {error && (
              <div className="text-red-500 text-xs text-center bg-red-50 dark:bg-red-900/20 p-3 rounded border border-red-200 dark:border-red-900/50">
                {error}
              </div>
            )}
          </div>

          {/* Result Section */}
          <div className="h-full min-h-[500px] bg-gray-100 dark:bg-black/40 rounded-xl border-2 border-dashed border-gray-200 dark:border-white/10 flex flex-col items-center justify-center text-center p-8 relative overflow-hidden">
            {resultImage ? (
               <div className="relative w-full h-full flex flex-col items-center justify-center animate-fade-in z-10">
                 <img src={resultImage} alt="Processed" className="max-w-full max-h-[500px] object-contain shadow-2xl rounded-lg mb-8" />
                 
                 <div className="flex flex-col sm:flex-row justify-center gap-4 w-full">
                   <a 
                    href={resultImage} 
                    download={`eslam-ai-${mode}.png`}
                    className="flex items-center justify-center px-8 py-3 bg-gray-800 dark:bg-white text-white dark:text-black rounded-full text-xs font-bold uppercase hover:bg-gray-900 dark:hover:bg-gray-200 transition-colors shadow-lg"
                   >
                     <Download size={14} className="mr-2 rtl:ml-2 rtl:mr-0" /> {t.common.download}
                   </a>

                   {nextMode && (
                     <button 
                       onClick={handleSaveAndContinue}
                       className="flex items-center justify-center px-8 py-3 bg-blue-600 text-white rounded-full text-xs font-bold uppercase hover:bg-blue-700 transition-colors shadow-lg animate-pulse-slow"
                     >
                       <ArrowRightCircle size={14} className="mr-2 rtl:ml-2 rtl:mr-0" /> {t.common.saveAndContinue}: {nextModeLabel}
                     </button>
                   )}
                 </div>
               </div>
            ) : (
              <div className="relative z-10 max-w-xs">
                {isLoading ? (
                   <div className="flex flex-col items-center">
                     <Loader2 className="animate-spin text-blue-600 dark:text-blue-400 mb-4" size={48} />
                     <p className="text-sm font-bold animate-pulse">{t.common.processing}</p>
                   </div>
                ) : (
                  <>
                    <div className="w-20 h-20 bg-white dark:bg-white/10 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
                      <ArrowRight className="text-gray-300 dark:text-white/30 rtl:rotate-180" size={32} />
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                      Result will appear here.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};