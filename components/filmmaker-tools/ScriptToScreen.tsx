import React, { useState } from 'react';
import { ScrollText, ArrowRight, Copy, Check, Loader2 } from 'lucide-react';
import { generateCinematicScript, ScriptShot } from '../../services/geminiService';

export const ScriptToScreen: React.FC = () => {
  const [story, setStory] = useState('');
  const [shots, setShots] = useState<ScriptShot[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleConvert = async () => {
    if (!story.trim()) return;
    setIsGenerating(true);
    setShots([]);
    try {
      const result = await generateCinematicScript(story);
      setShots(result);
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  const copyPrompt = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="min-h-screen bg-white dark:bg-eslam-black pt-32 pb-24 px-4">
       <div className="max-w-7xl mx-auto h-full">
          <div className="text-center mb-12">
             <h2 className="text-3xl font-heading font-bold uppercase mb-4 dark:text-white">Script <span className="text-blue-600">To Screen</span></h2>
             <p className="text-gray-500 max-w-xl mx-auto">Transform raw narratives into an industry-standard shot list with AI visual prompts.</p>
          </div>

          <div className="grid lg:grid-cols-2 gap-12 min-h-[600px]">
             {/* Input */}
             <div className="flex flex-col h-full bg-white dark:bg-white/5 rounded-xl p-1 shadow-sm border border-gray-200 dark:border-white/10">
                <textarea 
                  value={story}
                  onChange={(e) => setStory(e.target.value)}
                  placeholder="Write your story here... (e.g. 'A detective walks into a rainy alleyway looking for clues...')"
                  className="flex-1 w-full p-6 bg-gray-50 dark:bg-white/5 border-none rounded-t-xl resize-none focus:ring-2 focus:ring-blue-600 outline-none text-sm leading-relaxed dark:text-gray-200 min-h-[300px]"
                />
                <button 
                  onClick={handleConvert}
                  disabled={!story || isGenerating}
                  className="w-full py-5 bg-blue-600 text-white font-bold uppercase tracking-widest rounded-b-xl hover:bg-blue-700 transition-colors flex items-center justify-center shadow-lg disabled:opacity-50"
                >
                   {isGenerating ? <Loader2 className="animate-spin mr-2" /> : <ArrowRight className="mr-2" />}
                   {isGenerating ? 'Directing...' : 'Convert to Shot List'}
                </button>
             </div>

             {/* Output */}
             <div className="bg-gray-100 dark:bg-black border border-gray-200 dark:border-white/10 rounded-xl overflow-hidden flex flex-col h-[600px] lg:h-auto shadow-inner">
                <div className="p-4 bg-gray-200 dark:bg-white/10 border-b border-gray-300 dark:border-white/5 flex-shrink-0">
                   <span className="text-xs font-bold uppercase tracking-widest text-gray-600 dark:text-gray-400">Generated Shot List</span>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                   {isGenerating && (
                      <div className="flex items-center justify-center h-full">
                         <Loader2 className="text-blue-600 animate-spin" size={48} />
                      </div>
                   )}
                   
                   {!isGenerating && shots.length === 0 && (
                      <div className="flex flex-col items-center justify-center h-full opacity-40">
                         <ScrollText size={48} className="mb-4 text-gray-400" />
                         <p className="text-sm font-bold uppercase">No Script Generated</p>
                      </div>
                   )}

                   {shots.map((shot, idx) => (
                      <div key={idx} className="bg-white dark:bg-white/5 p-6 rounded-lg border border-gray-200 dark:border-white/10 shadow-sm hover:border-blue-500/50 transition-colors group">
                         <div className="font-mono text-sm font-bold text-gray-900 dark:text-white mb-2 bg-gray-100 dark:bg-black/50 inline-block px-2 py-1 rounded">
                            {shot.slugline}
                         </div>
                         <p className="text-gray-600 dark:text-gray-300 font-serif text-sm leading-relaxed mb-4">
                            {shot.action}
                         </p>
                         
                         <div className="mt-4 pt-4 border-t border-gray-100 dark:border-white/5">
                            <div className="flex items-center justify-between mb-2">
                               <span className="text-[10px] font-bold uppercase text-blue-500">Visual Prompt</span>
                               <button 
                                 onClick={() => copyPrompt(shot.visual_prompt, idx)}
                                 className="text-gray-400 hover:text-blue-500 transition-colors"
                               >
                                  {copiedIndex === idx ? <Check size={14} /> : <Copy size={14} />}
                               </button>
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-500 font-mono bg-gray-50 dark:bg-black/30 p-3 rounded break-words">
                               {shot.visual_prompt}
                            </p>
                         </div>
                      </div>
                   ))}
                </div>
             </div>
          </div>
       </div>
    </div>
  );
};