import React, { useState } from 'react';
import { Key, ExternalLink } from 'lucide-react';
import { setStoredApiKey } from '../services/geminiService';

interface ApiKeyModalProps {
  onKeySet: () => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ onKeySet }) => {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = key.trim();
    if (!trimmed) {
      setError('Please enter your API key.');
      return;
    }
    setStoredApiKey(trimmed);
    onKeySet();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 w-full max-w-md shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-blue-500/20 rounded-xl">
            <Key className="w-6 h-6 text-blue-400" />
          </div>
          <h2 className="text-xl font-bold text-white">Gemini API Key</h2>
        </div>

        <p className="text-gray-400 text-sm mb-6 leading-relaxed">
          This app uses Google Gemini AI. Enter your API key to get started.
          Your key is stored locally in your browser only.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              value={key}
              onChange={e => { setKey(e.target.value); setError(''); }}
              placeholder="AIzaSy..."
              className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
            {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            Start Using App
          </button>
        </form>

        <a
          href="https://aistudio.google.com/apikey"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 mt-4 text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          Get a free API key from Google AI Studio
        </a>
      </div>
    </div>
  );
};
