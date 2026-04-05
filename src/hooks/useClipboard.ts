/**
 * useClipboard Hook
 * 
 * Provides clipboard copy functionality with success feedback.
 */

import { useState, useCallback } from 'react';

interface UseClipboardReturn {
  copied: boolean;
  copy: (text: string) => Promise<void>;
  error: string | null;
}

export function useClipboard(timeout: number = 2000): UseClipboardReturn {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copy = useCallback(async (text: string): Promise<void> => {
    try {
      setError(null);
      
      if (navigator.clipboard && window.isSecureContext) {
        // Use modern Clipboard API
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        
        if (!successful) {
          throw new Error('Copy command failed');
        }
      }
      
      setCopied(true);
      setTimeout(() => setCopied(false), timeout);
    } catch (err) {
      setError('Failed to copy to clipboard');
      setCopied(false);
    }
  }, [timeout]);

  return { copied, copy, error };
}

export default useClipboard;
