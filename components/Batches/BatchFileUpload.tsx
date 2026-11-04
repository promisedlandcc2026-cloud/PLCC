
import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, X, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';

interface BatchFileUploadProps {
  onSuccess: (metadata: { fileName: string; size: number; batchId?: string }) => void;
}

const BatchFileUpload: React.FC<BatchFileUploadProps> = ({ onSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (selected: File) => {
    setError(null);
    if (selected.size === 0) {
      setError("File is empty (0 bytes).");
      return false;
    }
    const ext = selected.name.split('.').pop()?.toLowerCase();
    if (!['csv', 'xlsx'].includes(ext || '')) {
      setError("Invalid type. Only .csv and .xlsx allowed.");
      return false;
    }
    return true;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected && validateFile(selected)) {
      setFile(selected);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setIsUploading(true);
    setProgress(0);

    // Simulated progress logic
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) {
          clearInterval(interval);
          return 90;
        }
        return prev + 15;
      });
    }, 200);

    try {
      // Mock API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      setProgress(100);
      setTimeout(() => {
        setIsUploading(false);
        onSuccess({ fileName: file.name, size: file.size, batchId: 'B-' + Math.floor(Math.random()*1000) });
      }, 500);
    } catch (err) {
      setError("Upload failed. Try again.");
      setIsUploading(false);
    } finally {
      clearInterval(interval);
    }
  };

  const reset = () => {
    setFile(null);
    setError(null);
    setProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="w-full space-y-4">
      <div 
        onClick={() => !isUploading && fileInputRef.current?.click()}
        className={`border-[3px] border-dashed rounded-[2.5rem] p-8 md:p-12 text-center transition-all cursor-pointer group 
          ${file ? 'border-green-500 bg-green-50/10' : 'border-gray-100 hover:border-gold/30 hover:bg-gold-cream/5'}
          ${error ? 'border-red-400 bg-red-50/30' : ''}`}
      >
        <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".csv,.xlsx" />
        
        {!file ? (
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl bg-burgundy/5 text-burgundy flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <UploadCloud size={32} />
            </div>
            <p className="text-sm font-bold text-[#0d1a14]">Select Batch File (.csv, .xlsx)</p>
            <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">Tap to browse your device</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between text-left gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-gold shadow-sm shrink-0 border border-gold/10">
                  <FileText size={24} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-black text-[#0d1a14] truncate">{file.name}</p>
                  <p className="text-[10px] text-gray-400 font-bold uppercase">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              </div>
              {!isUploading && (
                <button onClick={(e) => { e.stopPropagation(); reset(); }} className="p-3 text-gray-300 hover:text-red-500 transition-colors bg-white rounded-full shadow-sm min-h-[44px] min-w-[44px]">
                  <X size={20} />
                </button>
              )}
            </div>

            {isUploading && (
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-black text-gold uppercase tracking-widest">
                  <span>Uploading</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden shadow-inner">
                  <div className="h-full bg-gold transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 text-red-600 rounded-2xl border border-red-100 animate-in fade-in zoom-in-95">
          <AlertCircle size={18} />
          <p className="text-xs font-bold">{error}</p>
        </div>
      )}

      {file && !isUploading && progress < 100 && (
        <button 
          onClick={handleUpload}
          className="w-full py-4 bg-burgundy text-gold font-black uppercase text-xs tracking-widest rounded-2xl shadow-xl shadow-burgundy/20 hover:bg-burgundy-dark transition-all active:scale-95 min-h-[44px]"
        >
          Begin Processing
        </button>
      )}
    </div>
  );
};

export default BatchFileUpload;
