import React, { useState } from 'react';
import { Target, FileText, Loader2, ArrowRight } from 'lucide-react';
import { generateMarketingStrategy } from '../../services/geminiService';

export const MarketingStrategy: React.FC = () => {
  const [details, setDetails] = useState({ product: '', audience: '', goal: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!details.product || !details.audience || !details.goal) return;
    setIsLoading(true);
    setError(null);
    try {
      const text = await generateMarketingStrategy(details);
      setResult(text);
    } catch (err: any) {
      setError(err.message || "Strategy generation failed.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 pt-32 pb-20">
      <div className="mb-12 text-center">
         <div className="w-20 h-20 mx-auto mb-6 bg-rose-50 dark:bg-rose-900/20 rounded-full flex items-center justify-center">
           <Target size={40} className="text-rose-500" />
         </div>
         <h2 className="text-3xl md:text-5xl font-heading font-bold uppercase tracking-tight mb-4">
           Marketing <span className="text-rose-500">Strategy Builder</span>
         </h2>
         <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
           Develop comprehensive marketing roadmaps tailored to your product and audience using AI reasoning.
         </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-12 items-start">
         <div className="space-y-6 bg-white dark:bg-white/5 p-8 rounded-2xl border border-gray-200 dark:border-white/10 shadow-lg">
            <div>
               <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Product / Service</label>
               <input 
                 type="text"
                 value={details.product}
                 onChange={(e) => setDetails({...details, product: e.target.value})}
                 className="w-full bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-lg p-3 text-sm"
                 placeholder="What are you selling?"
               />
            </div>
            <div>
               <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Target Audience</label>
               <input 
                 type="text"
                 value={details.audience}
                 onChange={(e) => setDetails({...details, audience: e.target.value})}
                 className="w-full bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-lg p-3 text-sm"
                 placeholder="Who is this for?"
               />
            </div>
            <div>
               <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Primary Goal</label>
               <input 
                 type="text"
                 value={details.goal}
                 onChange={(e) => setDetails({...details, goal: e.target.value})}
                 className="w-full bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-lg p-3 text-sm"
                 placeholder="Brand awareness, Sales, Leads..."
               />
            </div>
            
            <button 
               onClick={handleGenerate}
               disabled={!details.product || !details.audience || !details.goal || isLoading}
               className={`w-full py-5 rounded-lg font-bold uppercase tracking-widest text-sm flex items-center justify-center space-x-2 transition-all ${
                 (!details.product || isLoading)
                   ? 'bg-gray-200 dark:bg-white/10 text-gray-400 cursor-not-allowed'
                   : 'bg-rose-500 text-white hover:bg-rose-600 shadow-lg' 
               }`}
             >
               {isLoading ? <Loader2 className="animate-spin" size={18} /> : <FileText size={18} />}
               <span>{isLoading ? 'Building Strategy...' : 'Generate Strategy Report'}</span>
             </button>
             {error && <p className="text-red-500 text-xs">{error}</p>}
         </div>

         <div className="bg-gray-50 dark:bg-black/40 rounded-2xl border border-gray-200 dark:border-white/10 p-8 min-h-[500px] flex flex-col">
            <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-6">Generated Report</h3>
            
            {result ? (
              <div className="prose dark:prose-invert prose-sm max-w-none overflow-y-auto max-h-[600px] pr-4 animate-fade-in">
                 <div className="whitespace-pre-wrap font-sans text-gray-700 dark:text-gray-300">
                    {result}
                 </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-400 opacity-50">
                 <div className="w-16 h-16 bg-white dark:bg-white/5 rounded-full flex items-center justify-center mb-4">
                    <ArrowRight size={32} />
                 </div>
                 <p className="font-bold uppercase tracking-widest">Strategy Doc Will Appear Here</p>
              </div>
            )}
         </div>
      </div>
    </div>
  );
};