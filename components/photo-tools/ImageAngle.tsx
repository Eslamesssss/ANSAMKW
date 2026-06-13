import React, { useState } from 'react';
import { FileUploader } from '../ui/FileUploader';
import { Rotate3D, Move, Loader2, Download, Camera, Settings2 } from 'lucide-react';
import { editImage } from '../../services/geminiService';

export const ImageAngle: React.FC = () => {
  const [image, setImage] = useState<File | null>(null);
  const [angleX, setAngleX] = useState(0);
  const [angleY, setAngleY] = useState(0);
  const [selectedPreset, setSelectedPreset] = useState<string>('custom');
  const [isLoading, setIsLoading] = useState(false);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const presets = [
    { id: 'low_angle', label: "From a low angle, looking up" },
    { id: 'high_angle', label: "From a high angle, looking down (bird's eye view)" },
    { id: 'left_side', label: "From the direct left side" },
    { id: 'right_side', label: "From the direct right side" },
    { id: 'dramatic_45', label: "From a dramatic 45-degree angle" },
    { id: 'closeup', label: "Close-up shot" },
    { id: 'wide_angle', label: "Wide-angle shot" },
    { id: 'dutch_angle', label: "Dutch angle (tilted)" },
    { id: 'custom', label: "Custom..." },
  ];

  const handleGenerate = async () => {
    if (!image) return;
    setIsLoading(true);
    setError(null);
    
    let angleInstruction = "";

    if (selectedPreset === 'custom') {
      const horizontal = angleX > 0 ? `${angleX} degrees to the right` : `${Math.abs(angleX)} degrees to the left`;
      const vertical = angleY > 0 ? `${angleY} degrees from top` : `${Math.abs(angleY)} degrees from bottom`;
      angleInstruction = `Rotate the perspective/camera angle: ${horizontal} and ${vertical}.`;
    } else {
      const preset = presets.find(p => p.id === selectedPreset);
      angleInstruction = `Change the camera view to be: ${preset?.label}.`;
    }
    
    const prompt = `Generate a new view of this image. ${angleInstruction} Maintain the original subject identity, style, and background context as much as possible. The output must be a high-quality image.`;

    try {
      const result = await editImage(image, prompt);
      setResultImage(result);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to change angle. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-[1600px] mx-auto px-4 pt-32 pb-24 min-h-screen">
      <div className="mb-12 text-center">
        <h2 className="text-3xl md:text-5xl font-heading font-bold uppercase tracking-tight mb-4">
          Image <span className="text-blue-600 dark:text-blue-400">Angle Changer</span>
        </h2>
        <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
          Redefine the perspective of your photos with 3D-aware AI adjustments.
        </p>
      </div>

      <div className="bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl p-6 lg:p-10 shadow-xl">
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 xl:gap-16">
          
          {/* Controls - Spans 4 cols on XL screens */}
          <div className="xl:col-span-4 space-y-8">
            
            <div className="bg-gray-50 dark:bg-black/20 p-6 rounded-xl border border-gray-100 dark:border-white/5 shadow-sm">
               <h3 className="text-sm font-bold uppercase tracking-widest mb-4 flex items-center text-gray-700 dark:text-gray-300">
                <Camera size={16} className="mr-2" /> Choose New Angle
              </h3>
              <div className="relative">
                <select 
                  value={selectedPreset}
                  onChange={(e) => setSelectedPreset(e.target.value)}
                  className="w-full appearance-none bg-white dark:bg-white/10 border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-200 py-4 px-4 pr-8 rounded-lg leading-tight focus:outline-none focus:bg-white dark:focus:bg-white/20 focus:border-blue-500 transition-colors text-sm font-medium"
                >
                  {presets.map((p) => (
                    <option key={p.id} value={p.id} className="text-black">
                      {p.label}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700 dark:text-gray-400">
                  <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                </div>
              </div>
            </div>

            {selectedPreset === 'custom' && (
              <div className="bg-gray-50 dark:bg-black/20 p-6 rounded-xl border border-gray-100 dark:border-white/5 animate-fade-in shadow-sm">
                <h3 className="text-sm font-bold uppercase tracking-widest mb-6 flex items-center text-gray-700 dark:text-gray-300">
                  <Settings2 size={16} className="mr-2" /> Manual Adjustments
                </h3>
                
                <div className="space-y-6">
                  <div>
                    <div className="flex justify-between mb-2">
                      <label className="text-xs font-semibold text-gray-500">Horizontal Axis</label>
                      <span className="text-xs font-mono">{angleX}°</span>
                    </div>
                    <input 
                      type="range" 
                      min="-45" 
                      max="45" 
                      value={angleX}
                      onChange={(e) => setAngleX(parseInt(e.target.value))}
                      className="w-full h-2 bg-gray-200 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                    <div className="flex justify-between mt-1 text-[10px] text-gray-400 uppercase">
                      <span>Left</span>
                      <span>Right</span>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between mb-2">
                      <label className="text-xs font-semibold text-gray-500">Vertical Axis</label>
                      <span className="text-xs font-mono">{angleY}°</span>
                    </div>
                    <input 
                      type="range" 
                      min="-45" 
                      max="45" 
                      value={angleY}
                      onChange={(e) => setAngleY(parseInt(e.target.value))}
                      className="w-full h-2 bg-gray-200 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                    <div className="flex justify-between mt-1 text-[10px] text-gray-400 uppercase">
                      <span>Down</span>
                      <span>Top</span>
                    </div>
                  </div>
                </div>

                <div className="mt-8 flex space-x-2">
                  <button 
                    onClick={() => { setAngleX(0); setAngleY(0); setResultImage(null); }}
                    className="flex-1 py-3 bg-gray-200 dark:bg-white/10 hover:bg-gray-300 dark:hover:bg-white/20 rounded text-xs font-bold uppercase transition-colors"
                  >
                    Reset Sliders
                  </button>
                </div>
              </div>
            )}

            <button 
              onClick={handleGenerate}
              disabled={!image || isLoading}
              className={`w-full py-5 rounded-lg font-bold uppercase tracking-widest text-sm flex items-center justify-center space-x-2 transition-all ${
                (!image || isLoading)
                  ? 'bg-gray-200 dark:bg-white/10 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-600/20'
              }`}
            >
              {isLoading ? <Loader2 className="animate-spin" size={18} /> : <Rotate3D size={18} />}
              <span>{isLoading ? 'Generating...' : 'Generate View'}</span>
            </button>
            {error && (
              <div className="text-red-500 text-xs text-center mt-2 bg-red-50 dark:bg-red-900/20 p-3 rounded border border-red-200 dark:border-red-900/50">
                {error}
              </div>
            )}
          </div>

          {/* Image Area - Spans 8 Cols on XL */}
          <div className="xl:col-span-8 flex flex-col h-full min-h-[600px]">
             <div className="flex-1 bg-black/5 dark:bg-black/40 rounded-xl border border-gray-200 dark:border-white/10 p-6 flex flex-col items-center justify-center relative overflow-hidden">
                {!image ? (
                  <div className="w-full max-w-md mx-auto">
                     <FileUploader 
                      label="Upload Source Image" 
                      onFileSelect={(f) => { setImage(f); setResultImage(null); }} 
                      className="h-64"
                    />
                  </div>
                ) : (
                  <>
                    {resultImage ? (
                      <div className="relative w-full h-full flex flex-col items-center justify-center animate-fade-in z-10">
                         <img src={resultImage} alt="New Angle" className="max-w-full max-h-[600px] object-contain shadow-2xl rounded-lg" />
                         <div className="flex gap-4 mt-8">
                            <button 
                              onClick={() => { setImage(null); setResultImage(null); }}
                              className="px-6 py-3 bg-black/50 text-white text-xs font-bold uppercase rounded-full hover:bg-black/70 transition-colors"
                            >
                              New Image
                            </button>
                            <a 
                              href={resultImage} 
                              download="eslam-angle-change.png"
                              className="px-6 py-3 bg-blue-600 text-white text-xs font-bold uppercase rounded-full hover:bg-blue-700 transition-colors flex items-center"
                            >
                              <Download size={14} className="mr-2" /> Save Result
                            </a>
                         </div>
                      </div>
                    ) : (
                      <div className="relative w-full h-full flex items-center justify-center overflow-hidden rounded-lg z-10">
                         <div className="absolute inset-0 opacity-10 dark:opacity-5" style={{ backgroundImage: 'radial-gradient(circle, #888 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
                         
                         {isLoading && (
                            <div className="absolute inset-0 bg-black/60 z-20 flex flex-col items-center justify-center backdrop-blur-sm">
                               <Loader2 className="text-blue-500 animate-spin mb-4" size={64} />
                               <p className="text-white font-bold uppercase tracking-widest">AI Calculating Geometry...</p>
                            </div>
                         )}
                         
                         {image && (
                           <img 
                            src={URL.createObjectURL(image)} 
                            alt="Preview"
                            className="max-w-full max-h-full shadow-2xl transition-transform duration-700 ease-out"
                            style={{ 
                              transform: selectedPreset === 'custom' 
                                ? `perspective(1000px) rotateY(${angleX}deg) rotateX(${-angleY}deg)` 
                                : 'none'
                            }}
                           />
                         )}
                         <button 
                          onClick={() => setImage(null)}
                          className="absolute top-4 right-4 px-4 py-2 bg-black/50 text-white text-xs font-bold uppercase rounded-full backdrop-blur-md hover:bg-red-600 transition-colors z-20"
                         >
                           Change Image
                         </button>
                      </div>
                    )}
                  </>
                )}
             </div>
          </div>

        </div>
      </div>
    </div>
  );
};