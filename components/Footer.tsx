import React from 'react';

interface FooterProps {
  languageProp?: any;
}

export const Footer: React.FC<FooterProps> = ({ languageProp }) => {
  const t = languageProp?.t;
  
  return (
    <footer className="bg-gray-50 dark:bg-black border-t border-gray-200 dark:border-white/10 py-6 transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center text-xs text-gray-500 dark:text-gray-500">
        <div className="flex items-center space-x-2 mb-4 md:mb-0">
           <span className="uppercase tracking-widest font-bold text-black dark:text-white">Eslam AI Kit</span>
        </div>
        <div className="flex flex-col items-center md:items-end rtl:md:items-start">
          <p className="mb-1">
            &copy; {new Date().getFullYear()} {t?.footer.rights}
          </p>
          <p className="font-bold text-gray-600 dark:text-gray-400 tracking-wide">
            {t?.footer.concept} <span className="text-black dark:text-white">Eslam</span>
          </p>
        </div>
      </div>
    </footer>
  );
};