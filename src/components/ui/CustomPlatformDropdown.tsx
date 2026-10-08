import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check } from 'lucide-react';

export interface DropdownOption {
  value: string;
  label: string;
  icon?: React.ReactNode | string;
  badge?: string | number;
  description?: string;
}

interface CustomPlatformDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: (DropdownOption | string)[];
  placeholder?: string;
  label?: string;
  icon?: React.ReactNode;
  variant?: 'default' | 'gold' | 'emerald';
  className?: string;
  dropdownClassName?: string;
  disabled?: boolean;
}

export const CustomPlatformDropdown: React.FC<CustomPlatformDropdownProps> = ({
  value,
  onChange,
  options,
  placeholder = 'Select option',
  label,
  icon,
  variant = 'default',
  className = '',
  dropdownClassName = '',
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Normalize options
  const normalizedOptions: DropdownOption[] = options.map(opt => {
    if (typeof opt === 'string') {
      return { value: opt, label: opt };
    }
    return opt;
  });

  const selectedOption = normalizedOptions.find(o => o.value.toLowerCase() === value?.toLowerCase()) 
    || normalizedOptions.find(o => o.value === value)
    || (value ? { value, label: value } : null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const getVariantStyles = () => {
    switch (variant) {
      case 'gold':
        return {
          btn: 'border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 hover:border-amber-500/60',
          activeItem: 'bg-amber-500/20 text-amber-900 dark:text-amber-300 font-black',
          check: 'text-amber-500'
        };
      case 'emerald':
        return {
          btn: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200 hover:border-emerald-500/60',
          activeItem: 'bg-emerald-500/20 text-emerald-900 dark:text-emerald-300 font-black',
          check: 'text-emerald-500'
        };
      default:
        return {
          btn: 'border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-800 dark:text-white hover:border-amber-500/50',
          activeItem: 'bg-gradient-to-r from-amber-500/15 to-rose-500/15 text-slate-900 dark:text-white font-black border border-amber-500/30',
          check: 'text-amber-500'
        };
    }
  };

  const vStyles = getVariantStyles();

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {label && (
        <label className="block text-[10px] font-black uppercase text-slate-500 dark:text-muted-foreground mb-1 ml-1 tracking-wider">
          {label}
        </label>
      )}

      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-2xl border text-xs font-bold transition-all backdrop-blur-md shadow-2xs cursor-pointer ${vStyles.btn} ${disabled ? 'opacity-50 cursor-not-allowed' : 'active:scale-[0.99]'}`}
      >
        <div className="flex items-center gap-2 truncate">
          {icon && <span className="shrink-0">{icon}</span>}
          {selectedOption?.icon && typeof selectedOption.icon === 'string' ? (
            <span className="shrink-0">{selectedOption.icon}</span>
          ) : selectedOption?.icon}
          <span className="truncate">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          {selectedOption?.badge !== undefined && (
            <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300">
              {selectedOption.badge}
            </span>
          )}
        </div>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className={`absolute z-[150] left-0 right-0 top-full mt-2 max-h-72 overflow-y-auto bg-white dark:bg-[#0c101b] border border-slate-200 dark:border-white/15 rounded-2xl shadow-2xl p-1.5 space-y-1 backdrop-blur-2xl ring-1 ring-black/10 custom-scrollbar ${dropdownClassName}`}
          >
            {normalizedOptions.map((option) => {
              const isSelected = selectedOption?.value.toLowerCase() === option.value.toLowerCase();
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left text-xs transition-all cursor-pointer ${
                    isSelected
                      ? vStyles.activeItem
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    {option.icon && typeof option.icon === 'string' ? (
                      <span className="text-sm shrink-0">{option.icon}</span>
                    ) : option.icon}
                    <div className="truncate">
                      <p className={`truncate ${isSelected ? 'font-black' : 'font-semibold'}`}>{option.label}</p>
                      {option.description && (
                        <p className="text-[9px] text-slate-400 dark:text-muted-foreground truncate">{option.description}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {option.badge !== undefined && (
                      <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-400">
                        {option.badge}
                      </span>
                    )}
                    {isSelected && <Check className={`w-3.5 h-3.5 ${vStyles.check}`} />}
                  </div>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
