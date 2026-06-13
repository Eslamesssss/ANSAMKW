import React, { useState } from 'react';
import { PenTool, Loader2, Download, Palette, Circle, Square } from 'lucide-react';
import { generateLogo } from '../../services/geminiService';

export const LogoGenerator: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState('Minimalist Vector');
  const [shape, setShape] = useState<'square' | 'circle'>('circle');
  const [isLoading, setIsLoading] = useState(false);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const styles = [
    'Minimalist Vector', 
    'Abstract Geometric', 
    'Mascot / Character', 
    'Vintage Emblem', 
    'Modern Gradient', 
    'Line Art'
  ];

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsLoading(true);
    setError(null);
    setResultImage(null);

    try {
      const result = await generateLogo(prompt, style, shape);
      setResultImage(result);
    } catch (err: any) {
      setError(err.message || "Failed to generate logo.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 pt-32 pb-20">
      <div className="mb-12 text-center">
         <div className="w-20 h-20 mx-auto mb-6 bg-purple-50 dark:bg-purple-900/20 rounded-full flex items-center justify-center">
           <PenTool size={40} className="text-purple-600 dark:text-purple-400" />
         </div>
         <h2 className="text-3xl md:text-5xl font-heading font-bold uppercase tracking-tight mb-4">
           AI <span className="text-purple-600 dark:text-purple-400">Logo Generator</span>
         </h2>
         <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
           Create professional, scalable vector-style logos from text descriptions.
         </p>
      </div>

      <div className="grid lg:grid-cols-12 gap-10">
         {/* Inputs */}
         <div className="lg:col-span-4 space-y-8 bg-white dark:bg-white/5 p-8 rounded-3xl border border-gray-200 dark:border-white/10 shadow-xl">
            <div>
               <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">Logo Concept</label>
               <textarea 
                 value={prompt}
                 onChange={(e) => setPrompt(e.target.value)}
                 placeholder="E.g. 'A sleek fox head made of geometric triangles', 'A coffee bean combined with a cloud'..."
                 className="w-full bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-xl p-5 text-sm min-h-[150px] focus:outline-none focus:border-purple-500 transition-all"
               />
            </div>
            
            <div>
               <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">Logo Shape</label>
               <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setShape('circle')}
                    className={`flex items-center justify-center p-4 rounded-xl border transition-all ${
                      shape === 'circle' 
                        ? 'bg-purple-600 text-white border-purple-600 shadow-md' 
                        : 'border-gray-200 dark:border-white/10 text-gray-500 hover:bg-gray-50 dark:hover:bg-white/5'
                    }`}
                  >
                    <Circle size={20} className="mr-2" />
                    <span className="text-xs font-bold uppercase">Circular</span>
                  </button>
                  <button
                    onClick={() => setShape('square')}
                    className={`flex items-center justify-center p-4 rounded-xl border transition-all ${
                      shape === 'square' 
                        ? 'bg-purple-600 text-white border-purple-600 shadow-md' 
                        : 'border-gray-200 dark:border-white/10 text-gray-500 hover:bg-gray-50 dark:hover:bg-white/5'
                    }`}
                  >
                    <Square size={20} className="mr-2" />
                    <span className="text-xs font-bold uppercase">Square</span>
                  </button>
               </div>
            </div>

            <div>
               <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">Artistic Style</label>
               <div className="grid grid-cols-2 gap-3">
                  {styles.map(s => (
                     <button 
                       key={s}
                       onClick={() => setStyle(s)}
                       className={`p-3 text-[10px] font-bold uppercase rounded-lg border transition-all ${style === s ? 'bg-purple-600 text-white border-purple-600 shadow-md' : 'border-gray-200 dark:border-white/10 text-gray-500 hover:bg-gray-50 dark:hover:bg-white/5'}`}
                     >
                        {s}
                     </button>
                  ))}
               </div>
            </div>

            <button 
               onClick={handleGenerate}
               disabled={!prompt || isLoading}
               className={`w-full py-5 rounded-xl font-bold uppercase tracking-widest text-sm flex items-center justify-center space-x-2 transition-all transform active:scale-95 ${
                 (!prompt || isLoading)
                   ? 'bg-gray-200 dark:bg-white/10 text-gray-400 cursor-not-allowed'
                   : 'bg-purple-600 text-white hover:bg-purple-700 shadow-xl shadow-purple-600/20' 
               }`}
             >
               {isLoading ? <Loader2 className="animate-spin" size={20} /> : <Palette size={20} />}
               <span>{isLoading ? 'Designing...' : 'Generate Logo'}</span>
             </button>
             {error && <p className="text-red-500 text-xs text-center bg-red-50 dark:bg-red-900/20 p-2 rounded">{error}</p>}
         </div>

         {/* Result Viewport */}
         <div className="lg:col-span-8 h-full min-h-[600px] bg-gray-100 dark:bg-[#0a0a0a] rounded-3xl border border-gray-200 dark:border-white/10 flex items-center justify-center relative overflow-hidden shadow-inner">
            {/* Grid Background */}
            <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'linear-gradient(#888 1px, transparent 1px), linear-gradient(90deg, #888 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>

            {resultImage ? (
               <div className="relative w-full h-full flex flex-col items-center justify-center animate-fade-in p-10">
                  <div className={`relative bg-white p-8 shadow-2xl mb-10 aspect-square flex items-center justify-center max-w-[400px] w-full ${shape === 'circle' ? 'rounded-full' : 'rounded-xl'}`}>
                     <img src={resultImage} alt="Logo" className={`w-full h-full object-contain ${shape === 'circle' ? 'rounded-full' : 'rounded-lg'}`} />
                  </div>
                  
                  <div className="flex gap-4">
                     <a href={resultImage} download="eslam-logo.png" className="px-8 py-3 bg-black dark:bg-white text-white dark:text-black rounded-full font-bold uppercase text-xs shadow-lg hover:opacity-80 flex items-center transition-all">
                        <Download className="mr-2 w-4 h-4"/> Download PNG
                     </a>
                  </div>
               </div>
            ) : (
               <div className="text-center opacity-30">
                  <PenTool size={64} className="mx-auto mb-4" />
                  <p className="text-2xl font-heading font-bold uppercase tracking-widest">Logo Preview</p>
               </div>
            )}
         </div>
      </div>
    </div>
  );
};