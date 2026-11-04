import React from 'react';

interface ResponsivePageProps {
  children: React.ReactNode;
  className?: string;
  maxWidth?: string;
}

/**
 * Standard container for all feature pages.
 * Enforces horizontal padding and max-width boundaries.
 */
const ResponsivePage: React.FC<ResponsivePageProps> = ({ 
  children, 
  className = "", 
  maxWidth = "max-w-7xl" 
}) => {
  return (
    <div className={`w-full min-w-0 px-4 md:px-8 py-6 md:py-10 animate-in fade-in duration-500 ${className}`}>
      <div className={`${maxWidth} mx-auto w-full flex flex-col gap-6 md:gap-8`}>
        {children}
      </div>
    </div>
  );
};

export default ResponsivePage;