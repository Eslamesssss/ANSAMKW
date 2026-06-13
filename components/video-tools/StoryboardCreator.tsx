import React, { useState } from 'react';
import { FileUploader } from '../ui/FileUploader';
import { Clapperboard, Wand2, Loader2, Download, FileCode, FileArchive, Image as ImgIcon, Video, Edit2, Copy, Check, CheckCircle } from 'lucide-react';
import { 
  optimizeScript, 
  generateStoryboardStructure, 
  generateSceneImage, 
  createHtmlExport, 
  createZipExport, 
  createSinglePanelExport,
  StoryboardScene 
} from '../../services/geminiService';
import { useLanguage } from '../../hooks/useLanguage';

export const StoryboardCreator: React.FC = () => {
  const { t, language } = useLanguage();
  const [script, setScript] = useState('');
  const [characterImage, setCharacterImage] = useState<File | null>(null);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1'>('16:9');
  const [sceneCount, setSceneCount] = useState<number | 'auto'>('auto');
  
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false); 
  const [isGeneratingImages, setIsGeneratingImages] = useState(false); 
  
  const [scenes, setScenes] = useState<StoryboardScene[]>([]);
  const [generatedImages, setGeneratedImages] = useState<{[key: number]: string}>({});
  const [progress, setProgress] = useState(0);
  const [copiedMotion, setCopiedMotion] = useState<number | null>(null);
  
  const [error, setError] = useState<string | null>(null);

  const handleOptimizeScript = async () => {
    if (!script.trim()) return;
    setIsOptimizing(true);
    try {
      const result = await optimizeScript(script);
      setScript(result);
    } catch (e: any) {
      console.error(e);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleFullGeneration = async () => {
    if (!script.trim()) {
      setError("Please enter a script first.");
      return;
    }
    setError(null);
    setScenes([]);
    setGeneratedImages({});
    setProgress(0);

    setIsAnalyzing(true);
    let structure: StoryboardScene[] = [];
    try {
      structure = await generateStoryboardStructure(script, sceneCount);
      setScenes(structure);
    } catch (e: any) {
      setError(e.message || "Failed to analyze script.");
      setIsAnalyzing(false);
      return;
    }
    setIsAnalyzing(false);

    setIsGeneratingImages(true);
    const total = structure.length;
    
    for (let i = 0; i < total; i++) {
      const scene = structure[i];
      try {
        const img = await generateSceneImage(scene, characterImage, aspectRatio);
        setGeneratedImages(prev => ({ ...prev, [scene.id]: img }));
      } catch (e) {
        console.error(`Failed scene ${scene.id}`, e);
      }
      setProgress(Math.round(((i + 1) / total) * 100));
      await new Promise(r => setTimeout(r, 1500));
    }
    setIsGeneratingImages(false);
  };

  const handleEditScript = () => {
    setScenes([]);
    setGeneratedImages({});
    setProgress(0);
    setError(null);
  };

  const handleCopyMotion = (text: string, id: number) => {
    navigator.clipboard.writeText(text);
    setCopiedMotion(id);
    setTimeout(() => setCopiedMotion(null), 2000);
  };

  return (
    <div className="max-w-[1920px] mx-auto px-6 pt-32 pb-20 min-h-screen">
      <div className="mb-12 text-center">
        <h2 className="text-4xl md:text-6xl font-heading font-bold uppercase tracking-tight mb-4 bg-gradient-to-b from-gray-900 via-gray-600 to-gray-800 dark:from-white dark:via-gray-200 dark:to-gray-500 bg-clip-text text-transparent drop-shadow-sm">
          {t.video.storyboardTitle}
        </h2>
        <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto text-lg">
          Script &rarr; Structure &rarr; Cinema.
        </p>
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-12 gap-10 xl:gap-16">
        
        {/* LEFT PANEL: INPUTS */}
        <div className="2xl:col-span-4 space-y-8">
          
          <div className="bg-white dark:bg-white/5 p-8 rounded-3xl border border-gray-200 dark:border-white/10 shadow-lg">
            <div className="flex items-center mb-6">
               <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center text-xs font-bold mr-3 rtl:ml-3 rtl:mr-0 shrink-0">1</div>
               <h3 className="font-bold uppercase text-sm tracking-wide">{t.video.charLabel}</h3>
            </div>
            <FileUploader 
              label={`${t.common.upload} ${t.common.optional}`} 
              onFileSelect={setCharacterImage} 
              selectedFile={characterImage}
              className="h-56"
            />
          </div>

          <div className="bg-white dark:bg-white/5 p-8 rounded-3xl border border-gray-200 dark:border-white/10 shadow-lg relative overflow-hidden">
             {scenes.length > 0 && !isAnalyzing && !isGeneratingImages && (
                <div className="absolute inset-0 bg-white/90 dark:bg-eslam-black/90 backdrop-blur-sm z-20 flex flex-col items-center justify-center text-center p-6 animate-fade-in">
                    <div className="p-4 bg-gray-100 dark:bg-white/10 rounded-full mb-4">
                       <FileCode size={32} className="text-gray-500 dark:text-gray-300" />
                    </div>
                    <h3 className="text-xl font-bold text-black dark:text-white mb-2">Script Locked</h3>
                    <button 
                      onClick={handleEditScript}
                      className="px-8 py-3 bg-red-600 text-white rounded-lg font-bold uppercase text-sm flex items-center shadow-lg hover:bg-red-700 transition-transform transform hover:scale-105"
                    >
                      <Edit2 size={16} className="mr-2 rtl:ml-2 rtl:mr-0" /> {t.common.edit}
                    </button>
                </div>
             )}

             <div className="flex flex-col space-y-6 mb-6">
               <div className="flex items-center justify-between">
                 <div className="flex items-center">
                   <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center text-xs font-bold mr-3 rtl:ml-3 rtl:mr-0 shrink-0">2</div>
                   <h3 className="font-bold uppercase text-sm tracking-wide">{t.video.scriptLabel}</h3>
                 </div>
               </div>

               <div className="flex flex-col sm:flex-row gap-6 p-6 bg-gray-50 dark:bg-black/20 rounded-xl border border-gray-100 dark:border-white/5">
                 <div className="flex-1 min-w-[120px]">
                   <label className="block text-[10px] uppercase font-bold text-gray-500 mb-3">{t.video.aspectLabel}</label>
                   <div className="flex rounded-lg bg-white dark:bg-black/40 p-1.5 border border-gray-200 dark:border-white/10">
                      {['16:9', '9:16', '1:1'].map((ar) => (
                        <button 
                          key={ar}
                          onClick={() => setAspectRatio(ar as any)}
                          className={`flex-1 py-2 text-[10px] font-bold rounded transition-colors ${aspectRatio === ar ? 'bg-red-600 text-white' : 'text-gray-500 hover:text-black dark:hover:text-white'}`}
                        >
                          {ar}
                        </button>
                      ))}
                   </div>
                 </div>

                 <div className="flex-1 min-w-[120px]">
                   <label className="block text-[10px] uppercase font-bold text-gray-500 mb-3">
                     {t.video.countLabel}: <span className="text-black dark:text-white">{sceneCount === 'auto' ? t.common.auto : sceneCount}</span>
                   </label>
                   <div className="flex items-center space-x-3 rtl:space-x-reverse">
                      <input 
                        type="range" 
                        min="3" 
                        max="10" 
                        step="1"
                        value={sceneCount === 'auto' ? 6 : sceneCount}
                        disabled={sceneCount === 'auto'}
                        onChange={(e) => setSceneCount(parseInt(e.target.value))}
                        className={`w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-red-600 ${sceneCount === 'auto' ? 'opacity-50' : 'opacity-100'}`}
                      />
                      <button 
                        onClick={() => setSceneCount(sceneCount === 'auto' ? 6 : 'auto')}
                        className={`px-3 py-1.5 text-[10px] font-bold rounded border ${sceneCount === 'auto' ? 'bg-black text-white border-black' : 'text-gray-500 border-gray-300'}`}
                      >
                        {t.common.auto}
                      </button>
                   </div>
                 </div>
               </div>
            </div>

            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder="EXT. CITY STREET - DAY..."
              className="w-full h-80 p-6 rounded-xl bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 text-sm focus:outline-none focus:border-red-500 resize-none mb-6 leading-relaxed"
              disabled={scenes.length > 0 && !isAnalyzing && !isGeneratingImages} 
            />
            
            <div className="flex flex-col sm:flex-row gap-4">
               <button 
                 onClick={handleOptimizeScript}
                 disabled={isOptimizing || !script || scenes.length > 0}
                 className="flex-1 py-4 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 rounded-xl text-xs font-bold uppercase flex items-center justify-center hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
               >
                 {isOptimizing ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} className="mr-2 rtl:ml-2 rtl:mr-0" />}
                 {t.video.polishBtn}
               </button>
               <button 
                 onClick={handleFullGeneration}
                 disabled={isAnalyzing || isGeneratingImages || !script || scenes.length > 0}
                 className="flex-[2] py-4 bg-red-600 text-white rounded-xl text-xs font-bold uppercase flex items-center justify-center hover:bg-red-700 shadow-lg shadow-red-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
               >
                 {(isAnalyzing || isGeneratingImages) ? <Loader2 size={16} className="animate-spin mr-2 rtl:ml-2 rtl:mr-0" /> : <Clapperboard size={16} className="mr-2 rtl:ml-2 rtl:mr-0" />}
                 {isAnalyzing ? t.common.analyzing : isGeneratingImages ? `${t.common.rendering} (${progress}%)` : t.video.generateBtn}
               </button>
            </div>
            {error && (
              <div className="text-red-500 text-xs mt-4 text-center bg-red-50 dark:bg-red-900/20 p-3 rounded border border-red-200 dark:border-red-900/50">
                {error}
              </div>
            )}
          </div>

          {scenes.length > 0 && !isAnalyzing && (
            <div className="bg-white dark:bg-white/5 p-8 rounded-3xl border border-gray-200 dark:border-white/10 shadow-lg animate-fade-in">
               <h3 className="font-bold uppercase text-sm mb-6 flex items-center">
                 <Download size={18} className="mr-2 rtl:ml-2 rtl:mr-0" /> Exports
               </h3>
               <div className="space-y-4">
                 <button 
                   onClick={() => createHtmlExport(scenes, generatedImages)}
                   className="w-full flex items-center justify-between px-6 py-4 bg-gray-100 dark:bg-white/10 rounded-xl hover:bg-gray-200 dark:hover:bg-white/20 transition-colors text-xs font-bold uppercase"
                 >
                   <span className="flex items-center"><FileCode size={18} className="mr-3 rtl:ml-3 rtl:mr-0 text-blue-500"/> {t.video.exportHtml}</span>
                   <Download size={16} />
                 </button>
                 <button 
                   onClick={() => createZipExport(generatedImages)}
                   className="w-full flex items-center justify-between px-6 py-4 bg-gray-100 dark:bg-white/10 rounded-xl hover:bg-gray-200 dark:hover:bg-white/20 transition-colors text-xs font-bold uppercase"
                 >
                   <span className="flex items-center"><FileArchive size={18} className="mr-3 rtl:ml-3 rtl:mr-0 text-yellow-500"/> {t.video.exportZip}</span>
                   <Download size={16} />
                 </button>
               </div>
            </div>
          )}
        </div>

        {/* RIGHT PANEL: VISUALIZATION GRID */}
        <div className="2xl:col-span-8">
          {scenes.length === 0 && !isAnalyzing ? (
             <div className="h-full min-h-[700px] flex flex-col items-center justify-center bg-gray-50 dark:bg-white/5 rounded-3xl border-2 border-dashed border-gray-200 dark:border-white/10 text-gray-400">
                <div className="w-24 h-24 bg-gray-200 dark:bg-white/10 rounded-full flex items-center justify-center mb-6">
                  <Clapperboard size={48} className="opacity-50" />
                </div>
                <p className="text-xl font-bold uppercase tracking-widest">Viewport Empty</p>
             </div>
          ) : (
             <div className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                   {scenes.map((scene) => (
                     <div key={scene.id} className="group relative bg-white dark:bg-black border border-gray-200 dark:border-white/10 rounded-2xl overflow-hidden shadow-xl transition-transform hover:scale-[1.01] flex flex-col h-full">
                        <div className={`relative w-full bg-gray-900 ${aspectRatio === '16:9' ? 'aspect-video' : aspectRatio === '9:16' ? 'aspect-[9/16]' : 'aspect-square'}`}>
                           {generatedImages[scene.id] ? (
                             <img src={generatedImages[scene.id]} alt="Scene" className="w-full h-full object-cover" />
                           ) : (
                             <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                               <Loader2 className="text-white/20 animate-spin" size={40} />
                             </div>
                           )}
                           <div className="absolute top-4 left-4 bg-black/70 text-white text-[10px] font-bold px-3 py-1.5 rounded-md backdrop-blur-md border border-white/10">
                             {t.common.step} {scene.id}
                           </div>
                           
                           {generatedImages[scene.id] && (
                             <button 
                               onClick={() => createSinglePanelExport(scene, generatedImages[scene.id], aspectRatio)}
                               className="absolute top-4 right-4 p-2.5 bg-black/50 hover:bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all border border-white/10"
                               title="Export Single Panel"
                             >
                               <ImgIcon size={18} />
                             </button>
                           )}
                        </div>

                        <div className="p-8 flex-1 flex flex-col">
                           <p className="text-base text-gray-800 dark:text-gray-200 mb-6 line-clamp-4 leading-relaxed flex-1 min-h-[80px] font-light">
                             {scene.description}
                           </p>
                           <div className="flex items-center justify-between pt-6 border-t border-gray-100 dark:border-white/10 mt-auto">
                              <div className="flex items-center">
                                <Video size={18} className="text-red-500 mr-3 rtl:ml-3 rtl:mr-0 shrink-0" />
                                <span className="text-xs font-mono text-gray-500 dark:text-gray-400 uppercase tracking-wide mr-3 rtl:ml-3 rtl:mr-0 truncate max-w-[200px]">
                                  {scene.camera_movement}
                                </span>
                              </div>
                              <button 
                                onClick={() => handleCopyMotion(scene.camera_movement, scene.id)}
                                className="text-gray-400 hover:text-black dark:hover:text-white transition-colors p-2.5 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg"
                              >
                                {copiedMotion === scene.id ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                              </button>
                           </div>
                        </div>
                     </div>
                   ))}
                </div>
             </div>
          )}
        </div>
      </div>
    </div>
  );
};