import React, { useState } from 'react';
import { FileUploader } from '../ui/FileUploader';
import { Clapperboard, Wand2, Image as ImageIcon, Loader2, Download, Video, Copy, Check, Settings, Maximize2, X } from 'lucide-react';
import { 
  optimizeScript, 
  generateStoryboardStructure, 
  generateSceneImage, 
  createSinglePanelExport,
  StoryboardScene 
} from '../../services/geminiService';
import { useLanguage } from '../../hooks/useLanguage';

export const FilmStoryboardPro: React.FC = () => {
  const { t, language } = useLanguage();
  const [script, setScript] = useState('');
  const [characterImage, setCharacterImage] = useState<File | null>(null);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1'>('16:9');
  const [sceneCount, setSceneCount] = useState<number | 'auto'>('auto');
  
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [scenes, setScenes] = useState<StoryboardScene[]>([]);
  const [generatedImages, setGeneratedImages] = useState<{[key: number]: string}>({});
  const [progress, setProgress] = useState(0);
  const [currentStatus, setCurrentStatus] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!script.trim()) return;
    setIsProcessing(true);
    setError(null);
    setScenes([]);
    setGeneratedImages({});
    setProgress(0);

    try {
      setCurrentStatus(t.common.analyzing);
      const structure = await generateStoryboardStructure(script, sceneCount);
      setScenes(structure);

      const total = structure.length;
      for (let i = 0; i < total; i++) {
        const scene = structure[i];
        setCurrentStatus(`${t.common.rendering} ${i + 1}/${total}...`);
        try {
          const img = await generateSceneImage(scene, characterImage, aspectRatio);
          setGeneratedImages(prev => ({ ...prev, [scene.id]: img }));
        } catch (e) {
          console.error(e);
        }
        setProgress(Math.round(((i + 1) / total) * 100));
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsProcessing(false);
      setCurrentStatus(t.common.success);
    }
  };

  return (
    <div className="fixed inset-0 top-0 pt-20 bg-[#050505] text-white flex flex-col md:flex-row overflow-hidden z-0" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      
      {/* Sidebar: Controls */}
      <div className="w-full md:w-[400px] flex-shrink-0 bg-[#0a0a0a] border-r border-white/5 rtl:border-l rtl:border-r-0 flex flex-col h-full overflow-y-auto p-6 custom-scrollbar">
         <div className="mb-8">
            <h2 className="text-xl font-heading font-bold uppercase tracking-widest text-red-600 flex items-center">
               <Clapperboard className="mr-2 rtl:ml-2 rtl:mr-0" /> {t.filmmaker.proTitle}
            </h2>
            <p className="text-[10px] text-gray-500 font-mono mt-1">STUDIO PIPELINE V2.0</p>
         </div>

         <div className="space-y-6 pb-20">
            <div className="bg-white/5 rounded-lg p-4 border border-white/5">
               <label className="text-[10px] font-bold uppercase text-gray-400 mb-3 block">{t.video.charLabel}</label>
               <FileUploader 
                 label={t.common.upload} 
                 onFileSelect={setCharacterImage} 
                 className="h-32"
               />
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div>
                  <label className="text-[10px] font-bold uppercase text-gray-400 mb-2 block">{t.video.aspectLabel}</label>
                  <select 
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value as any)}
                    className="w-full bg-black border border-white/10 rounded p-2 text-xs focus:border-red-600 outline-none"
                  >
                     <option value="16:9">16:9 Cinematic</option>
                     <option value="9:16">9:16 Vertical</option>
                     <option value="1:1">1:1 Square</option>
                  </select>
               </div>
               <div>
                  <label className="text-[10px] font-bold uppercase text-gray-400 mb-2 block">{t.video.countLabel}</label>
                  <select 
                    value={sceneCount}
                    onChange={(e) => setSceneCount(e.target.value === 'auto' ? 'auto' : parseInt(e.target.value))}
                    className="w-full bg-black border border-white/10 rounded p-2 text-xs focus:border-red-600 outline-none"
                  >
                     <option value="auto">{t.common.auto}</option>
                     <option value="4">4</option>
                     <option value="6">6</option>
                     <option value="8">8</option>
                     <option value="10">10</option>
                  </select>
               </div>
            </div>

            <div className="flex-1 flex flex-col">
               <label className="text-[10px] font-bold uppercase text-gray-400 mb-2 block">{t.video.scriptLabel}</label>
               <textarea 
                 value={script}
                 onChange={(e) => setScript(e.target.value)}
                 placeholder="INT. SPACESHIP - NIGHT..."
                 className="w-full min-h-[200px] bg-black border border-white/10 rounded p-4 text-xs font-mono leading-relaxed focus:border-red-600 outline-none resize-none"
               />
            </div>

            <div className="pt-4 space-y-3">
               <button 
                 onClick={async () => {
                    if (!script) return;
                    setIsOptimizing(true);
                    const res = await optimizeScript(script);
                    setScript(res);
                    setIsOptimizing(false);
                 }}
                 disabled={isOptimizing || !script}
                 className="w-full py-3 bg-white/5 hover:bg-white/10 rounded text-xs font-bold uppercase tracking-wider flex items-center justify-center transition-colors"
               >
                  {isOptimizing ? <Loader2 className="animate-spin" size={14} /> : <Wand2 size={14} className="mr-2 rtl:ml-2 rtl:mr-0 text-purple-400" />}
                  {t.video.polishBtn}
               </button>

               <button 
                 onClick={handleGenerate}
                 disabled={isProcessing || !script}
                 className="w-full py-4 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-bold uppercase tracking-widest flex items-center justify-center shadow-lg shadow-red-900/20 transition-all"
               >
                  {isProcessing ? <Loader2 className="animate-spin" size={14} /> : <Clapperboard size={14} className="mr-2 rtl:ml-2 rtl:mr-0" />}
                  {isProcessing ? `Processing (${progress}%)` : t.common.generate}
               </button>
            </div>
            
            {error && <p className="text-red-500 text-[10px] mt-2 text-center">{error}</p>}
         </div>
      </div>

      {/* Canvas / Grid */}
      <div className="flex-1 bg-[#050505] overflow-y-auto p-8 custom-scrollbar">
         {isProcessing && (
            <div className="flex items-center justify-center mb-8">
               <div className="bg-white/5 rounded-full px-6 py-2 flex items-center border border-white/10">
                  <Loader2 size={14} className="animate-spin mr-3 rtl:ml-3 rtl:mr-0 text-red-500" />
                  <span className="text-xs font-mono uppercase tracking-wider">{currentStatus}</span>
               </div>
            </div>
         )}

         {scenes.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-30 min-h-[500px]">
               <Video size={64} className="mb-4 text-gray-500" />
               <h3 className="text-2xl font-heading font-bold uppercase tracking-widest">Viewport Empty</h3>
            </div>
         ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6 pb-20">
               {scenes.map((scene) => (
                  <div key={scene.id} className="group bg-[#0a0a0a] border border-white/10 rounded-lg overflow-hidden hover:border-red-500/50 transition-colors flex flex-col">
                     <div className="px-4 py-2 border-b border-white/5 flex justify-between items-center bg-black/40">
                        <span className="text-[10px] font-bold text-gray-400 uppercase">{t.common.step} {scene.id}</span>
                        <span className="text-[10px] font-mono text-red-500 uppercase truncate max-w-[100px]">{scene.camera_movement}</span>
                     </div>
                     <div className={`relative w-full bg-black ${aspectRatio === '16:9' ? 'aspect-video' : aspectRatio === '9:16' ? 'aspect-[9/16]' : 'aspect-square'}`}>
                        {generatedImages[scene.id] ? (
                           <img src={generatedImages[scene.id]} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                        ) : (
                           <div className="absolute inset-0 flex items-center justify-center">
                              <Loader2 className="text-white/10 animate-spin" />
                           </div>
                        )}
                        {generatedImages[scene.id] && (
                           <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                              <button 
                                onClick={() => createSinglePanelExport(scene, generatedImages[scene.id], aspectRatio)}
                                className="p-2 bg-white text-black rounded-full hover:scale-110 transition-transform" title="Export"
                              >
                                 <Download size={14} />
                              </button>
                           </div>
                        )}
                     </div>
                     <div className="p-4 flex-1">
                        <p className="text-[11px] text-gray-400 leading-relaxed line-clamp-4">{scene.description}</p>
                     </div>
                  </div>
               ))}
            </div>
         )}
      </div>
    </div>
  );
};