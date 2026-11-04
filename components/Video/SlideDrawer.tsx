
import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface SlideDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

const SlideDrawer: React.FC<SlideDrawerProps> = ({ isOpen, onClose, title, children }) => {
  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Close on ESC key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div 
        className={`fixed inset-0 bg-burgundy/20 backdrop-blur-sm z-[110] transition-opacity duration-300 lg:hidden ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <aside className={`
        fixed inset-y-0 left-0 z-[120] w-[85%] max-w-[340px] bg-white border-r border-gray-100 
        transition-transform duration-500 cubic-bezier(0.4, 0, 0.2, 1) shadow-[0_0_100px_rgba(29, 55, 44,0.1)] flex flex-col lg:hidden
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-8 border-b border-gray-100 flex items-center justify-between shrink-0 bg-gold-cream/20">
          <div>
            <h2 className="text-xl font-black tracking-tight text-[#0d1a14]">{title}</h2>
            <p className="text-[10px] text-gold font-bold uppercase tracking-[0.3em] mt-1">Ministry Library</p>
          </div>
          <button 
            onClick={onClose} 
            className="p-3 -mr-2 text-gray-300 hover:text-burgundy transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center bg-white rounded-xl shadow-sm border border-gray-100"
            aria-label="Close menu"
          >
            <X size={24} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar overscroll-contain bg-white">
          {children}
        </div>
      </aside>
    </>
  );
};

export default SlideDrawer;
