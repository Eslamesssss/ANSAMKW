import React, { useState, useEffect } from 'react';
import { ExternalLink, Search, MessageSquare, Image as ImageIcon, Video, Mic, PenTool, GraduationCap, Star } from 'lucide-react';

interface Tool {
  name: string;
  url: string;
  description: string;
  price: string;
  category: string;
}

interface UsefulToolsProps {
  initialCategory?: string;
}

export const UsefulTools: React.FC<UsefulToolsProps> = ({ initialCategory = 'all' }) => {
  const [activeCategory, setActiveCategory] = useState(initialCategory);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (initialCategory) setActiveCategory(initialCategory);
  }, [initialCategory]);

  const tools: Tool[] = [
    // Chat & LLMs
    { name: 'Qwen 3', url: 'https://qwen.ai/', description: "Alibaba Cloud's latest family of large language models with hybrid reasoning.", price: 'Freemium', category: 'chat' },
    { name: 'Meta AI', url: 'https://www.meta.ai/', description: 'Conversational AI assistant integrated across Meta platforms.', price: 'Free', category: 'chat' },
    { name: 'GPT-5.1 OpenAI', url: 'https://openai.com/', description: 'Advanced LLM powering ChatGPT with improved reasoning.', price: 'Freemium', category: 'chat' },
    { name: 'Microsoft Copilot', url: 'https://copilot.microsoft.com/', description: 'AI productivity assistant streamlining workflows.', price: 'Freemium', category: 'chat' },
    { name: 'DeepSeek-R1', url: 'https://www.deepseek.com/', description: 'Open-source model designed for advanced reasoning and math.', price: 'Freemium', category: 'chat' },
    { name: 'Globe Explorer AI', url: 'https://explorer.globe.engineer/', description: 'Visual knowledge exploration engine.', price: 'Freemium', category: 'chat' },

    // Image Generation
    { name: 'MidJourney V7', url: 'https://www.midjourney.com/', description: 'Leading generative AI for artistic, high-fidelity images.', price: 'Paid', category: 'image' },
    { name: 'Leonardo AI', url: 'https://leonardo.ai/', description: 'Production-quality asset generation platform.', price: 'Freemium', category: 'image' },
    { name: 'Ideogram 3.0', url: 'https://ideogram.ai/', description: 'AI image generator specializing in typography and layout.', price: 'Freemium', category: 'image' },
    { name: 'FLUX.1', url: 'https://bfl.ai/', description: 'State-of-the-art open weights text-to-image model.', price: 'Paid', category: 'image' },
    { name: 'Imagen 4', url: 'https://deepmind.google/models/imagen/', description: "Google's photorealistic text-to-image diffusion model.", price: 'Freemium', category: 'image' },
    { name: 'Adobe Firefly 3', url: 'https://www.adobe.com/products/firefly.html', description: 'Creative generative AI for Photoshop and design workflows.', price: 'Freemium', category: 'image' },
    { name: 'Stable Diffusion 3.5', url: 'https://stability.ai/', description: 'Advanced multimodal diffusion transformer model.', price: 'Freemium', category: 'image' },
    { name: 'Freepik', url: 'https://www.freepik.com/', description: 'Creative platform with AI tools and vast stock assets.', price: 'Freemium', category: 'image' },
    { name: 'Pixazo', url: 'https://www.pixazo.ai/', description: 'Comprehensive tool for editing images, logos, and animations.', price: 'Freemium', category: 'image' },
    { name: 'Higgsfield FaceSwap', url: 'https://higgsfield.ai/app/face-swap', description: 'Seamlessly integrate faces into images/videos.', price: 'Freemium', category: 'image' },
    { name: 'Reve Image', url: 'https://reve.com/', description: 'Generate and edit images using natural language.', price: 'Freemium', category: 'image' },
    { name: 'Seedream 4.0', url: 'https://seed.bytedance.com/en/seedream4_0', description: 'ByteDance image creation model.', price: 'Freemium', category: 'image' },
    { name: 'Anifun AI', url: 'https://anifun.ai/', description: 'Specialized platform for high-quality anime art.', price: 'Freemium', category: 'image' },

    // Video Generation
    { name: 'Sora 2', url: 'https://openai.com/index/sora-2/', description: 'Advanced model generating realistic imaginative videos.', price: 'Freemium', category: 'video' },
    { name: 'Veo 3.1', url: 'https://deepmind.google/models/veo/', description: "Google's cinematic 1080p video generation model.", price: 'Paid', category: 'video' },
    { name: 'Kling 2.1', url: 'https://klingai.com/global/', description: 'High-quality realistic video from text/image.', price: 'Freemium', category: 'video' },
    { name: 'Runway Gen-4', url: 'https://runwayml.com/', description: 'Consistent, controllable video clips for creatives.', price: 'Freemium', category: 'video' },
    { name: 'Luma Dream Machine', url: 'https://lumalabs.ai/', description: 'Fast, high-quality realistic video generation.', price: 'Freemium', category: 'video' },
    { name: 'Hunyuan Video', url: 'https://aivideo.hunyuan.tencent.com/', description: "Tencent's open-source video generation model.", price: 'Freemium', category: 'video' },
    { name: 'Hailuo AI (Video)', url: 'https://hailuoai.video/', description: 'Multi-modal generator for dynamic sequences.', price: 'Freemium', category: 'video' },
    { name: 'InVideo', url: 'https://invideo.io/', description: 'Transform ideas into publish-ready videos.', price: 'Freemium', category: 'video' },
    { name: 'Wan2.5', url: 'https://www.wan-ai.co/', description: 'Transforms text/image prompts into stunning video.', price: 'Freemium', category: 'video' },
    { name: 'Keevx', url: 'https://www.keevx.com/', description: 'Uses digital avatars to generate studio-quality videos.', price: 'Freemium', category: 'video' },
    { name: 'LongCat Video', url: 'https://longcatvideo.art/', description: 'Generates coherent, minutes-long video.', price: 'Freemium', category: 'video' },
    { name: 'Deevid AI', url: 'https://deevid.ai/', description: 'Create high-quality videos from text.', price: 'Freemium', category: 'video' },
    { name: 'Wondershare Filmora', url: 'https://filmora.wondershare.com/', description: 'Video editor with AI features.', price: 'Freemium', category: 'video' },

    // Audio & Speech
    { name: 'ElevenLabs', url: 'https://elevenlabs.io/', description: 'Leading AI voice generator and text-to-speech.', price: 'Freemium', category: 'audio' },
    { name: 'Murf.AI', url: 'https://murf.ai/', description: 'Studio-quality AI voiceovers.', price: 'Freemium', category: 'audio' },
    { name: 'Uberduck', url: 'https://www.uberduck.ai/', description: 'Voice cloning and AI music generation.', price: 'Freemium', category: 'audio' },
    { name: 'Play HT', url: 'https://play.ht/', description: 'Ultra-realistic text-to-speech voices.', price: 'Freemium', category: 'audio' },
    { name: 'OpenVoice AI', url: 'https://research.myshell.ai/open-voice', description: 'Versatile instant voice cloning model.', price: 'Free', category: 'audio' },
    { name: 'Hailuo AI Audio', url: 'https://hailuoai.com/audio/doc/landing-page.html', description: 'TTS and voice cloning tool.', price: 'Freemium', category: 'audio' },
    { name: 'FreeTTS', url: 'https://freetts.com/', description: 'Free online text-to-speech converter.', price: 'Freemium', category: 'audio' },
    { name: 'Sandbar Stream Ring', url: 'https://www.sandbar.com/stream', description: 'Wearable for capturing voice notes.', price: 'Freemium', category: 'audio' },
    { name: 'Audiobox (Meta)', url: 'https://audiobox.metademolab.com/', description: 'Research model for audio generation.', price: 'Research', category: 'audio' },

    // Writing & SEO
    { name: 'Jasper', url: 'https://www.jasper.ai/', description: 'AI marketing platform for enterprise content.', price: 'Paid', category: 'writing' },
    { name: 'QuillBot', url: 'https://quillbot.com/', description: 'Paraphrasing and grammar checking tool.', price: 'Freemium', category: 'writing' },
    { name: 'Rytr', url: 'https://rytr.me/', description: 'Writing assistant for high-quality content.', price: 'Freemium', category: 'writing' },
    { name: 'WriteSonic', url: 'https://writesonic.com/', description: 'Platform for scaling content creation.', price: 'Freemium', category: 'writing' },
    { name: 'Semrush SEO', url: 'https://www.semrush.com/', description: 'Comprehensive suite for SEO and marketing.', price: 'Freemium', category: 'writing' },
    { name: 'HubSpot Writer', url: 'https://www.hubspot.com/products/cms/ai-content-writer', description: 'Ideate and create content for CMS.', price: 'Freemium', category: 'writing' },
    { name: 'DeepL', url: 'https://www.deepl.com/', description: 'Highly accurate neural machine translation.', price: 'Freemium', category: 'writing' },
    { name: 'LanguageTool', url: 'https://languagetool.org/', description: 'Grammar, style, and spell checker.', price: 'Freemium', category: 'writing' },
    { name: 'Undetectable AI', url: 'https://undetectable.ai/', description: 'Rewrites content to bypass AI detection.', price: 'Freemium', category: 'writing' },
    { name: 'GPTZero', url: 'https://gptzero.me/', description: 'Detects AI-generated text.', price: 'Freemium', category: 'writing' },
    { name: 'AI Prompt Optimizer', url: 'https://prompt-optimizer.io/', description: 'Refines prompts for better LLM results.', price: 'Free', category: 'writing' },

    // Education & Productivity
    { name: 'Coursera', url: 'https://www.coursera.org/', description: 'Global online learning platform.', price: 'Freemium', category: 'education' },
    { name: 'Quizlet', url: 'https://quizlet.com/', description: 'AI-powered study tools and flashcards.', price: 'Freemium', category: 'education' },
    { name: 'FireFlies', url: 'https://fireflies.ai/', description: 'Meeting assistant that records and transcribes.', price: 'Freemium', category: 'education' },
    { name: 'Mexty', url: 'https://mexty.ai/', description: 'Helps educators create interactive courses.', price: 'Freemium', category: 'education' },
    { name: 'Liner AI', url: 'https://liner.com/', description: 'Search engine/research tool for students.', price: 'Freemium', category: 'education' },
    { name: 'Unstuck AI', url: 'https://unstuckstudy.com/', description: 'Study assistant for homework help.', price: 'Freemium', category: 'education' },
  ];

  const categories = [
    { id: 'all', label: 'All Tools', icon: Star },
    { id: 'chat', label: 'Chat & LLMs', icon: MessageSquare },
    { id: 'image', label: 'Image Gen', icon: ImageIcon },
    { id: 'video', label: 'Video Tools', icon: Video },
    { id: 'audio', label: 'Audio & Speech', icon: Mic },
    { id: 'writing', label: 'Writing & SEO', icon: PenTool },
    { id: 'education', label: 'Education', icon: GraduationCap },
  ];

  const filteredTools = tools.filter(tool => {
    const matchesCategory = activeCategory === 'all' || tool.category === activeCategory;
    const matchesSearch = tool.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          tool.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 pt-32 pb-20 min-h-screen">
      {/* Header */}
      <div className="text-center mb-16">
        <h2 className="text-4xl md:text-6xl font-heading font-bold uppercase tracking-tight mb-6">
          Useful <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">AI Tools</span>
        </h2>
        <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto text-lg">
          A curated directory of the best AI resources for creators, developers, and businesses.
        </p>
      </div>

      {/* Controls */}
      <div className="mb-12 space-y-8">
        {/* Search */}
        <div className="max-w-xl mx-auto relative">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input 
            type="text" 
            placeholder="Search tools (e.g. 'Video', 'MidJourney')..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-6 py-4 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-full shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>

        {/* Category Tabs */}
        <div className="flex flex-wrap justify-center gap-3">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex items-center px-6 py-3 rounded-full text-sm font-bold uppercase tracking-wide transition-all transform hover:scale-105 ${
                activeCategory === cat.id
                  ? 'bg-black dark:bg-white text-white dark:text-black shadow-lg'
                  : 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10'
              }`}
            >
              <cat.icon size={16} className="mr-2" />
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tools Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTools.length > 0 ? (
          filteredTools.map((tool, idx) => (
            <div key={idx} className="group bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl p-6 hover:shadow-xl hover:border-blue-500/30 transition-all duration-300 flex flex-col">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 rounded-xl bg-gray-50 dark:bg-white/10 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-colors">
                  {tool.category === 'chat' && <MessageSquare size={24} className="text-blue-500" />}
                  {tool.category === 'image' && <ImageIcon size={24} className="text-pink-500" />}
                  {tool.category === 'video' && <Video size={24} className="text-red-500" />}
                  {tool.category === 'audio' && <Mic size={24} className="text-yellow-500" />}
                  {tool.category === 'writing' && <PenTool size={24} className="text-emerald-500" />}
                  {tool.category === 'education' && <GraduationCap size={24} className="text-indigo-500" />}
                </div>
                <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded border ${
                  tool.price === 'Free' ? 'bg-green-50 text-green-600 border-green-200' :
                  tool.price === 'Paid' ? 'bg-red-50 text-red-600 border-red-200' :
                  'bg-gray-50 text-gray-600 border-gray-200'
                }`}>
                  {tool.price}
                </span>
              </div>
              
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 group-hover:text-blue-500 transition-colors">
                {tool.name}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed flex-1 mb-6">
                {tool.description}
              </p>
              
              <a 
                href={tool.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center justify-center w-full py-3 bg-gray-50 dark:bg-white/10 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black rounded-lg font-bold text-xs uppercase tracking-widest transition-all group/btn"
              >
                Visit Site <ExternalLink size={14} className="ml-2 group-hover/btn:translate-x-1 transition-transform" />
              </a>
            </div>
          ))
        ) : (
          <div className="col-span-full text-center py-20">
             <p className="text-gray-500 text-lg">No tools found matching your search.</p>
             <button onClick={() => {setSearchQuery(''); setActiveCategory('all')}} className="mt-4 text-blue-500 underline">Reset Filters</button>
          </div>
        )}
      </div>
    </div>
  );
};