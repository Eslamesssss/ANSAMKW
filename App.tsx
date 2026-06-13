import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { Footer } from './components/Footer';
import { ApiKeyModal } from './components/ApiKeyModal';
import { getStoredApiKey } from './services/geminiService';
import { PhotoRestoration } from './components/photo-tools/PhotoRestoration';
import { ImageAngle } from './components/photo-tools/ImageAngle';
import { GroupComposition } from './components/photo-tools/GroupComposition';
import { PromptExtractor } from './components/photo-tools/PromptExtractor';
import { GenerateMe } from './components/photo-tools/GenerateMe';
import { StoryboardCreator } from './components/video-tools/StoryboardCreator';
import { ProductPhotography } from './components/agency-tools/ProductPhotography';
import { SwotAnalysis } from './components/agency-tools/SwotAnalysis';
import { CgiGenerator } from './components/agency-tools/CgiGenerator';
import { MarketingStrategy } from './components/agency-tools/MarketingStrategy';
import { AgencyHub } from './components/AgencyHub';
import { CreativeHub } from './components/CreativeHub';
import { LogoGenerator } from './components/creative-tools/LogoGenerator';
import { BrandIdentity } from './components/creative-tools/BrandIdentity';
import { FilmmakerHub } from './components/FilmmakerHub';
import { FilmStoryboardPro } from './components/filmmaker-tools/FilmStoryboardPro';
import { ScriptToScreen } from './components/filmmaker-tools/ScriptToScreen';
import { GlobalNovelist } from './components/filmmaker-tools/GlobalNovelist';
import { UsefulTools } from './components/UsefulTools';
import { AboutMe } from './components/AboutMe';
import { ViewState } from './types';
import { useLanguage } from './hooks/useLanguage';

function App() {
  const [currentView, setCurrentView] = useState<ViewState>('home');
  const [initialToolCategory, setInitialToolCategory] = useState<string>('all');
  const [hasApiKey, setHasApiKey] = useState<boolean>(!!getStoredApiKey());
  const languageProp = useLanguage();

  const handleNavigate = (view: ViewState, category?: string) => {
    setCurrentView(view);
    if (category) {
      setInitialToolCategory(category);
    }
  };

  const renderView = () => {
    switch (currentView) {
      case 'photo-restoration':
        return <PhotoRestoration />;
      case 'photo-angle':
        return <ImageAngle />;
      case 'photo-group':
        return <GroupComposition />;
      case 'photo-extract':
        return <PromptExtractor />;
      case 'photo-generate':
        return <GenerateMe />;
      case 'video-storyboard':
        return <StoryboardCreator />;
      
      // Agency Tools
      case 'agency-hub':
        return <AgencyHub onNavigate={handleNavigate} />;
      case 'ad-product-photography':
        return <ProductPhotography />;
      case 'ad-swot-analysis':
        return <SwotAnalysis />;
      case 'ad-cgi-generator':
        return <CgiGenerator />;
      case 'ad-marketing-strategy':
        return <MarketingStrategy />;
      
      // Creative Tools
      case 'creative-hub':
        return <CreativeHub onNavigate={handleNavigate} />;
      case 'creative-logo-gen':
        return <LogoGenerator />;
      case 'creative-brand-kit':
        return <BrandIdentity />;

      // Filmmaker Tools
      case 'filmmaker-hub':
        return <FilmmakerHub onNavigate={handleNavigate} />;
      case 'film-storyboard-pro':
        return <FilmStoryboardPro />;
      case 'film-script-writer':
        return <ScriptToScreen />;
      case 'film-novelist':
        return <GlobalNovelist />;

      case 'useful-tools':
        return <UsefulTools initialCategory={initialToolCategory} />;
      case 'about':
        return <AboutMe />;
      case 'home':
      default:
        return <Hero onNavigate={handleNavigate} languageProp={languageProp} />;
    }
  };

  return (
    <main className="min-h-screen flex flex-col bg-white text-gray-900 dark:bg-eslam-black dark:text-white font-sans transition-colors duration-300 selection:bg-black selection:text-white dark:selection:bg-white dark:selection:text-black" dir={languageProp.language === 'ar' ? 'rtl' : 'ltr'}>
      {!hasApiKey && <ApiKeyModal onKeySet={() => setHasApiKey(true)} />}
      <Navbar onNavigate={handleNavigate} currentView={currentView} languageProp={languageProp} />
      
      <div className="flex-grow">
        {renderView()}
      </div>

      <Footer languageProp={languageProp} />
    </main>
  );
}

export default App;