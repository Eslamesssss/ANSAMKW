import React from 'react';
import { Clapperboard, ScrollText, Feather, ArrowRight } from 'lucide-react';
import { ViewState } from '../types';

interface FilmmakerHubProps {
  onNavigate: (view: ViewState) => void;
}

export const FilmmakerHub: React.FC<FilmmakerHubProps> = ({ onNavigate }) => {
  const tools = [
    {
      id: 'film-storyboard-pro',
      title: 'AI Storyboard Pro',
      desc: 'Advanced studio pipeline. Generate coherent shot sequences with manual control and cinematic layouts.',
      icon: Clapperboard,
      color: 'text-red-500',
      bg: 'bg-red-500/10',
      image: 'https://images.unsplash.com/photo-1598899134739-24c46f58b8c0?w=800&q=80'
    },
    {
      id: 'film-script-writer',
      title: 'Script-to-Screen',
      desc: 'Convert narrative stories into industry-standard shot lists with automated visual prompts.',
      icon: ScrollText,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
      image: 'https://images.unsplash.com/photo-1455390582262-044cdead277a?w=800&q=80'
    },
    {
      id: 'film-novelist',
      title: 'Global Novelist',
      desc: 'Write best-selling cinematic novels. Input your core idea and let AI craft the chapters.',
      icon: Feather,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10',
      image: 'https://images.unsplash.com/photo-1471107340929-a87cd0f5b5f3?w=800&q=80'
    }
  ];

  return (
    <div className="min-h-screen w-full pt-40 pb-24 px-6 bg-[#050505]">
      <div className="max-w-[1800px] mx-auto">
        {/* Header */}
        <div className="text-center mb-20 animate-fade-in">
          <h2 className="text-5xl md:text-7xl font-heading font-bold uppercase tracking-tighter mb-8 bg-gradient-to-b from-white via-gray-200 to-gray-500 bg-clip-text text-transparent drop-shadow-sm">
            Filmmakers Studio
          </h2>
          <p className="text-gray-400 max-w-3xl mx-auto text-xl font-light">
            Professional-grade tools for directors, screenwriters, and storytellers.
          </p>
        </div>

        {/* Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {tools.map((tool, idx) => (
            <button
              key={tool.id}
              onClick={() => onNavigate(tool.id as ViewState)}
              className="group relative h-[550px] w-full overflow-hidden rounded-[3rem] bg-[#111] border border-white/5 text-left transition-all duration-500 hover:border-white/20 hover:shadow-[0_0_50px_rgba(255,255,255,0.05)] hover:-translate-y-3"
              style={{ animationDelay: `${idx * 100}ms` }}
            >
               <div className="absolute inset-0 p-10 flex flex-col justify-between z-10">
                 <div className="flex justify-between items-start">
                    <div className={`w-16 h-16 rounded-2xl ${tool.bg} flex items-center justify-center backdrop-blur-sm border border-white/5 shadow-lg`}>
                       <tool.icon size={32} className={tool.color} />
                    </div>
                 </div>
                 
                 <div>
                    <h3 className="text-3xl font-heading font-bold text-white uppercase tracking-wide mb-4 drop-shadow-lg">
                      {tool.title}
                    </h3>
                    <p className="text-gray-400 text-sm leading-relaxed border-l-2 border-white/10 pl-5 py-1 font-light">
                      {tool.desc}
                    </p>
                 </div>

                 <div className="flex items-center text-xs font-bold uppercase tracking-widest text-white/50 group-hover:text-white transition-colors">
                   Launch App <ArrowRight size={12} className="ml-2" />
                 </div>
              </div>
              
              {/* Background Glow */}
              <div className="absolute bottom-0 left-0 w-full h-2/3 bg-gradient-to-t from-black via-black/50 to-transparent z-0"></div>
              <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 z-0"></div>
              
              {/* Image Hint */}
               <div className="absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity duration-1000 z-[-1] scale-110 group-hover:scale-100 transform">
                 <img src={tool.image} alt="" className="w-full h-full object-cover grayscale" />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};