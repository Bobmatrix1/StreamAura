import React, { useState } from 'react';
import { Lock, Globe, ExternalLink, ChevronRight, Check } from 'lucide-react';
import { OFFICIAL_SOCIALS } from './SocialLogos';
import type { ViewType } from '../types';

interface FooterProps {
  onNavigate?: (view: ViewType) => void;
  className?: string;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate, className = '' }) => {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) return;
    setSubscribed(true);
    setEmail('');
    setTimeout(() => setSubscribed(false), 5000);
  };

  const handleNav = (view: ViewType) => {
    if (onNavigate) {
      onNavigate(view);
    } else {
      window.dispatchEvent(new CustomEvent('navigate', { detail: { view } }));
    }
  };

  return (
    <footer className={`max-w-7xl mx-auto px-4 pt-14 border-t border-white/10 text-white ${className}`}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 lg:gap-12 mb-16">
        {/* Brand & Socials Section */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl overflow-hidden p-1 bg-white/5 border border-white/10 flex items-center justify-center">
              <img src="/logo.png" className="w-full h-full object-contain" alt="StreamAura" />
            </div>
            <span className="text-2xl font-black uppercase tracking-tighter gradient-text">StreamAura</span>
          </div>

          <p className="text-xs text-muted-foreground font-medium leading-relaxed max-w-sm">
            The ultimate all-in-one media powerhouse for video downloading, high-bitrate music extraction, and synchronized cinema viewing in absolute luxury.
          </p>

          {/* Official Social Links with Authentic Logos */}
          <div className="space-y-3 pt-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400">
              Official Channels & Community
            </p>
            <div className="flex flex-wrap items-center gap-2.5">
              {OFFICIAL_SOCIALS.map((social) => {
                const IconComponent = social.icon;
                return (
                  <a
                    key={social.id}
                    href={social.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`StreamAura on ${social.name}`}
                    title={`${social.name} (${social.handle})`}
                    className={`w-9 h-9 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-white/80 transition-all duration-300 active:scale-95 group relative ${social.hoverClasses}`}
                  >
                    <IconComponent className="w-4 h-4 transition-transform group-hover:scale-110" />
                    
                    {/* Tooltip */}
                    <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-md bg-black/90 border border-white/15 text-[9px] font-bold text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg z-20">
                      {social.name}
                    </span>
                  </a>
                );
              })}
            </div>
          </div>
        </div>

        {/* Features Links */}
        <div className="space-y-5">
          <h4 className="text-[11px] font-black uppercase tracking-widest text-white/90 flex items-center gap-1.5">
            Features
          </h4>
          <ul className="space-y-2.5 text-xs font-semibold text-muted-foreground">
            <li>
              <button onClick={() => handleNav('video')} className="hover:text-primary transition-colors text-left flex items-center gap-1.5 group">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/40 group-hover:bg-primary transition-colors" />
                Video Downloader
              </button>
            </li>
            <li>
              <button onClick={() => handleNav('music')} className="hover:text-primary transition-colors text-left flex items-center gap-1.5 group">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/40 group-hover:bg-primary transition-colors" />
                Music Downloader
              </button>
            </li>
            <li>
              <button onClick={() => handleNav('movie')} className="hover:text-primary transition-colors text-left flex items-center gap-1.5 group">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/40 group-hover:bg-primary transition-colors" />
                Movie Downloader
              </button>
            </li>
            <li>
              <button onClick={() => handleNav('cinema')} className="hover:text-primary transition-colors text-left flex items-center gap-1.5 group">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/40 group-hover:bg-primary transition-colors" />
                Virtual Cinema Room
              </button>
            </li>
            <li>
              <button onClick={() => handleNav('games')} className="hover:text-primary transition-colors text-left flex items-center gap-1.5 group">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/40 group-hover:bg-primary transition-colors" />
                Game Rooms (Split / Steal)
              </button>
            </li>
            <li>
              <button onClick={() => handleNav('bulk')} className="hover:text-primary transition-colors text-left flex items-center gap-1.5 group">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/40 group-hover:bg-primary transition-colors" />
                Bulk Queue Tools
              </button>
            </li>
          </ul>
        </div>

        {/* Support & Legal Links */}
        <div className="space-y-5">
          <h4 className="text-[11px] font-black uppercase tracking-widest text-white/90">Support & Legal</h4>
          <ul className="space-y-2.5 text-xs font-semibold text-muted-foreground">
            <li>
              <button onClick={() => handleNav('about')} className="hover:text-primary transition-colors text-left">About Us</button>
            </li>
            <li>
              <button onClick={() => handleNav('contact')} className="hover:text-primary transition-colors text-left">Contact Support</button>
            </li>
            <li>
              <button onClick={() => handleNav('referral')} className="hover:text-primary transition-colors text-left">Refer & Earn</button>
            </li>
            <li>
              <button onClick={() => handleNav('privacy')} className="hover:text-primary transition-colors text-left">Privacy Policy</button>
            </li>
            <li>
              <button onClick={() => handleNav('cookies')} className="hover:text-primary transition-colors text-left">Cookie Policy</button>
            </li>
            <li>
              <button onClick={() => handleNav('terms')} className="hover:text-primary transition-colors flex items-center gap-1.5 text-left">
                Terms of Use <ExternalLink className="w-3 h-3 text-muted-foreground/60" />
              </button>
            </li>
          </ul>
        </div>

        {/* Newsletter Subscription */}
        <div className="space-y-5">
          <h4 className="text-[11px] font-black uppercase tracking-widest text-white/90">Stay Updated</h4>
          <p className="text-xs text-muted-foreground font-medium leading-relaxed">
            Get the latest feature releases, streaming updates, and exclusive perks.
          </p>
          <form onSubmit={handleSubscribe} className="space-y-2.5">
            <div className="relative">
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email" 
                required
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-3.5 pr-11 text-xs outline-none focus:border-primary/50 text-white placeholder:text-muted-foreground/60 transition-colors" 
              />
              <button 
                type="submit"
                aria-label="Subscribe"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-primary hover:bg-primary/80 transition-colors text-white shadow-sm"
              >
                {subscribed ? <Check className="w-3.5 h-3.5 text-white" /> : <ChevronRight className="w-3.5 h-3.5 text-white" />}
              </button>
            </div>
            {subscribed && (
              <p className="text-[11px] text-emerald-400 font-bold flex items-center gap-1">
                ✓ Thank you for subscribing!
              </p>
            )}
          </form>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="py-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
        <p>© 2026 StreamAura Media Group. All rights reserved.</p>
        <div className="flex items-center gap-6">
          <span className="flex items-center gap-2"><Lock className="w-3.5 h-3.5 text-emerald-400" /> 256-Bit SSL Encrypted</span>
          <span className="flex items-center gap-2"><Globe className="w-3.5 h-3.5 text-blue-400" /> Global Edge CDN</span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;