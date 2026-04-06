import React from 'react';
import { motion } from 'framer-motion';
import { Zap, Shield, Smartphone, Globe, Heart, Star, Code, Coffee } from 'lucide-react';

const About: React.FC = () => {
  const stats = [
    { label: 'Fast Downloads', icon: Zap, color: 'text-fuchsia-400' },
    { label: 'Secure & Private', icon: Shield, color: 'text-green-400' },
    { label: 'Cross Platform', icon: Smartphone, color: 'text-purple-400' },
    { label: 'Global Access', icon: Globe, color: 'text-fuchsia-400' },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-12 pb-32">
      {/* Header */}
      <div className="text-center space-y-4">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-28 h-24 mx-auto rounded-3xl overflow-hidden flex items-center justify-center p-2 bg-white/5 shadow-2xl border border-white/10"
        >
          <img src="/logo.png" alt="StreamAura" className="w-full h-full object-contain scale-110" />
        </motion.div>
        <h2 className="text-5xl font-black gradient-text">About StreamAura</h2>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
          The ultimate all-in-one media powerhouse for the modern web.
        </p>
      </div>

      {/* Main Content */}
      <div className="glass-card p-8 md:p-12 space-y-10">
        <section className="space-y-4">
          <h3 className="text-2xl font-bold flex items-center gap-3">
            <Heart className="w-6 h-6 text-rose-500 fill-current" /> Our Mission
          </h3>
          <p className="text-muted-foreground leading-relaxed text-lg">
            StreamAura was born from a simple idea: media should be accessible, high-quality, and easy to save. 
            We believe that you should have the power to enjoy your favorite content anywhere, anytime, 
            without being tethered to an internet connection. Our platform combines cutting-edge extraction 
            technology with a premium, user-first design to deliver the best downloading experience on the planet.
          </p>
        </section>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {stats.map((item, i) => (
            <div key={i} className="text-center space-y-2 p-4 rounded-2xl bg-white/5 border border-white/5">
              <item.icon className={`w-8 h-8 mx-auto ${item.color}`} />
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{item.label}</p>
            </div>
          ))}
        </div>

        <section className="space-y-6 pt-6 border-t border-white/5">
          <h3 className="text-2xl font-bold flex items-center gap-3">
            <Zap className="w-6 h-6 text-fuchsia-400" /> Why StreamAura?
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-2">
              <h4 className="font-bold text-foreground">Intelligent Engine</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Our backend uses a custom-tuned Media Engine that automatically identifies the highest quality 
                streams available, ensuring you get crisp 1080p and 4K content every time.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-bold text-foreground">Zero-Buffer Streaming</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Don't want to wait for a download? Our "Watch Now" technology pipes raw data directly from 
                the source to your browser with zero server-side delay.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-bold text-foreground">Privacy by Design</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                We don't track what you watch. Your personal download history is stored locally on your 
                device, giving you complete control over your data.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-bold text-foreground">The "Aura" Experience</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Beyond functionality, we prioritize aesthetics. Our Glassmorphic UI is designed to feel 
                like a native OS component, smooth, responsive, and visually stunning.
              </p>
            </div>
          </div>
        </section>

        <section className="p-6 rounded-2xl bg-gradient-to-r from-fuchsia-500/10 to-purple-500/10 border border-fuchsia-500/20 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
              <Code className="w-6 h-6 text-fuchsia-400" />
            </div>
            <div>
              <p className="font-bold">v2.4.0 • Built with Passion</p>
              <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Latest Stable Release</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground italic">
            <Coffee className="w-4 h-4" /> Powered by code and lots of coffee.
          </div>
        </section>
      </div>
    </div>
  );
};

export default About;
