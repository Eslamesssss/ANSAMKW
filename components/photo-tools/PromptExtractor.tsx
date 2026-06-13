import React, { useState } from 'react';
import { FileUploader } from '../ui/FileUploader';
import { ScanEye, Copy, Check, Loader2, ArrowRight } from 'lucide-react';
import { analyzeImage } from '../../services/geminiService';

// يمكنك تغيير الاسم في هذا المتغير بسهولة
const COPYRIGHT_SIGNATURE = "\n\nهذه واجهة التطبيق مع إرجاع حقوق الملكية بالكامل إلى Eslam Abdullah";

export const PromptExtractor: React.FC = () => {
  const [image, setImage] = useState<File | null>(null);
  const [resultPrompt, setResultPrompt] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (!image) return;
    setIsLoading(true);
    setResultPrompt('');
    setError(null);

    try {
      const text = await analyzeImage(image);
      // Append signature immediately so it's visible and editable
      setResultPrompt(text + COPYRIGHT_SIGNATURE);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to extract prompt. Please try a different image.");
      setResultPrompt('');
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = () => {
    // Copy exactly what is in the text area (allows user edits)
    navigator.clipboard.writeText(resultPrompt);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 pt-32 pb-20">
      <div className="mb-12 text-center">
        <h2 className="text-3xl md:text-5xl font-heading font-bold uppercase tracking-tight mb-4">
          Prompt <span className="text-amber-500">Extractor</span>
        </h2>
        <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
          Upload an image to get a detailed AI description that you can use to recreate the style.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-12 items-start">
        
        {/* Upload Side */}
        <div className="bg-white dark:bg-white/5 p-8 rounded-2xl border border-gray-200 dark:border-white/10 shadow-lg space-y-8">
           <FileUploader 
             label="Upload Reference Image" 
             onFileSelect={(f) => { setImage(f); setResultPrompt(''); setError(null); }} 
             selectedFile={image}
           />
           
           <button 
             onClick={handleAnalyze}
             disabled={!image || isLoading}
             className={`w-full py-5 rounded-lg font-bold uppercase tracking-widest text-sm flex items-center justify-center space-x-2 transition-all ${
               (!image || isLoading)
                 ? 'bg-gray-200 dark:bg-white/10 text-gray-400 cursor-not-allowed'
                 : 'bg-amber-500 text-black hover:bg-amber-400 shadow-lg' 
             }`}
           >
             {isLoading ? <Loader2 className="animate-spin" size={18} /> : <ScanEye size={18} />}
             <span>{isLoading ? 'Analyzing...' : 'Extract Prompt'}</span>
           </button>

           {error && (
              <div className="text-red-500 text-xs text-center bg-red-50 dark:bg-red-900/20 p-3 rounded border border-red-200 dark:border-red-900/50">
                {error}
              </div>
            )}
        </div>

        {/* Result Side */}
        <div className="relative bg-gray-50 dark:bg-black/40 rounded-2xl border border-gray-200 dark:border-white/10 p-8 min-h-[400px] flex flex-col">
           <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-6 flex items-center justify-between">
             <span>Generated Prompt (Editable)</span>
             {resultPrompt && (
                <button 
                  onClick={copyToClipboard}
                  className="flex items-center text-blue-600 dark:text-blue-400 hover:underline text-[10px] font-bold uppercase"
                >
                  {isCopied ? <Check size={14} className="mr-1" /> : <Copy size={14} className="mr-1" />}
                  {isCopied ? 'Copied!' : 'Copy Text'}
                </button>
             )}
           </h3>

           {isLoading ? (
             <div className="flex-1 flex items-center justify-center">
                <div className="flex flex-col items-center">
                   <Loader2 className="animate-spin text-amber-500 mb-4" size={48} />
                   <span className="text-sm font-bold text-gray-400 uppercase tracking-wider">Analyzing Visuals...</span>
                </div>
             </div>
           ) : resultPrompt ? (
             <div className="animate-fade-in flex-1 h-full flex flex-col">
               <div className="bg-white dark:bg-black/20 p-4 rounded-lg border border-gray-200 dark:border-white/5 h-full flex-1">
                 <textarea
                   value={resultPrompt}
                   onChange={(e) => setResultPrompt(e.target.value)}
                   className="w-full h-full min-h-[300px] bg-transparent border-none focus:ring-0 p-0 text-sm leading-relaxed text-gray-800 dark:text-gray-200 font-mono resize-none custom-scrollbar"
                   placeholder="Prompt text will appear here..."
                 />
               </div>
               <p className="text-[10px] text-gray-400 mt-2 text-center uppercase">
                 You can edit the text above before copying
               </p>
             </div>
           ) : (
             <div className="flex-1 flex flex-col items-center justify-center text-gray-400 opacity-50">
               <div className="w-16 h-16 bg-white dark:bg-white/5 rounded-full flex items-center justify-center mb-4">
                 <ArrowRight size={32} />
               </div>
               <p className="text-sm font-bold uppercase tracking-widest">Result will appear here</p>
             </div>
           )}
        </div>

      </div>
    </div>
  );
};
