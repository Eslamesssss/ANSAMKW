import React, { useState } from 'react';
import { FileUploader } from '../ui/FileUploader';
import { Users, Sparkles, Loader2, Download, Plus, X, AlertCircle, Zap, ShieldCheck } from 'lucide-react';
import { generateFromCompositeImages } from '../../services/geminiService';

export const GroupComposition: React.FC = () => {
  const [peopleImages, setPeopleImages] = useState<File[]>([]);
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [useNanoBanana, setUseNanoBanana] = useState(true);
  const [strictIdentity, setStrictIdentity] = useState(false); // New Toggle
  const [uploaderKey, setUploaderKey] = useState(0);

  const handleAddImage = (file: File | null) => {
    if (file && peopleImages.length < 4) {
      setPeopleImages([...peopleImages, file]);
      setUploaderKey(prev => prev + 1);
    }
  };

  const handleRemoveImage = (index: number) => {
    const newImages = [...peopleImages];
    newImages.splice(index, 1);
    setPeopleImages(newImages);
  };

  const handleGenerate = async () => {
    if (peopleImages.length === 0 || !prompt.trim()) return;
    
    setIsLoading(true);
    setError(null);
    setResultImage(null);

    let fullPrompt = '';

    // Refined prompts to handle Identity Distortion and Safety Filters
    if (useNanoBanana) {
      const identityStrength = strictIdentity 
        ? "Character Style: Ensure the characters strongly resemble the visual vibe of the references, but as stylized digital art." 
        : "Creative Interpretation: Create fictional characters *inspired* by the inputs. Prioritize artistic composition and scene coherence over exact biometric copying.";

      fullPrompt = `
        Cinematic Group Illustration.
        INPUTS: ${peopleImages.length} reference images (to be used as artistic inspiration).
        SCENE: ${prompt}
        
        INSTRUCTIONS:
        1. Create a digital illustration of characters in this scene.
        2. ${identityStrength}
        3. Treat the input photos as "Character Reference Sheets" for a graphic novel or movie concept.
        4. Lighting must be cinematic and consistent.
        5. Output style: High-quality digital art / Cinematic Still.
      `;
    } else {
      fullPrompt = `
        Create a cinematic group scene featuring fictional characters inspired by the uploaded references.
        Scene: ${prompt}
        Style: High quality digital art.
      `;
    }

    try {
      const result = await generateFromCompositeImages(peopleImages, fullPrompt);
      setResultImage(result);
    } catch (err: any) {
      const errMsg = err.message || "";
      // Custom error handling for Safety blocks
      if (errMsg.includes("blocked") || errMsg.includes("SAFETY") || errMsg.includes("IMAGE_OTHER")) {
         setError("The AI blocked this request due to Safety/Identity filters. Try disabling 'Strict Identity Mode' or using photos where the face is less dominant.");
      } else {
         setError("Failed to generate composition. " + errMsg);
      }
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-[1600px] mx-auto px-4 pt-24 pb-24 min-h-screen">
      <div className="mb-12 text-center">
        <h2 className="text-3xl md:text-5xl font-heading font-bold uppercase tracking-tight mb-4">
          Group <span className="text-green-600 dark:text-green-500">Composition</span>
        </h2>
        <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
          Upload photos of different people and merge them into a single scene together.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 xl:gap-16">
        
        {/* Left Sidebar: Inputs (Span 5 on XL) */}
        <div className="xl:col-span-5 space-y-8">
           
           <div className="bg-white dark:bg-white/5 p-6 md:p-8 rounded-2xl border border-gray-200 dark:border-white/10 shadow-lg">
              <div className="flex justify-between items-center mb-6">
                 <h3 className="font-bold uppercase text-sm">People ({peopleImages.length}/4)</h3>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                {peopleImages.map((img, idx) => (
                  <div key={idx} className="relative aspect-square bg-gray-100 dark:bg-black/20 rounded-lg overflow-hidden border border-gray-200 dark:border-white/10 group">
                    <img src={URL.createObjectURL(img)} alt={`Person ${idx}`} className="w-full h-full object-cover" />
                    <button 
                      onClick={() => handleRemoveImage(idx)}
                      className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1.5 hover:bg-red-600 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                {peopleImages.length < 4 && (
                   <div className="aspect-square">
                     <FileUploader 
                       key={uploaderKey}
                       label="Add Person" 
                       onFileSelect={handleAddImage} 
                       className="h-full"
                     />
                   </div>
                )}
              </div>
              <div className="flex items-start p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-xs text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-900/30">
                 <AlertCircle size={16} className="mt-0.5 mr-2 flex-shrink-0" />
                 <p>Upload clear photos. If AI blocks the generation, try using different photos or disabling strict mode.</p>
              </div>
           </div>

           <div className="bg-white dark:bg-white/5 p-6 md:p-8 rounded-2xl border border-gray-200 dark:border-white/10 shadow-lg space-y-6">
              
              {/* Mode Toggles */}
              <div className="flex gap-4">
                 {/* Nano Banana Toggle */}
                 <div 
                    className="flex-1 flex items-center justify-between p-3 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-900/30 rounded-xl cursor-pointer" 
                    onClick={() => setUseNanoBanana(!useNanoBanana)}
                 >
                    <div className="flex items-center">
                       <div className={`p-2 rounded-full mr-2 ${useNanoBanana ? 'bg-yellow-400 text-black' : 'bg-gray-200 text-gray-400'}`}>
                          <Zap size={14} fill={useNanoBanana ? "currentColor" : "none"} />
                       </div>
                       <div>
                          <p className="text-[10px] font-bold uppercase">Nano Identity</p>
                       </div>
                    </div>
                    <div className={`w-8 h-4 rounded-full relative transition-colors ${useNanoBanana ? 'bg-yellow-400' : 'bg-gray-300'}`}>
                       <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-all duration-300 ${useNanoBanana ? 'left-4.5' : 'left-0.5'}`}></div>
                    </div>
                 </div>

                 {/* Strict Mode Toggle */}
                 <div 
                    className="flex-1 flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-900/30 rounded-xl cursor-pointer" 
                    onClick={() => setStrictIdentity(!strictIdentity)}
                 >
                    <div className="flex items-center">
                       <div className={`p-2 rounded-full mr-2 ${strictIdentity ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-400'}`}>
                          <ShieldCheck size={14} />
                       </div>
                       <div>
                          <p className="text-[10px] font-bold uppercase">Strict Mode</p>
                       </div>
                    </div>
                    <div className={`w-8 h-4 rounded-full relative transition-colors ${strictIdentity ? 'bg-purple-600' : 'bg-gray-300'}`}>
                       <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-all duration-300 ${strictIdentity ? 'left-4.5' : 'left-0.5'}`}></div>
                    </div>
                 </div>
              </div>
              
              <p className="text-[10px] text-gray-400">
                 *Strict Mode forces resemblance but may cause "distortion" or be blocked by safety filters. Turn off if you get errors.
              </p>

              <div>
                <h3 className="font-bold uppercase text-sm mb-3">Scene Description</h3>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe the scene in detail. E.g., 'They are sitting at a coffee shop in Paris having a laugh, warm sunset lighting...'"
                  className="w-full bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-lg p-4 text-sm focus:outline-none focus:border-green-500 min-h-[150px] transition-all resize-y"
                />
              </div>
           </div>

           <button 
              onClick={handleGenerate}
              disabled={peopleImages.length === 0 || !prompt.trim() || isLoading}
              className={`w-full py-5 rounded-full font-bold uppercase tracking-widest text-sm flex items-center justify-center space-x-3 transition-all transform active:scale-95 ${
                (peopleImages.length > 0 && prompt.trim() && !isLoading)
                  ? 'bg-gradient-to-r from-green-600 to-teal-600 text-white shadow-lg hover:shadow-xl'
                  : 'bg-gray-200 dark:bg-white/10 text-gray-400 cursor-not-allowed'
              }`}
            >
              {isLoading ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
              <span>{isLoading ? 'Composing Scene...' : 'Generate Group Photo'}</span>
            </button>
            
            {error && (
               <div className="text-red-500 text-center text-sm mt-4 bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-200 dark:border-red-900/50">
                 {error}
               </div>
            )}
        </div>

        {/* Right Side: Result (Span 7 on XL) */}
        <div className="xl:col-span-7">
           <div className="h-full min-h-[600px] bg-gray-100 dark:bg-black/40 rounded-2xl border-2 border-dashed border-gray-200 dark:border-white/10 flex flex-col items-center justify-center p-8 relative overflow-hidden">
              {resultImage ? (
                <div className="flex flex-col items-center w-full animate-fade-in z-10">
                   <img src={resultImage} alt="Group Composition" className="max-w-full max-h-[800px] object-contain rounded-lg shadow-2xl mb-8" />
                   <a 
                    href={resultImage} 
                    download="eslam-group-scene.png"
                    className="flex items-center px-10 py-4 bg-black dark:bg-white text-white dark:text-black rounded-full text-sm font-bold uppercase hover:opacity-80 transition-opacity shadow-xl"
                   >
                     <Download size={18} className="mr-2" /> Download Result
                   </a>
                </div>
              ) : (
                 <div className="text-center max-w-xs opacity-50">
                    <div className="w-24 h-24 mx-auto mb-6 bg-gray-200 dark:bg-white/10 rounded-full flex items-center justify-center">
                       <Users size={48} className="text-gray-400 dark:text-gray-600" />
                    </div>
                    <p className="text-lg font-bold text-gray-500 dark:text-gray-400">
                      Add people and describe a scene to see them together here.
                    </p>
                 </div>
              )}
           </div>
        </div>

      </div>
    </div>
  );
};