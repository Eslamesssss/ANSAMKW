import React, { useCallback, useState, useEffect } from 'react';
import { Upload, X, Image as ImageIcon } from 'lucide-react';

interface FileUploaderProps {
  label: string;
  onFileSelect: (file: File | null) => void;
  selectedFile?: File | null;
  accept?: string;
  className?: string;
}

export const FileUploader: React.FC<FileUploaderProps> = ({ 
  label, 
  onFileSelect, 
  selectedFile, 
  accept = "image/*",
  className = ""
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Sync internal preview with external selectedFile prop if it changes
  useEffect(() => {
    if (selectedFile === null) {
      setPreviewUrl(null);
    } else if (selectedFile) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(selectedFile);
    }
  }, [selectedFile]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (file: File) => {
    onFileSelect(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const clearFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFileSelect(null);
    setPreviewUrl(null);
  };

  return (
    <div className={`w-full ${className}`}>
      <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2">
        {label}
      </label>
      
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => document.getElementById(`file-upload-${label}`)?.click()}
        className={`
          relative h-64 border-2 border-dashed rounded-lg transition-all duration-300 cursor-pointer flex flex-col items-center justify-center
          ${isDragging 
            ? 'border-black dark:border-white bg-gray-100 dark:bg-white/10' 
            : 'border-gray-300 dark:border-white/20 hover:border-gray-400 dark:hover:border-white/40 bg-gray-50 dark:bg-black/40'}
        `}
      >
        <input
          id={`file-upload-${label}`}
          type="file"
          accept={accept}
          className="hidden"
          onChange={handleFileInput}
        />

        {previewUrl ? (
          <div className="relative w-full h-full overflow-hidden rounded-lg group">
            <img src={previewUrl} alt="Preview" className="w-full h-full object-contain p-2" />
            <button 
              onClick={clearFile}
              className="absolute top-2 right-2 p-1 bg-black/70 text-white rounded-full hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <div className="text-center p-6">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-gray-200 dark:bg-white/10 flex items-center justify-center text-gray-400 dark:text-white/50">
              <Upload size={24} />
            </div>
            <p className="text-sm font-bold text-gray-700 dark:text-gray-300">
              Click or drag image here
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
              JPG, PNG, WEBP supported
            </p>
          </div>
        )}
      </div>
    </div>
  );
};