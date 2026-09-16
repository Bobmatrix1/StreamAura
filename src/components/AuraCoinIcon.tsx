import React from 'react';

interface AuraCoinIconProps {
  className?: string;
  imgClassName?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  animated?: boolean;
}

export const AuraCoinIcon: React.FC<AuraCoinIconProps> = ({ 
  className = '', 
  imgClassName = '',
  size = 'md',
  animated = false
}) => {
  const sizeMap: Record<string, string> = {
    xs: 'w-3.5 h-3.5',
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-7 h-7',
    xl: 'w-10 h-10',
  };

  const hasCustomDimensions = className.includes('w-') || className.includes('h-');
  const sizeClass = hasCustomDimensions ? '' : (sizeMap[size] || sizeMap.md);

  return (
    <span 
      className={`inline-flex items-center justify-center shrink-0 rounded-full bg-gradient-to-br from-amber-300 via-amber-500 to-amber-600 p-[1.5px] shadow-sm shadow-amber-500/30 ${sizeClass} ${className} ${animated ? 'transition-transform duration-300 hover:scale-110 hover:rotate-12' : ''}`}
      title="AuraCoin"
    >
      <span className="w-full h-full rounded-full bg-slate-950/90 flex items-center justify-center overflow-hidden p-[1px]">
        <img 
          src="/logo.png" 
          alt="AuraCoin" 
          className={`w-full h-full object-contain scale-110 drop-shadow-[0_0_6px_rgba(245,158,11,0.7)] ${imgClassName}`} 
        />
      </span>
    </span>
  );
};

export default AuraCoinIcon;
