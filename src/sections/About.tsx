import React from 'react';
import { motion } from 'framer-motion';
import { 
  Zap, 
  Shield, 
  Smartphone, 
  Globe, 
  Heart, 
  Coffee, 
  Tv, 
  Wallet, 
  Share2, 
  Users,
  Film,
  Sparkles,
  Rocket,
  Music,
  Download
} from 'lucide-react';

const About: React.FC = () => {
  const stats = [
    { label: 'Instant Access', icon: Zap, color: 'text-fuchsia-400' },
    { label: 'Private Space', icon: Shield, color: 'text-green-400' },
    { label: 'All Devices', icon: Smartphone, color: 'text-purple-400' },
    { label: 'World Wide', icon: Globe, color: 'text-fuchsia-400' },
  ];

  const recentFeatures = [
    {
      title: 'Grand Cinema Experience',
      desc: 'Watch movies together with friends in perfect sync. Our virtual theater brings the magic of the big screen directly to your screen with premium sound and visual effects.',
      icon: Tv,
      color: 'text-rose-500',
      bg: 'bg-rose-500/10'
    },
    {
      title: 'Premium Virtual Wallet',
      desc: 'Fund your fun easily and manage your movie budget. Our smart system lets you buy tickets and snacks with total peace of mind and 100% safety.',
      icon: Wallet,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10'
    },
    {
      title: 'Invite & Earn Rewards',
      desc: 'The more the merrier! Bring your friends to StreamAura and get rewarded with ₦100 per person to spend on premium movie tickets and exclusive room access.',
      icon: Share2,
      color: 'text-orange-500',
      bg: 'bg-orange-500/10'
    },
    {
      title: 'Unlimited Downloads',
      desc: 'Save your favorite videos and music to watch later. From high-quality movies to the latest hits, everything you love is just one click away.',
      icon: Download,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10'
    }
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-12 pb-32">
      {/* Header */}
      <div className="text-center space-y-4">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-28 h-24 mx-auto rounded-[2rem] overflow-hidden flex items-center justify-center p-2 bg-white/5 shadow-2xl border border-white/10"
        >
          <img src="/logo.png" alt="StreamAura" className="w-full h-full object-contain scale-110" />
        </motion.div>
        <h2 className="text-5xl font-black tracking-tighter uppercase gradient-text">The Aura Experience</h2>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto font-medium">
          A world where your favorite media and your best friends meet.
        </p>
      </div>

      {/* Main Content */}
      <div className="glass-card p-8 md:p-12 space-y-12 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
          <Film className="w-64 h-64" />
        </div>

        <section className="space-y-4 relative z-10">
          <h3 className="text-2xl font-black flex items-center gap-3 uppercase tracking-tight">
            <Heart className="w-6 h-6 text-rose-500 fill-current" /> Our Vision
          </h3>
          <p className="text-muted-foreground leading-relaxed text-lg font-medium">
            StreamAura was built for people who love movies, music, and sharing great moments. 
            We believe you should have the freedom to save what you love and enjoy it in a beautiful, 
            luxurious environment. We've combined power with simplicity to create a space that feels 
            like the future of entertainment.
          </p>
        </section>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 relative z-10">
          {stats.map((item, i) => (
            <div key={i} className="text-center space-y-2 p-6 rounded-3xl bg-white/[0.03] border border-white/5 shadow-inner">
              <item.icon className={`w-8 h-8 mx-auto ${item.color}`} />
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{item.label}</p>
            </div>
          ))}
        </div>

        {/* Feature Grid */}
        <section className="space-y-6 pt-10 border-t border-white/5 relative z-10">
          <div className="space-y-2 text-center md:text-left">
            <h3 className="text-2xl font-black flex items-center justify-center md:justify-start gap-3 uppercase tracking-tight">
              <Sparkles className="w-6 h-6 text-primary" /> What's Inside
            </h3>
            <p className="text-[10px] text-muted-foreground font-black uppercase tracking-[0.2em]">Crafted for the ultimate fan experience</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {recentFeatures.map((feature, i) => (
              <motion.div 
                key={i}
                whileHover={{ y: -5 }}
                className="p-6 rounded-[2rem] bg-white/[0.02] border border-white/5 space-y-4 hover:bg-white/[0.04] transition-colors"
              >
                <div className={`w-12 h-12 rounded-2xl ${feature.bg} flex items-center justify-center`}>
                  <feature.icon className={`w-6 h-6 ${feature.color}`} />
                </div>
                <div>
                  <h4 className="font-black text-white uppercase tracking-tight text-sm mb-1">{feature.title}</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed font-medium">{feature.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="space-y-8 pt-10 border-t border-white/5 relative z-10">
           <div className="flex items-center gap-3">
             <Rocket className="w-6 h-6 text-primary" />
             <h3 className="text-2xl font-black uppercase tracking-tight">Why We're Different</h3>
           </div>
           
           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-2 p-6 rounded-3xl bg-primary/[0.02] border border-white/5">
              <h4 className="font-black text-white uppercase text-xs tracking-widest">Designed for Luxury</h4>
              <p className="text-[11px] text-muted-foreground leading-relaxed font-medium">
                Every pixel of StreamAura is designed to feel premium. From the smooth animations of our 
                cinema curtains to the crispness of our interface, we prioritize beauty just as much as power.
              </p>
            </div>
            <div className="space-y-2 p-6 rounded-3xl bg-primary/[0.02] border border-white/5">
              <h4 className="font-black text-white uppercase text-xs tracking-widest">Always High Quality</h4>
              <p className="text-[11px] text-muted-foreground leading-relaxed font-medium">
                We make sure you get the best version of everything. Whether you're watching a movie with friends 
                or downloading a song, our system automatically picks the highest quality available for you.
              </p>
            </div>
          </div>
        </section>

        <section className="p-8 rounded-[2.5rem] bg-gradient-to-br from-primary/20 via-black/40 to-indigo-900/20 border border-white/10 flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden group">
          <div className="absolute inset-0 bg-primary opacity-0 group-hover:opacity-5 transition-opacity duration-700" />
          
          <div className="flex items-center gap-6 relative z-10">
            <div className="w-16 h-16 rounded-3xl bg-white/10 flex items-center justify-center backdrop-blur-xl border border-white/10 shadow-2xl">
              <Music className="w-8 h-8 text-primary" />
            </div>
            <div>
              <p className="text-xl font-black text-white uppercase tracking-tighter">v3.0.0 • Pure Passion</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-[0.3em] font-black">Next-Gen Media Platform</p>
            </div>
          </div>
          
          <div className="flex flex-col items-end gap-2 relative z-10">
            <div className="flex items-center gap-2 text-sm font-black text-primary uppercase tracking-widest">
              <Users className="w-4 h-4" /> Community First
            </div>
            <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground italic">
              <Coffee className="w-4 h-4" /> Powered by code and lots of coffee.
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default About;
