import React, { useState } from 'react';
import { BarChart3, TrendingUp, AlertTriangle, ShieldAlert, Target, Loader2, Zap } from 'lucide-react';
import { generateSwotAnalysis } from '../../services/geminiService';

interface SwotData {
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
}

export const SwotAnalysis: React.FC = () => {
  const [company, setCompany] = useState('');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<SwotData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (!company || !description) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await generateSwotAnalysis(company, description);
      setData(result);
    } catch (err: any) {
      setError(err.message || "Analysis failed.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 pt-32 pb-20">
      <div className="mb-12 text-center">
         <div className="w-20 h-20 mx-auto mb-6 bg-teal-50 dark:bg-teal-900/20 rounded-full flex items-center justify-center">
           <BarChart3 size={40} className="text-teal-500" />
         </div>
         <h2 className="text-3xl md:text-5xl font-heading font-bold uppercase tracking-tight mb-4">
           Market <span className="text-teal-500">SWOT Analysis</span>
         </h2>
         <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
           Input your business details to generate a strategic Strengths, Weaknesses, Opportunities, and Threats analysis.
         </p>
      </div>

      <div className="grid lg:grid-cols-12 gap-8 items-start">
         {/* Input Side */}
         <div className="lg:col-span-4 bg-white dark:bg-white/5 p-8 rounded-2xl border border-gray-200 dark:border-white/10 shadow-lg space-y-6">
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Company/Product Name</label>
              <input 
                type="text" 
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-lg p-3 text-sm"
                placeholder="e.g. Tesla, Local Coffee Shop"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Business Description</label>
              <textarea 
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-lg p-3 text-sm min-h-[150px]"
                placeholder="Describe what you do, your target market, and current situation..."
              />
            </div>
            <button 
               onClick={handleAnalyze}
               disabled={!company || !description || isLoading}
               className={`w-full py-4 rounded-lg font-bold uppercase tracking-widest text-sm flex items-center justify-center space-x-2 transition-all ${
                 (!company || !description || isLoading)
                   ? 'bg-gray-200 dark:bg-white/10 text-gray-400 cursor-not-allowed'
                   : 'bg-teal-500 text-white hover:bg-teal-600 shadow-lg' 
               }`}
             >
               {isLoading ? <Loader2 className="animate-spin" size={18} /> : <Zap size={18} />}
               <span>Analyze</span>
             </button>
             {error && <p className="text-red-500 text-xs">{error}</p>}
         </div>

         {/* Results Grid */}
         <div className="lg:col-span-8">
            {!data ? (
               <div className="h-full min-h-[400px] flex items-center justify-center bg-gray-50 dark:bg-white/5 rounded-2xl border-2 border-dashed border-gray-200 dark:border-white/10 text-gray-400">
                  <p className="font-bold uppercase">Analysis Results Will Appear Here</p>
               </div>
            ) : (
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
                  {/* Strengths */}
                  <div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-900/30 p-6 rounded-xl">
                     <h3 className="flex items-center text-green-700 dark:text-green-400 font-bold uppercase tracking-wide mb-4">
                        <TrendingUp size={20} className="mr-2" /> Strengths
                     </h3>
                     <ul className="space-y-2">
                        {data.strengths?.map((item, i) => (
                           <li key={i} className="flex items-start text-sm text-gray-700 dark:text-gray-300">
                              <span className="mr-2">•</span> {item}
                           </li>
                        ))}
                     </ul>
                  </div>
                  {/* Weaknesses */}
                  <div className="bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-900/30 p-6 rounded-xl">
                     <h3 className="flex items-center text-orange-700 dark:text-orange-400 font-bold uppercase tracking-wide mb-4">
                        <AlertTriangle size={20} className="mr-2" /> Weaknesses
                     </h3>
                     <ul className="space-y-2">
                        {data.weaknesses?.map((item, i) => (
                           <li key={i} className="flex items-start text-sm text-gray-700 dark:text-gray-300">
                              <span className="mr-2">•</span> {item}
                           </li>
                        ))}
                     </ul>
                  </div>
                  {/* Opportunities */}
                  <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-900/30 p-6 rounded-xl">
                     <h3 className="flex items-center text-blue-700 dark:text-blue-400 font-bold uppercase tracking-wide mb-4">
                        <Target size={20} className="mr-2" /> Opportunities
                     </h3>
                     <ul className="space-y-2">
                        {data.opportunities?.map((item, i) => (
                           <li key={i} className="flex items-start text-sm text-gray-700 dark:text-gray-300">
                              <span className="mr-2">•</span> {item}
                           </li>
                        ))}
                     </ul>
                  </div>
                  {/* Threats */}
                  <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 p-6 rounded-xl">
                     <h3 className="flex items-center text-red-700 dark:text-red-400 font-bold uppercase tracking-wide mb-4">
                        <ShieldAlert size={20} className="mr-2" /> Threats
                     </h3>
                     <ul className="space-y-2">
                        {data.threats?.map((item, i) => (
                           <li key={i} className="flex items-start text-sm text-gray-700 dark:text-gray-300">
                              <span className="mr-2">•</span> {item}
                           </li>
                        ))}
                     </ul>
                  </div>
               </div>
            )}
         </div>
      </div>
    </div>
  );
};