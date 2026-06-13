import React, { useState, useEffect } from 'react';
import { ChevronDown, Menu, X, Facebook, Instagram, Mail, MessageCircle, Send, Moon, Sun, Wand2, Rotate3D, Users, ScanEye, UserCircle2, Clapperboard, ExternalLink, Film, PlayCircle, MessageSquare, Image as ImageIcon, Video, Mic, PenTool } from 'lucide-react';
import { NavItem, ViewState } from '../types';
import { useLanguage } from '../hooks/useLanguage';
import { Language } from '../i18n/translations';

interface NavbarProps {
  onNavigate: (view: ViewState, category?: string) => void;
  currentView: ViewState;
  languageProp: {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: any;
  };
}

export const Navbar: React.FC<NavbarProps> = ({ onNavigate, currentView, languageProp }) => {
  const { language, setLanguage, t } = languageProp;
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [mobileDropdownOpen, setMobileDropdownOpen] = useState<string | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    if (document.documentElement.classList.contains('dark')) {
      setTheme('dark');
    } else {
      setTheme('light');
    }
  }, []);

  const toggleTheme = (newTheme: 'dark' | 'light') => {
    setTheme(newTheme);
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const contactLinks = [
    { 
      label: 'Facebook', 
      icon: Facebook, 
      href: 'https://www.facebook.com/arfano',
      color: 'group-hover:text-blue-600 dark:group-hover:text-blue-500'
    },
    { 
      label: 'Instagram', 
      icon: Instagram, 
      href: 'https://www.instagram.com/eslamabdalah',
      color: 'group-hover:text-pink-600 dark:group-hover:text-pink-500'
    },
    { 
      label: 'WhatsApp', 
      icon: MessageCircle, 
      href: 'https://wa.me/201000586655',
      color: 'group-hover:text-green-600 dark:group-hover:text-green-500'
    },
    { 
      label: 'Telegram', 
      icon: Send, 
      href: 'https://t.me/+201000586655',
      color: 'group-hover:text-blue-500 dark:group-hover:text-blue-400'
    },
    { 
      label: 'Email', 
      icon: Mail, 
      href: 'mailto:eslammokarab@gmail.com',
      color: 'group-hover:text-red-600 dark:group-hover:text-red-500'
    },
  ];

  const photoTools = [
    {
      label: t.dropdowns.restoration,
      view: 'photo-restoration' as ViewState,
      icon: Wand2,
      description: 'Fix, colorize & edit',
      color: 'text-purple-500'
    },
    {
      label: t.dropdowns.angle,
      view: 'photo-angle' as ViewState,
      icon: Rotate3D,
      description: 'Change perspective',
      color: 'text-blue-500'
    },
    {
      label: t.dropdowns.group,
      view: 'photo-group' as ViewState,
      icon: Users,
      description: 'Merge people into scenes',
      color: 'text-green-500'
    },
    {
      label: t.dropdowns.extract,
      view: 'photo-extract' as ViewState,
      icon: ScanEye,
      description: 'Image to text prompt',
      color: 'text-amber-500'
    },
    {
      label: t.dropdowns.genMe,
      view: 'photo-generate' as ViewState,
      icon: UserCircle2,
      description: 'AI Avatar creation',
      color: 'text-indigo-500'
    }
  ];

  const videoTools = [
    {
      label: t.dropdowns.storyboard,
      view: 'video-storyboard' as ViewState,
      icon: Clapperboard,
      description: 'Script to visual storyboard',
      color: 'text-red-500'
    },
    {
      label: 'Grok Imagine',
      href: 'https://grok.com/imagine',
      icon: ExternalLink,
      description: 'External Tool',
      color: 'text-gray-500'
    },
    {
      label: 'Meta AI Media',
      href: 'https://www.meta.ai/media',
      icon: PlayCircle,
      description: 'External Tool',
      color: 'text-blue-400'
    },
    {
      label: 'MovieFlow AI',
      href: 'https://movieflow.ai/signup?inviteCode=6V2G47X7',
      icon: Film,
      description: 'External Tool',
      color: 'text-purple-400'
    }
  ];

  const usefulTools = [
    {
      label: t.dropdowns.chat,
      view: 'useful-tools' as ViewState,
      categoryFilter: 'chat',
      icon: MessageSquare,
      description: 'ChatGPT, Claude, etc.',
      color: 'text-blue-500'
    },
    {
      label: t.dropdowns.image,
      view: 'useful-tools' as ViewState,
      categoryFilter: 'image',
      icon: ImageIcon,
      description: 'MidJourney, Flux',
      color: 'text-pink-500'
    },
    {
      label: t.dropdowns.video,
      view: 'useful-tools' as ViewState,
      categoryFilter: 'video',
      icon: Video,
      description: 'Sora, Runway, Kling',
      color: 'text-red-500'
    },
    {
      label: t.dropdowns.writing,
      view: 'useful-tools' as ViewState,
      categoryFilter: 'writing',
      icon: PenTool,
      description: 'Jasper, Quillbot',
      color: 'text-emerald-500'
    }
  ];

  const navItems: NavItem[] = [
    { label: t.nav.contact, hasDropdown: true, id: 'contact', dropdownContent: contactLinks },
    { label: t.nav.photoTools, hasDropdown: true, id: 'photo', dropdownContent: photoTools },
    { label: t.nav.videoTools, hasDropdown: true, id: 'video', dropdownContent: videoTools },
    { label: t.nav.usefulTools, hasDropdown: true, id: 'useful', dropdownContent: usefulTools },
    { label: t.nav.about, hasDropdown: false, id: 'about' },
  ];

  const toggleMobileDropdown = (id: string) => {
    if (mobileDropdownOpen === id) {
      setMobileDropdownOpen(null);
    } else {
      setMobileDropdownOpen(id);
    }
  };

  const handleNavigation = (item: any) => {
    if (item.view) {
      onNavigate(item.view, item.categoryFilter);
      setIsMobileMenuOpen(false);
    } else if (item.href && item.href !== '#') {
      window.open(item.href, '_blank');
      setIsMobileMenuOpen(false);
    } else if (item.id === 'about') {
        onNavigate('about');
        setIsMobileMenuOpen(false);
    }
  };

  // SVG Flags
  const UKFlag = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 30" width="20" height="10">
      <clipPath id="t"><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z"/></clipPath>
      <path d="M0,0 v30 h60 v-30 z" fill="#00247d"/>
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6"/>
      <path d="M0,0 L60,30 M60,0 L0,30" clipPath="url(#t)" stroke="#cf142b" strokeWidth="4"/>
      <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10"/>
      <path d="M30,0 v30 M0,15 h60" stroke="#cf142b" strokeWidth="6"/>
    </svg>
  );

  const EgyptFlag = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 30" width="20" height="13">
        <rect width="45" height="30" fill="#fff"/>
        <rect width="45" height="10" y="0" fill="#ce1126"/>
        <rect width="45" height="10" y="20" fill="#000"/>
        <circle cx="22.5" cy="15" r="2" fill="#c09300" />
    </svg>
  );

  const FranceFlag = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 30" width="20" height="13">
      <rect width="45" height="30" fill="#fff"/>
      <rect width="15" height="30" x="0" fill="#002395"/>
      <rect width="15" height="30" x="30" fill="#ed2939"/>
    </svg>
  );


  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 dark:bg-[#050505]/80 backdrop-blur-lg border-b border-gray-200 dark:border-white/5 transition-colors duration-300 h-24">
      <div className="max-w-[1920px] mx-auto px-6 lg:px-10 h-full">
        <div className="flex items-center justify-between h-full">
          {/* Logo Section */}
          <div 
            className={`flex-shrink-0 flex flex-col justify-center items-start cursor-pointer group ${language === 'ar' ? 'ml-8' : 'mr-8'}`}
            onClick={() => onNavigate('home')}
          >
            <h1 className="text-3xl font-heading font-bold tracking-tighter text-black dark:text-white leading-none group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors">
              ESLAM
            </h1>
            <span className="text-[9px] font-sans tracking-[0.5em] text-gray-500 dark:text-gray-400 uppercase ml-0.5">
              AI Kit
            </span>
          </div>

          {/* Desktop Navigation - Strictly Horizontal */}
          <div className="hidden lg:flex items-center justify-end space-x-3 rtl:space-x-reverse">
              {navItems.map((item) => (
                <div key={item.label} className="relative group">
                  <button
                    onClick={() => !item.hasDropdown && onNavigate(item.id as ViewState)}
                    className={`flex items-center text-xs font-bold px-5 py-2.5 rounded-full transition-all uppercase tracking-widest whitespace-nowrap focus:outline-none ${
                      ((item.id === 'photo' && currentView.startsWith('photo')) || 
                       (item.id === 'video' && currentView.startsWith('video')) || 
                       (item.id === 'useful' && currentView === 'useful-tools') ||
                       (item.id === currentView))
                      ? 'bg-black text-white dark:bg-white dark:text-black shadow-md' 
                      : 'text-gray-600 hover:text-black hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-white/5'
                    }`}
                  >
                    {item.label}
                    {item.hasDropdown && (
                      <ChevronDown className="ml-1.5 h-3 w-3 opacity-50 group-hover:opacity-100 transition-all" />
                    )}
                  </button>

                  {/* Dropdown Menu */}
                  {item.hasDropdown && item.dropdownContent && (
                    <div className="absolute left-1/2 transform -translate-x-1/2 rtl:translate-x-1/2 mt-4 w-72 bg-white dark:bg-[#0F0F0F] border border-gray-200 dark:border-white/10 shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 translate-y-4 group-hover:translate-y-0 z-50 rounded-3xl overflow-hidden">
                      <div className="p-3">
                        {item.dropdownContent.map((link: any) => (
                          <button
                            key={link.label}
                            onClick={() => handleNavigation(link)}
                            className="w-full text-left rtl:text-right group/item flex items-start px-5 py-4 hover:bg-gray-50 dark:hover:bg-white/5 transition-all rounded-2xl"
                          >
                            {link.icon && (
                              <link.icon className={`mt-0.5 mr-4 rtl:ml-4 rtl:mr-0 h-5 w-5 ${link.color || 'text-gray-400'} transition-colors`} />
                            )}
                            <div>
                              <span className="block text-sm font-bold text-gray-800 dark:text-gray-200 group-hover/item:text-black dark:group-hover/item:text-white">
                                {link.label}
                              </span>
                              {link.description && (
                                <span className="block text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 uppercase tracking-wide truncate max-w-[160px]">
                                  {link.description}
                                </span>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Divider */}
              <div className="h-8 w-[1px] bg-gray-200 dark:bg-white/10 mx-6"></div>

              {/* Language Switcher */}
              <div className="flex items-center space-x-2 rtl:space-x-reverse bg-gray-50 dark:bg-white/5 rounded-full p-1.5 border border-gray-200 dark:border-white/10">
                  <button 
                    onClick={() => setLanguage('en')} 
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${language === 'en' ? 'bg-white shadow-sm ring-1 ring-black/5' : 'opacity-50 hover:opacity-100'}`}
                    title="English"
                  >
                     <UKFlag />
                  </button>
                  <button 
                    onClick={() => setLanguage('fr')} 
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${language === 'fr' ? 'bg-white shadow-sm ring-1 ring-black/5' : 'opacity-50 hover:opacity-100'}`}
                    title="Français"
                  >
                     <FranceFlag />
                  </button>
                  <button 
                    onClick={() => setLanguage('ar')} 
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${language === 'ar' ? 'bg-white shadow-sm ring-1 ring-black/5' : 'opacity-50 hover:opacity-100'}`}
                    title="العربية"
                  >
                     <EgyptFlag />
                  </button>
              </div>

              {/* Theme Buttons (Icons) */}
              <div className="flex items-center space-x-2 rtl:space-x-reverse bg-gray-100 dark:bg-white/5 rounded-full p-1 border border-gray-200 dark:border-white/10 ml-4 rtl:mr-4">
                <button 
                  onClick={() => toggleTheme('dark')}
                  className={`p-2 rounded-full transition-all duration-300 flex items-center justify-center ${theme === 'dark' ? 'bg-black text-white shadow-sm' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'}`}
                  title={t.nav.dark}
                >
                  <Moon size={14} strokeWidth={2.5} />
                </button>
                <button 
                  onClick={() => toggleTheme('light')}
                  className={`p-2 rounded-full transition-all duration-300 flex items-center justify-center ${theme === 'light' ? 'bg-white text-black shadow-sm' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'}`}
                  title={t.nav.light}
                >
                  <Sun size={14} strokeWidth={2.5} />
                </button>
              </div>
          </div>

          {/* Mobile Menu Button */}
          <div className="-mr-2 flex lg:hidden">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="inline-flex items-center justify-center p-3 rounded-lg text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none"
            >
              {isMobileMenuOpen ? (
                <X className="block h-7 w-7" />
              ) : (
                <Menu className="block h-7 w-7" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="lg:hidden bg-white dark:bg-black border-b border-gray-200 dark:border-white/10 max-h-[calc(100vh-96px)] overflow-y-auto absolute top-24 left-0 right-0 shadow-xl z-50">
          <div className="px-4 pt-4 pb-6 space-y-2">
            {navItems.map((item) => (
              <div key={item.label}>
                <button
                  onClick={() => {
                      if (item.hasDropdown) {
                          toggleMobileDropdown(item.id);
                      } else {
                          onNavigate(item.id as ViewState);
                          setIsMobileMenuOpen(false);
                      }
                  }}
                  className="w-full flex items-center justify-between px-4 py-4 text-base font-bold text-gray-700 dark:text-gray-300 hover:text-black dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-900 rounded-xl uppercase tracking-wide"
                >
                  {item.label}
                  {item.hasDropdown && (
                    <ChevronDown 
                      className={`h-5 w-5 transition-transform duration-300 ${mobileDropdownOpen === item.id ? 'rotate-180' : ''}`} 
                    />
                  )}
                </button>
                
                {/* Mobile Dropdown Content */}
                {item.hasDropdown && item.dropdownContent && mobileDropdownOpen === item.id && (
                   <div className="bg-gray-50 dark:bg-gray-900/50 px-6 py-3 space-y-2 rounded-b-xl mx-2">
                     {item.dropdownContent.map((link: any) => (
                       <button
                         key={link.label}
                         onClick={() => handleNavigation(link)}
                         className="w-full flex items-center py-4 text-sm text-left rtl:text-right text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white border-b border-gray-200 dark:border-white/5 last:border-0"
                       >
                         {link.icon && <link.icon className="mr-4 rtl:ml-4 rtl:mr-0 h-5 w-5" />}
                         {link.label}
                       </button>
                     ))}
                   </div>
                )}
              </div>
            ))}

             {/* Mobile Language Switcher */}
            <div className="pt-8 pb-4 flex justify-center space-x-8 border-t border-gray-200 dark:border-white/10 mt-4">
                <button onClick={() => setLanguage('en')} className={`flex flex-col items-center ${language === 'en' ? 'opacity-100' : 'opacity-50'}`}>
                  <div className="w-10 h-6 overflow-hidden shadow-md rounded"><UKFlag /></div>
                  <span className="text-[11px] mt-2 font-bold">EN</span>
                </button>
                <button onClick={() => setLanguage('fr')} className={`flex flex-col items-center ${language === 'fr' ? 'opacity-100' : 'opacity-50'}`}>
                  <div className="w-10 h-6 overflow-hidden shadow-md rounded"><FranceFlag /></div>
                  <span className="text-[11px] mt-2 font-bold">FR</span>
                </button>
                 <button onClick={() => setLanguage('ar')} className={`flex flex-col items-center ${language === 'ar' ? 'opacity-100' : 'opacity-50'}`}>
                  <div className="w-10 h-6 overflow-hidden shadow-md rounded"><EgyptFlag /></div>
                  <span className="text-[11px] mt-2 font-bold">AR</span>
                </button>
            </div>
            
            <div className="pt-4 pb-6 flex justify-center space-x-4 px-4">
               <button 
                onClick={() => toggleTheme('dark')}
                className={`flex items-center px-6 py-3 rounded-xl text-sm font-bold uppercase transition-colors ${theme === 'dark' ? 'bg-black text-white' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}
               >
                <Moon size={16} className="mr-3" /> {t.nav.dark}
              </button>
              <button 
                onClick={() => toggleTheme('light')}
                className={`flex items-center px-6 py-3 rounded-xl text-sm font-bold uppercase transition-colors ${theme === 'light' ? 'bg-gray-200 text-black border border-gray-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}
              >
                <Sun size={16} className="mr-3" /> {t.nav.light}
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};