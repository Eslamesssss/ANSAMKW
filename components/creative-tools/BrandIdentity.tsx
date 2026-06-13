import React, { useState } from 'react';
import { FileUploader } from '../ui/FileUploader';
import { Briefcase, CreditCard, Box, Loader2, Download, Palette, Type, Sparkles, Coffee, ShoppingBag, Monitor, Store, Package, MapPin, Layers } from 'lucide-react';
import { analyzeBrandIdentity, generateFromCompositeImages } from '../../services/geminiService';

export const BrandIdentity: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'identity' | 'mockup'>('identity');
  const [logo, setLogo] = useState<File | null>(null);
  const [companyName, setCompanyName] = useState('');
  
  // Contact Details for Mockups
  const [contact, setContact] = useState({
    name: '',
    phone: '',
    address: '',
    website: ''
  });

  // Identity State
  const [identityData, setIdentityData] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Mockup State
  const [mockupType, setMockupType] = useState('Business Card');
  const [logoMaterial, setLogoMaterial] = useState('Original'); 
  const [mockupResult, setMockupResult] = useState<string | null>(null);
  const [isGeneratingMockup, setIsGeneratingMockup] = useState(false);
  
  const [error, setError] = useState<string | null>(null);

  const mockupTypes = [
    { id: 'Business Card', label: 'Business Card', icon: CreditCard },
    { id: 'Stationery', label: 'Office Stationery', icon: Briefcase },
    { id: 'Coffee Cup', label: 'Coffee Cup', icon: Coffee },
    { id: 'Tote Bag', label: 'Tote Bag', icon: ShoppingBag },
    { id: 'Billboard', label: 'Street Billboard', icon: MapPin },
    { id: 'Laptop', label: 'Laptop Screen', icon: Monitor },
    { id: 'Storefront', label: 'Store Window', icon: Store },
    { id: 'Packaging', label: 'Product Box', icon: Package },
  ];

  const materials = [
    { id: 'Original', label: 'Original Colors', color: 'bg-gray-200 text-gray-800' },
    { id: 'Gold Foil', label: 'Gold Foil (Luxury)', color: 'bg-yellow-400 text-black' },
    { id: 'Silver Foil', label: 'Silver Emboss', color: 'bg-gray-400 text-white' },
    { id: 'Matte White', label: 'Matte White (Dark BG)', color: 'bg-white border border-gray-300 text-black' },
    { id: 'Debossed', label: 'Debossed (Engraved)', color: 'bg-stone-300 text-stone-800' },
  ];

  const handleAnalyzeIdentity = async () => {
    if (!logo || !companyName) return;
    setIsAnalyzing(true);
    setError(null);
    try {
      const data = await analyzeBrandIdentity(logo, companyName);
      setIdentityData(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerateMockup = async () => {
    if (!logo) return;
    setIsGeneratingMockup(true);
    setError(null);
    setMockupResult(null);

    const contactInfoPrompt = `
      Include the following contact details on the item text area naturally if applicable:
      Name: "${contact.name}"
      Phone: "${contact.phone}"
      Address: "${contact.address}"
      Website: "${contact.website}"
    `;

    let materialInstruction = "Maintain the original logo colors and opacity.";
    if (logoMaterial === 'Gold Foil') {
        materialInstruction = "RENDER THE LOGO AS LUXURIOUS GOLD FOIL STAMPED ON THE SURFACE. It must catch the light, be metallic, and have high contrast.";
    } else if (logoMaterial === 'Silver Foil') {
        materialInstruction = "RENDER THE LOGO AS METALLIC SILVER EMBOSSING. It should look 3D and shiny.";
    } else if (logoMaterial === 'Matte White') {
        materialInstruction = "RENDER THE LOGO IN PURE MATTE WHITE INK. This is essential for visibility on dark backgrounds. Ignore original colors, make it white.";
    } else if (logoMaterial === 'Debossed') {
        materialInstruction = "RENDER THE LOGO AS DEBOSSED (PRESSED INWARDS) into the material. No ink, just texture and shadow.";
    }

    const prompt = `
      High-Fidelity Product Mockup Generation.
      TASK: Render a photorealistic ${mockupType} featuring the provided logo.
      RULES: 1. ${materialInstruction} 2. The logo must be sharp. 3. DO NOT distort geometry.
      CONTEXT: Professional cinematic lighting. ${contactInfoPrompt}
    `;

    try {
      const result = await generateFromCompositeImages([logo], prompt);
      setMockupResult(result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsGeneratingMockup(false);
    }
  };

  return (
    <div className="max-w-[1600px] mx-auto px-4 pt-32 pb-24 min-h-screen">
      <div className="mb-12 text-center">
        <h2 className="text-3xl md:text-5xl font-heading font-bold uppercase tracking-tight mb-4">
          Brand <span className="text-indigo-600 dark:text-indigo-400">Identity Suite</span>
        </h2>
        <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
          Upload your logo to generate comprehensive brand guides and realistic 3D mockups with your real data.
        </p>
      </div>

      <div className="flex justify-center mb-12">
         <div className="bg-gray-100 dark:bg-white/5 p-1 rounded-full inline-flex">
            <button 
              onClick={() => setActiveTab('identity')}
              className={`px-8 py-3 rounded-full text-xs font-bold uppercase tracking-wide transition-all ${activeTab === 'identity' ? 'bg-white dark:bg-indigo-600 text-black dark:text-white shadow-md' : 'text-gray-500 hover:text-black dark:hover:text-white'}`}
            >
              Identity Analyzer
            </button>
            <button 
              onClick={() => setActiveTab('mockup')}
              className={`px-8 py-3 rounded-full text-xs font-bold uppercase tracking-wide transition-all ${activeTab === 'mockup' ? 'bg-white dark:bg-indigo-600 text-black dark:text-white shadow-md' : 'text-gray-500 hover:text-black dark:hover:text-white'}`}
            >
              3D Mockups
            </button>
         </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-10 items-start">
         
         {/* Sidebar - Full height, scrollable internal content */}
         <div className="xl:col-span-4 bg-white dark:bg-white/5 p-6 rounded-3xl border border-gray-200 dark:border-white/10 shadow-xl flex flex-col h-[calc(100vh-300px)] min-h-[600px]">
            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                <h3 className="font-bold uppercase text-sm mb-4">1. Upload Logo</h3>
                <FileUploader 
                  label="Logo File (PNG/JPG)" 
                  onFileSelect={setLogo} 
                  selectedFile={logo} 
                  className="h-40 mb-6"
                />

                {activeTab === 'identity' && (
                   <div className="space-y-4 animate-fade-in">
                      <div>
                         <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Brand Name</label>
                         <input 
                           type="text" 
                           value={companyName} 
                           onChange={(e) => setCompanyName(e.target.value)}
                           className="w-full bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-lg p-3 text-sm"
                           placeholder="My Brand Co."
                         />
                      </div>
                      <button 
                        onClick={handleAnalyzeIdentity}
                        disabled={!logo || !companyName || isAnalyzing}
                        className="w-full py-4 bg-indigo-600 text-white rounded-lg font-bold uppercase text-xs hover:bg-indigo-700 transition-colors shadow-lg flex items-center justify-center mt-4"
                      >
                        {isAnalyzing ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} className="mr-2" />}
                        Generate Brand Guide
                      </button>
                   </div>
                )}

                {activeTab === 'mockup' && (
                   <div className="space-y-6 animate-fade-in">
                      <div>
                         <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">2. Select Mockup Type</label>
                         <div className="grid grid-cols-2 gap-2">
                            {mockupTypes.map((type) => (
                               <button
                                 key={type.id}
                                 onClick={() => setMockupType(type.id)}
                                 className={`flex flex-col items-center p-3 rounded-lg border transition-all ${mockupType === type.id ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-500 text-indigo-700 dark:text-indigo-300' : 'border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5'}`}
                               >
                                  <type.icon size={20} className="mb-2"/>
                                  <span className="text-[10px] font-bold uppercase text-center leading-tight">{type.label}</span>
                               </button>
                            ))}
                         </div>
                      </div>

                      <div>
                         <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-3 flex items-center">
                            3. Logo Finish / Material <Layers size={12} className="ml-2 text-indigo-500" />
                         </label>
                         <div className="grid grid-cols-2 gap-2">
                            {materials.map((mat) => (
                               <button
                                 key={mat.id}
                                 onClick={() => setLogoMaterial(mat.id)}
                                 className={`px-2 py-3 rounded-md text-[10px] font-bold uppercase border transition-all ${
                                    logoMaterial === mat.id 
                                    ? 'border-indigo-500 ring-1 ring-indigo-500 opacity-100' 
                                    : 'border-gray-200 dark:border-white/10 opacity-70 hover:opacity-100'
                                 } ${mat.color}`}
                               >
                                  {mat.label}
                               </button>
                            ))}
                         </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">4. Brand Details (Optional)</label>
                        <div className="space-y-3">
                          <input type="text" placeholder="Full Name" value={contact.name} onChange={(e) => setContact({...contact, name: e.target.value})} className="w-full bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-lg p-2.5 text-xs" />
                           <input type="text" placeholder="Phone Number" value={contact.phone} onChange={(e) => setContact({...contact, phone: e.target.value})} className="w-full bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-lg p-2.5 text-xs" />
                           <input type="text" placeholder="Address" value={contact.address} onChange={(e) => setContact({...contact, address: e.target.value})} className="w-full bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-lg p-2.5 text-xs" />
                           <input type="text" placeholder="Website URL" value={contact.website} onChange={(e) => setContact({...contact, website: e.target.value})} className="w-full bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-lg p-2.5 text-xs" />
                        </div>
                      </div>

                      <button 
                        onClick={handleGenerateMockup}
                        disabled={!logo || isGeneratingMockup}
                        className="w-full py-4 bg-indigo-600 text-white rounded-lg font-bold uppercase text-xs hover:bg-indigo-700 transition-colors shadow-lg flex items-center justify-center mt-4 sticky bottom-0"
                      >
                        {isGeneratingMockup ? <Loader2 className="animate-spin" size={16} /> : <Box size={16} className="mr-2" />}
                        Render Mockup
                      </button>
                   </div>
                )}
                {error && <p className="text-red-500 text-xs text-center mt-4">{error}</p>}
            </div>
         </div>

         {/* Main Viewport */}
         <div className="xl:col-span-8 h-[calc(100vh-300px)] min-h-[600px]">
            {activeTab === 'identity' && (
               <div className="bg-white dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-3xl p-8 h-full overflow-y-auto relative">
                  {!identityData ? (
                     <div className="absolute inset-0 flex items-center justify-center text-gray-400 opacity-50 flex-col">
                        <Palette size={64} className="mb-4"/>
                        <p className="font-bold uppercase tracking-widest">Brand Guide Preview</p>
                     </div>
                  ) : (
                     <div className="animate-fade-in space-y-10">
                        <div className="border-b border-gray-200 dark:border-white/10 pb-6">
                           <h3 className="text-4xl font-heading font-bold uppercase mb-2">{companyName}</h3>
                           <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">AI-Generated Brand Guidelines</p>
                        </div>
                        <div>
                           <h4 className="flex items-center text-sm font-bold uppercase tracking-widest mb-6 text-indigo-500">
                             <Palette size={18} className="mr-2" /> Color Palette
                           </h4>
                           <div className="flex flex-wrap gap-6">
                              {identityData.colors?.map((color: string, idx: number) => (
                                 <div key={idx} className="group">
                                    <div className="w-24 h-24 rounded-full shadow-lg mb-3 ring-4 ring-white dark:ring-white/5 transition-transform group-hover:scale-110" style={{ backgroundColor: color }}></div>
                                    <p className="text-center font-mono text-xs text-gray-500">{color}</p>
                                 </div>
                              ))}
                           </div>
                        </div>
                        <div>
                           <h4 className="flex items-center text-sm font-bold uppercase tracking-widest mb-6 text-indigo-500">
                             <Type size={18} className="mr-2" /> Typography
                           </h4>
                           <div className="grid md:grid-cols-2 gap-6">
                              {identityData.typography && Object.entries(identityData.typography).map(([key, val]: any) => (
                                 <div key={key} className="bg-gray-50 dark:bg-white/5 p-6 rounded-xl border border-gray-100 dark:border-white/5">
                                    <span className="text-[10px] uppercase font-bold text-gray-400 mb-2 block">{key}</span>
                                    <p className="text-lg font-bold">{val}</p>
                                 </div>
                              ))}
                           </div>
                        </div>
                         <div>
                           <h4 className="flex items-center text-sm font-bold uppercase tracking-widest mb-6 text-indigo-500">
                             <Sparkles size={18} className="mr-2" /> Brand Voice
                           </h4>
                           <div className="bg-indigo-50 dark:bg-indigo-900/10 p-6 rounded-xl border border-indigo-100 dark:border-indigo-900/30">
                              <p className="text-gray-700 dark:text-gray-300 leading-relaxed italic">"{identityData.brand_voice}"</p>
                           </div>
                        </div>
                     </div>
                  )}
               </div>
            )}

            {activeTab === 'mockup' && (
               <div className="bg-gray-100 dark:bg-black border border-gray-200 dark:border-white/10 rounded-3xl h-full flex items-center justify-center overflow-hidden relative">
                  {mockupResult ? (
                     <div className="relative w-full h-full flex flex-col items-center justify-center animate-fade-in">
                        <img src={mockupResult} alt="Mockup" className="w-full h-full object-contain" />
                        <a href={mockupResult} download={`eslam-mockup-${mockupType}.png`} className="absolute bottom-8 px-8 py-3 bg-white text-black rounded-full font-bold uppercase text-xs shadow-2xl hover:bg-gray-200 flex items-center z-20">
                           <Download className="mr-2 w-4 h-4"/> Download High-Res
                        </a>
                     </div>
                  ) : (
                     <div className="text-center opacity-30">
                        <Box size={64} className="mx-auto mb-4" />
                        <p className="font-bold uppercase tracking-widest">3D Render Preview</p>
                     </div>
                  )}
               </div>
            )}
         </div>
      </div>
    </div>
  );
};