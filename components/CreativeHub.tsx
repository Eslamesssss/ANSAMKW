import React from 'react';
import { PenTool, Briefcase, ArrowRight } from 'lucide-react';
import { ViewState } from '../types';

interface CreativeHubProps {
  onNavigate: (view: ViewState) => void;
}

export const CreativeHub: React.FC<CreativeHubProps> = ({ onNavigate }) => {
  const tools = [
    {
      id: 'creative-logo-gen',
      title: 'AI Logo Generator',
      desc: 'Generate professional vector-style logos from text prompts. Perfect for startups and branding projects.',
      icon: PenTool,
      color: 'text-purple-500',
      bg: 'bg-purple-500/10',
      image: 'https://images.unsplash.com/photo-1626785774573-4b79931f7a47?w=800&q=80'
    },
    {
      id: 'creative-brand-kit',
      title: 'Brand Identity Suite',
      desc: 'Upload a logo to generate a complete visual identity guide, business cards, and 3D mockups.',
      icon: Briefcase,
      color: 'text-indigo-500',
      bg: 'bg-indigo-500/10',
      image: 'https://images.unsplash.com/photo-1586717791821-3f44a5638d48?w=800&q=80'
    }
  ];

  return (
    <div className="min-h-screen w-full pt-40 pb-24 px-6 bg-[#050505]">
      <div className="max-w-[1800px] mx-auto">
        {/* Header */}
        <div className="text-center mb-20 animate-fade-in">
          <h2 className="text-5xl md:text-7xl font-heading font-bold uppercase tracking-tighter mb-8 bg-gradient-to-b from-white via-gray-200 to-gray-500 bg-clip-text text-transparent drop-shadow-sm">
            Creative Professionals
          </h2>
          <p className="text-gray-400 max-w-3xl mx-auto text-xl font-light">
            Advanced AI tools for graphic design, branding, and identity visualization.
          </p>
        </div>

        {/* Cards Grid - Hyper Dimensions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          {tools.map((tool, idx) => (
            <button
              key={tool.id}
              onClick={() => onNavigate(tool.id as ViewState)}
              className="group relative h-[550px] w-full overflow-hidden rounded-[3rem] bg-[#111] border border-white/5 text-left transition-all duration-500 hover:border-white/20 hover:shadow-[0_0_50px_rgba(255,255,255,0.05)] hover:-translate-y-3"
              style={{ animationDelay: `${idx * 100}ms` }}
            >
              <div className="absolute inset-0 p-12 flex flex-col justify-between z-10">
                 <div className="flex justify-between items-start">
                    <div className={`w-20 h-20 rounded-3xl ${tool.bg} flex items-center justify-center backdrop-blur-sm border border-white/5 shadow-lg`}>
                       <tool.icon size={40} className={tool.color} />
                    </div>
                    <div className="px-6 py-3 rounded-full bg-black/60 border border-white/10 backdrop-blur-md text-xs font-bold uppercase tracking-widest text-white opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex items-center hover:bg-white hover:text-black">
                       Launch Tool <ArrowRight size={14} className="ml-2" />
                    </div>
                 </div>
                 
                 <div>
                    <h3 className="text-4xl font-heading font-bold text-white uppercase tracking-wide mb-4 drop-shadow-lg">
                      {tool.title}
                    </h3>
                    <p className="text-gray-300 text-base leading-relaxed max-w-lg font-light">
                      {tool.desc}
                    </p>
                 </div>
              </div>
              
               {/* Background Glow Effect */}
              <div className="absolute right-0 bottom-0 w-full h-full bg-gradient-to-t from-black via-transparent to-transparent z-0"></div>
              <div className="absolute right-0 bottom-0 w-2/3 h-full bg-gradient-to-l from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 z-0"></div>

              {/* Subtle Image Texture */}
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