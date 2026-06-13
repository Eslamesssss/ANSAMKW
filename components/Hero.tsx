import React from 'react';
import { ViewState } from '../types';
import { ArrowRight } from 'lucide-react';

interface HeroProps {
  onNavigate?: (view: ViewState) => void;
  languageProp?: any;
}

export const Hero: React.FC<HeroProps> = ({ onNavigate, languageProp }) => {
  const { t, language } = languageProp || { t: {}, language: 'en' };
  const isAr = language === 'ar';

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black flex flex-col justify-center">
      
      {/* Full Background Image */}
      <div className="absolute inset-0 w-full h-full z-0">
         <img 
            src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2864&auto=format&fit=crop" 
            alt="Dark AI Background" 
            className="w-full h-full object-cover opacity-50"
         />
         {/* Gradient Overlay for fade to black at bottom and text readability */}
         <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-[#050505]"></div>
         <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#000_100%)] opacity-80"></div>
      </div>

      {/* Animated Blobs (Subtle behind text) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
         <div className="absolute top-[20%] left-[20%] w-[40%] h-[40%] rounded-full bg-purple-900/10 blur-[120px] animate-pulse-slow"></div>
         <div className="absolute bottom-[20%] right-[20%] w-[40%] h-[40%] rounded-full bg-blue-900/10 blur-[120px] animate-pulse-slow animation-delay-2000"></div>
      </div>

      {/* Content Container */}
      <div className="relative z-10 max-w-[1800px] mx-auto px-6 sm:px-8 lg:px-12 flex flex-col items-center text-center h-full justify-center pt-24 pb-40">
        
          {/* Chrome Text Headline */}
          <h1 className="font-heading font-black uppercase leading-none tracking-tighter mb-10 drop-shadow-2xl flex flex-col items-center">
            <span className={`block bg-gradient-to-b from-white via-gray-100 to-gray-400 bg-clip-text text-transparent pb-2 ${isAr ? 'text-6xl md:text-8xl lg:text-9xl' : 'text-7xl md:text-8xl lg:text-[140px]'}`} style={{ textShadow: '0 0 30px rgba(255,255,255,0.2), 0 0 60px rgba(255,255,255,0.1)' }}>
              ESLAM AI KIT
            </span>
            <span className={`block bg-gradient-to-b from-gray-100 via-gray-300 to-gray-500 bg-clip-text text-transparent mt-2 ${isAr ? 'text-3xl md:text-4xl lg:text-5xl' : 'text-4xl md:text-5xl lg:text-7xl'}`} style={{ textShadow: '0 0 30px rgba(255,255,255,0.15)' }}>
              IMAGINE. CREATE. INSPIRE.
            </span>
          </h1>
          
          <p className="text-sm md:text-xl text-gray-300 max-w-3xl mx-auto font-light mb-16 leading-relaxed tracking-wide mix-blend-plus-lighter opacity-80">
            {t?.hero.subtitle || "A creative suite for filmmakers, advertisers, & creative teams."}
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-8">
            <button 
              onClick={() => onNavigate && onNavigate('useful-tools')}
              className="px-12 py-5 bg-white text-black font-bold text-sm uppercase tracking-[0.2em] hover:bg-gray-200 transition-all rounded-full shadow-[0_0_40px_rgba(255,255,255,0.3)] flex items-center hover:scale-105"
            >
              {t?.hero.cta} <ArrowRight size={18} className="ml-3 rtl:mr-3 rtl:ml-0" />
            </button>
            <button 
              onClick={() => onNavigate && onNavigate('about')}
              className="px-12 py-5 bg-black/40 border border-white/20 text-white font-bold text-sm uppercase tracking-[0.2em] hover:bg-white/10 transition-all rounded-full backdrop-blur-md hover:border-white/40"
            >
              {t?.nav.about}
            </button>
          </div>

      </div>

      {/* Bottom Cards Overlay - Responsive with Images */}
      <div className="absolute bottom-4 md:bottom-8 left-0 right-0 z-20 px-2 md:px-6">
          <div className="max-w-[1200px] mx-auto grid grid-cols-3 gap-2 md:gap-4">
             {/* Agency Card */}
             <div 
                onClick={() => onNavigate && onNavigate('agency-hub')}
                className="group cursor-pointer relative overflow-hidden bg-black/80 backdrop-blur-xl border border-white/10 rounded-xl h-24 md:h-32 hover:border-white/40 transition-all hover:-translate-y-1 duration-500 shadow-2xl"
             >
                <div className="absolute inset-0 opacity-30 group-hover:opacity-50 transition-opacity duration-500">
                   <img src="https://images.unsplash.com/photo-1552664730-d307ca884978?w=800&q=80" className="w-full h-full object-cover" alt="Agency" />
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent"></div>
                
                <div className="relative z-10 p-3 md:p-5 flex flex-col justify-end h-full">
                   <div className="flex items-center justify-between">
                      <div>
                          <h3 className="text-white font-bold uppercase tracking-widest text-[9px] md:text-xs mb-1">{t?.hero.cardAgency}</h3>
                          <p className="text-gray-300 text-[8px] md:text-[9px] uppercase tracking-wider opacity-80 hidden sm:block">Commercial production tools.</p>
                      </div>
                      <div className="w-5 h-5 md:w-6 md:h-6 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white group-hover:text-black transition-colors">
                         <ArrowRight size={10} className="-rotate-45 group-hover:rotate-0 duration-500 transition-transform md:w-3 md:h-3" />
                      </div>
                   </div>
                </div>
             </div>

             {/* Creative Card */}
             <div 
                onClick={() => onNavigate && onNavigate('creative-hub')}
                className="group cursor-pointer relative overflow-hidden bg-black/80 backdrop-blur-xl border border-white/10 rounded-xl h-24 md:h-32 hover:border-white/40 transition-all hover:-translate-y-1 duration-500 shadow-2xl"
             >
                <div className="absolute inset-0 opacity-30 group-hover:opacity-50 transition-opacity duration-500">
                   <img src="https://images.unsplash.com/photo-1600607686527-6fb886090705?w=800&q=80" className="w-full h-full object-cover" alt="Creative" />
                </div>
                 <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent"></div>

                <div className="relative z-10 p-3 md:p-5 flex flex-col justify-end h-full">
                   <div className="flex items-center justify-between">
                      <div>
                          <h3 className="text-white font-bold uppercase tracking-widest text-[9px] md:text-xs mb-1">{t?.hero.cardCreative}</h3>
                          <p className="text-gray-300 text-[8px] md:text-[9px] uppercase tracking-wider opacity-80 hidden sm:block">Design & Branding suite.</p>
                      </div>
                      <div className="w-5 h-5 md:w-6 md:h-6 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white group-hover:text-black transition-colors">
                         <ArrowRight size={10} className="-rotate-45 group-hover:rotate-0 duration-500 transition-transform md:w-3 md:h-3" />
                      </div>
                   </div>
                </div>
             </div>

             {/* Film Card */}
             <div 
                onClick={() => onNavigate && onNavigate('filmmaker-hub')}
                className="group cursor-pointer relative overflow-hidden bg-black/80 backdrop-blur-xl border border-white/10 rounded-xl h-24 md:h-32 hover:border-white/40 transition-all hover:-translate-y-1 duration-500 shadow-2xl"
             >
                <div className="absolute inset-0 opacity-30 group-hover:opacity-50 transition-opacity duration-500">
                   <img src="https://images.unsplash.com/photo-1485846234645-a62644f84728?w=800&q=80" className="w-full h-full object-cover" alt="Film" />
                </div>
                 <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent"></div>

                <div className="relative z-10 p-3 md:p-5 flex flex-col justify-end h-full">
                   <div className="flex items-center justify-between">
                      <div>
                          <h3 className="text-white font-bold uppercase tracking-widest text-[9px] md:text-xs mb-1">{t?.hero.cardFilm}</h3>
                          <p className="text-gray-300 text-[8px] md:text-[9px] uppercase tracking-wider opacity-80 hidden sm:block">Directing & Script tools.</p>
                      </div>
                      <div className="w-5 h-5 md:w-6 md:h-6 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white group-hover:text-black transition-colors">
                         <ArrowRight size={10} className="-rotate-45 group-hover:rotate-0 duration-500 transition-transform md:w-3 md:h-3" />
                      </div>
                   </div>
                </div>
             </div>
          </div>
      </div>
    </div>
  );
};
