import React, { useState } from 'react';
import { Feather, Download, Loader2, BookOpen } from 'lucide-react';
import { generateNovel } from '../../services/geminiService';

export const GlobalNovelist: React.FC = () => {
  const [genre, setGenre] = useState('Thriller');
  const [characters, setCharacters] = useState('');
  const [idea, setIdea] = useState('');
  const [novelText, setNovelText] = useState('');
  const [isWriting, setIsWriting] = useState(false);

  const handleWrite = async () => {
    if (!idea || !characters) return;
    setIsWriting(true);
    try {
      const text = await generateNovel(genre, idea, characters);
      setNovelText(text);
    } catch (e) {
      console.error(e);
    } finally {
      setIsWriting(false);
    }
  };

  const handleDownload = () => {
     const blob = new Blob([novelText], { type: 'text/plain' });
     const url = URL.createObjectURL(blob);
     const link = document.createElement('a');
     link.href = url;
     link.download = 'my_novel_chapter.txt';
     link.click();
  };

  return (
    <div className="min-h-screen bg-[#fdfbf7] dark:bg-eslam-black pt-32 pb-20 px-4 transition-colors">
       <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
             <div className="w-16 h-16 mx-auto mb-4 bg-amber-100 dark:bg-amber-900/20 rounded-full flex items-center justify-center">
                <Feather size={32} className="text-amber-700 dark:text-amber-500" />
             </div>
             <h2 className="text-4xl font-serif font-bold text-gray-900 dark:text-white mb-2">Global Novelist</h2>
             <p className="text-gray-500 font-serif italic">"Every great story begins with a single spark."</p>
          </div>

          <div className="grid md:grid-cols-12 gap-12">
             {/* Sidebar Inputs */}
             <div className="md:col-span-4 space-y-6">
                <div className="bg-white dark:bg-white/5 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-white/10">
                   <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Genre</label>
                   <select 
                     value={genre} 
                     onChange={(e) => setGenre(e.target.value)}
                     className="w-full p-3 rounded border border-gray-200 dark:border-white/10 bg-transparent text-sm dark:text-white outline-none focus:border-amber-500"
                   >
                      {['Thriller', 'Sci-Fi', 'Romance', 'Fantasy', 'Mystery', 'Historical Fiction', 'Horror'].map(g => (
                         <option key={g} value={g} className="dark:bg-black">{g}</option>
                      ))}
                   </select>
                </div>

                <div className="bg-white dark:bg-white/5 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-white/10">
                   <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Main Characters</label>
                   <textarea 
                     value={characters}
                     onChange={(e) => setCharacters(e.target.value)}
                     placeholder="e.g. John (Detective), Sarah (Witness)..."
                     className="w-full p-3 rounded border border-gray-200 dark:border-white/10 bg-transparent text-sm h-32 resize-none outline-none focus:border-amber-500 dark:text-white"
                   />
                </div>

                <div className="bg-white dark:bg-white/5 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-white/10">
                   <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Core Idea / Plot</label>
                   <textarea 
                     value={idea}
                     onChange={(e) => setIdea(e.target.value)}
                     placeholder="Describe the central conflict or theme..."
                     className="w-full p-3 rounded border border-gray-200 dark:border-white/10 bg-transparent text-sm h-40 resize-none outline-none focus:border-amber-500 dark:text-white"
                   />
                </div>

                <button 
                  onClick={handleWrite}
                  disabled={isWriting || !idea}
                  className="w-full py-4 bg-amber-700 hover:bg-amber-800 text-white font-bold uppercase tracking-widest text-xs rounded-xl shadow-lg transition-all flex items-center justify-center"
                >
                   {isWriting ? <Loader2 className="animate-spin" /> : <BookOpen size={16} className="mr-2" />}
                   {isWriting ? 'Writing Chapter...' : 'Write Novel'}
                </button>
             </div>

             {/* Paper Area */}
             <div className="md:col-span-8">
                <div className="bg-white shadow-2xl min-h-[800px] p-12 md:p-16 relative">
                   {/* Paper Texture Overlay */}
                   <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'url(https://www.transparenttextures.com/patterns/cream-paper.png)' }}></div>
                   
                   {novelText ? (
                      <div className="relative z-10 font-serif text-gray-800 leading-loose space-y-6 animate-fade-in">
                         <div className="text-right mb-12">
                           <button onClick={handleDownload} className="text-xs font-bold uppercase text-gray-400 hover:text-black flex items-center ml-auto">
                              <Download size={14} className="mr-1" /> Download
                           </button>
                         </div>
                         <h1 className="text-3xl font-bold text-center mb-8">{genre} Story</h1>
                         <div className="whitespace-pre-wrap text-lg">
                            {novelText}
                         </div>
                         <div className="text-center mt-12 text-gray-400 text-sm">* * *</div>
                      </div>
                   ) : (
                      <div className="h-full flex items-center justify-center text-gray-300 relative z-10">
                         <div className="text-center">
                            <Feather size={64} className="mx-auto mb-4 opacity-50" />
                            <p className="font-serif italic text-xl">The page is blank. Waiting for inspiration...</p>
                         </div>
                      </div>
                   )}
                </div>
             </div>
          </div>
       </div>
    </div>
  );
};