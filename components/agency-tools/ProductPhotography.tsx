import React, { useState } from 'react';
import { ShoppingBag, Camera, Wand2, Loader2, Download, ImagePlus, Maximize } from 'lucide-react';
import { FileUploader } from '../ui/FileUploader';
import { editImage, generateFromCompositeImages } from '../../services/geminiService';

export const ProductPhotography: React.FC = () => {
  const [image, setImage] = useState<File | null>(null);
  const [logo, setLogo] = useState<File | null>(null);
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '16:9' | '9:16'>('1:1');
  const [isLoading, setIsLoading] = useState(false);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!image || !prompt.trim()) return;
    setIsLoading(true);
    setError(null);
    setResultImage(null);

    const arText = aspectRatio === '16:9' ? 'Wide 16:9 Cinematic' : aspectRatio === '9:16' ? 'Vertical 9:16 Social Story' : 'Square 1:1';

    const corePrompt = `
      Professional Product Photography Editing.
      Task: Place the product from the input image into this environment: "${prompt}".
      Format: ${arText} aspect ratio.
      Instructions:
      - Retain the product's identity, texture, and details exactly.
      - Integrate realistic shadows, reflections, and professional studio lighting.
      - Ensure high-end commercial quality.
    `;

    try {
      let result;
      if (logo) {
        // Composite Flow: Product + Logo
        const fullPrompt = `
          ${corePrompt}
          - LOGO INTEGRATION: I have provided a second image which is a LOGO.
          - Remove the background of the logo if it exists (make it transparent).
          - Place the logo naturally onto the product packaging OR seamlessly in the background (e.g. as a 3D element or neon sign) depending on what fits best.
          - Blend the logo perspective to match the product.
        `;
        result = await generateFromCompositeImages([image, logo], fullPrompt);
      } else {
        // Single Image Flow
        result = await editImage(image, corePrompt);
      }
      setResultImage(result);
    } catch (err: any) {
      setError(err.message || "Failed to generate image.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 pt-32 pb-20">
      <div className="mb-12 text-center">
         <div className="w-20 h-20 mx-auto mb-6 bg-orange-50 dark:bg-orange-900/20 rounded-full flex items-center justify-center">
           <ShoppingBag size={40} className="text-orange-500" />
         </div>
         <h2 className="text-3xl md:text-5xl font-heading font-bold uppercase tracking-tight mb-4">
           Product <span className="text-orange-500">Photography</span>
         </h2>
         <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
           Upload your product, add your logo, and describe the perfect setting. AI will handle the lighting, composition, and branding.
         </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-12 lg:gap-16">
         
         {/* Inputs */}
         <div className="space-y-8 bg-white dark:bg-white/5 p-8 rounded-2xl border border-gray-200 dark:border-white/10 shadow-lg">
            
            {/* Uploaders Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 md:col-span-1">
                <FileUploader 
                  label="1. Product Image" 
                  onFileSelect={(f) => { setImage(f); setResultImage(null); }} 
                  selectedFile={image}
                  className="h-48"
                />
              </div>
              <div className="col-span-2 md:col-span-1">
                <FileUploader 
                  label="2. Logo (Optional)" 
                  onFileSelect={(f) => { setLogo(f); setResultImage(null); }} 
                  selectedFile={logo}
                  className="h-48"
                />
                <div className="mt-2 flex items-center justify-center text-[10px] text-gray-400">
                   <ImagePlus size={12} className="mr-1" /> Auto-removes logo background
                </div>
              </div>
            </div>

            {/* Aspect Ratio */}
            <div>
               <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-3">Output Size</label>
               <div className="grid grid-cols-3 gap-3">
                  {['1:1', '16:9', '9:16'].map((r) => (
                    <button
                      key={r}
                      onClick={() => setAspectRatio(r as any)}
                      className={`py-3 text-xs font-bold rounded border transition-all ${
                        aspectRatio === r 
                        ? 'bg-orange-500 text-white border-orange-500' 
                        : 'border-gray-200 dark:border-white/10 text-gray-500 hover:bg-gray-50 dark:hover:bg-white/5'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
               </div>
            </div>

            {/* Prompt */}
            <div>
               <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-3">Background / Setting</label>
               <textarea 
                 value={prompt}
                 onChange={(e) => setPrompt(e.target.value)}
                 placeholder="E.g. 'Sitting on the rustic wooden table with morning sunlight', 'On a neon-lit podium', 'In a splash of water'..."
                 className="w-full bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-lg p-4 text-sm min-h-[120px] focus:outline-none focus:border-orange-500"
               />
            </div>

            <button 
               onClick={handleGenerate}
               disabled={!image || !prompt || isLoading}
               className={`w-full py-5 rounded-lg font-bold uppercase tracking-widest text-sm flex items-center justify-center space-x-2 transition-all ${
                 (!image || !prompt || isLoading)
                   ? 'bg-gray-200 dark:bg-white/10 text-gray-400 cursor-not-allowed'
                   : 'bg-orange-500 text-white hover:bg-orange-600 shadow-lg' 
               }`}
             >
               {isLoading ? <Loader2 className="animate-spin" size={18} /> : <Camera size={18} />}
               <span>{isLoading ? 'Staging Product...' : 'Generate Studio Shot'}</span>
             </button>
             {error && (
                <div className="text-red-500 text-xs text-center bg-red-50 dark:bg-red-900/20 p-3 rounded border border-red-200 dark:border-red-900/50">
                  {error}
                </div>
             )}
         </div>

         {/* Result */}
         <div className="h-full min-h-[500px] bg-gray-100 dark:bg-black/40 rounded-xl border-2 border-dashed border-gray-200 dark:border-white/10 flex items-center justify-center relative overflow-hidden">
            {resultImage ? (
              <div className="flex flex-col items-center animate-fade-in p-8 z-10 w-full">
                 <div className={`relative shadow-2xl rounded-lg overflow-hidden mb-8 ${aspectRatio === '16:9' ? 'aspect-video w-full' : aspectRatio === '9:16' ? 'aspect-[9/16] h-[500px]' : 'aspect-square h-[500px]'}`}>
                    <img src={resultImage} alt="Product" className="w-full h-full object-cover" />
                 </div>
                 <a href={resultImage} download="eslam-product.png" className="px-8 py-3 bg-white text-black font-bold uppercase text-xs rounded-full shadow-xl hover:bg-gray-200 flex items-center">
                    <Download className="mr-2 w-4 h-4"/> Download
                 </a>
              </div>
            ) : (
              <div className="text-center opacity-50">
                 <Camera size={48} className="mx-auto mb-4 text-gray-400" />
                 <p className="font-bold uppercase">Studio Result Here</p>
              </div>
            )}
         </div>
      </div>
    </div>
  );
};