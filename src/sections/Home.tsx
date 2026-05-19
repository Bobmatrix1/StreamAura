import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Zap, 
  Shield, 
  Globe, 
  Tv, 
  Wallet, 
  Share2, 
  Play, 
  ArrowRight, 
  Music,
  Film,
  Award,
  Lock,
  ChevronRight,
  ExternalLink,
  Facebook,
  Twitter,
  Instagram,
  Youtube,
  Cloud,
  CreditCard,
  Users,
  Gamepad2
} from 'lucide-react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { useAuth } from '../contexts/AuthContext';
import type { ViewType } from '../types';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface HomeProps {
  onNavigate: (view: ViewType) => void;
}

const Home: React.FC<HomeProps> = ({ onNavigate }) => {
  const { isAuthenticated } = useAuth();
  const [partners, setPartners] = useState<any[]>([]);

  // Typewriter Logic
  const [typeText, setTypeText] = useState('Download');
  const [isDeleting, setIsDeleting] = useState(false);
  const [loopNum, setLoopNum] = useState(0);
  const [typingSpeed, setTypingSpeed] = useState(150);

  const words = ['Download', 'Stream'];

  useEffect(() => {
    const handleType = () => {
      const i = loopNum % words.length;
      const fullWord = words[i];

      if (isDeleting) {
        setTypeText(fullWord.substring(0, typeText.length - 1));
        setTypingSpeed(80);
      } else {
        setTypeText(fullWord.substring(0, typeText.length + 1));
        setTypingSpeed(150);
      }

      if (!isDeleting && typeText === fullWord) {
        setTimeout(() => setIsDeleting(true), 2000);
      } else if (isDeleting && typeText === '') {
        setIsDeleting(false);
        setLoopNum(loopNum + 1);
        setTypingSpeed(500);
      }
    };

    const timer = setTimeout(handleType, typingSpeed);
    return () => clearTimeout(timer);
  }, [typeText, isDeleting, loopNum, typingSpeed]);

  useEffect(() => {
    const fetchPartners = async () => {
      try {
        const partnersRef = collection(db, 'partners');
        const q = query(partnersRef, where('active', '==', true));
        const querySnapshot = await getDocs(q);
        const partnerData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setPartners(partnerData);
      } catch (err) {
        console.error("Error fetching partners:", err);
      }
    };
    fetchPartners();
  }, []);

  const features = [
    {
      id: 'video' as ViewType,
      title: 'Video Downloader',
      desc: 'Save videos from your favorite social platforms in stunning 4K and 1080p quality. Supporting over 100+ sites.',
      icon: Film,
      color: 'blue',
      badge: 'PRO'
    },
    {
      id: 'music' as ViewType,
      title: 'Music Extraction',
      desc: 'Convert any video or audio link into high-bitrate MP3 or FLAC. Perfect for building your offline music library.',
      icon: Music,
      color: 'fuchsia',
      badge: 'FAST'
    },
    {
      id: 'cinema' as ViewType,
      title: 'Virtual Cinema',
      desc: 'Host or join live watch parties. Synchronized playback with real-time voice and video chat for ultimate fun.',
      icon: Tv,
      color: 'rose',
      badge: 'LIVE'
    },
    {
      id: 'games' as ViewType,
      title: 'Split or Steal',
      desc: 'Test your luck and loyalty in our high-stakes social game. Compete for cash prizes in our real-time high-fidelity arena.',
      icon: Gamepad2,
      color: 'yellow',
      badge: 'NEW'
    },
    {
      id: 'wallet' as ViewType,
      title: 'Digital Wallet',
      desc: 'Manage your funds securely with Paystack. Buy movie tickets, snacks, and earn rewards effortlessly.',
      icon: Wallet,
      color: 'emerald',
      badge: 'SECURE'
    }
  ];

  return (
    <div className="space-y-24 pb-32">
      {/* Hero Section */}
      <section className="relative min-h-[80vh] flex flex-col items-center justify-center text-center px-4 overflow-hidden">
        {/* Background Decorative Elements */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] -z-10 opacity-30 pointer-events-none">
           <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600 rounded-full blur-[120px] animate-pulse" />
           <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600 rounded-full blur-[120px] animate-pulse delay-1000" />
           <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] border border-white/5 rounded-full rotate-45" />
           <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] border border-white/10 rounded-full -rotate-12" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="space-y-8 max-w-4xl"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-md shadow-2xl">
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/70">The Future of Media is Here</span>
          </div>

          <div className="space-y-4">
            <h1 className="text-6xl md:text-8xl font-black tracking-tighter uppercase leading-[0.9]">
              {typeText} <span className="gradient-text">Anything.</span><br />
              Feel the <span className="gradient-text">Aura.</span>
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground font-medium max-w-2xl mx-auto leading-relaxed">
              Experience the ultimate all-in-one media powerhouse. High-speed downloads, immersive virtual cinemas, and social rewards.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Button 
              onClick={() => onNavigate('video')}
              className="h-14 px-10 rounded-2xl gradient-bg text-sm font-black uppercase tracking-widest shadow-2xl shadow-primary/25 hover:scale-105 transition-all group"
            >
              Start Downloading
              <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Button>
            <Button 
              variant="outline"
              onClick={() => onNavigate('cinema')}
              className="h-14 px-10 rounded-2xl border-white/10 bg-white/5 text-sm font-black uppercase tracking-widest hover:bg-white/10"
            >
              Explore Cinema
              <Play className="ml-2 w-4 h-4 fill-current" />
            </Button>
          </div>

          <div className="flex items-center justify-center gap-8 pt-8 opacity-40">
             <div className="flex flex-col items-center gap-1">
                <span className="text-2xl font-black text-white">100+</span>
                <span className="text-[8px] font-black uppercase tracking-widest">Platforms</span>
             </div>
             <div className="h-8 w-[1px] bg-white/20" />
             <div className="flex flex-col items-center gap-1">
                <span className="text-2xl font-black text-white">4K</span>
                <span className="text-[8px] font-black uppercase tracking-widest">Quality</span>
             </div>
             <div className="h-8 w-[1px] bg-white/20" />
             <div className="flex flex-col items-center gap-1">
                <span className="text-2xl font-black text-white">FREE</span>
                <span className="text-[8px] font-black uppercase tracking-widest">Access</span>
             </div>
          </div>
        </motion.div>
      </section>

      {/* Partners Section */}
      <section className="px-4">
        <div className="max-w-6xl mx-auto py-12 border-y border-white/5">
          <p className="text-center text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground mb-12">Trusted Partners & Sponsors</p>
          <div className="flex flex-wrap items-center justify-center gap-12 md:gap-24 grayscale opacity-40 hover:grayscale-0 transition-all duration-700">
             {partners.length > 0 ? partners.map(partner => (
               <div key={partner.id} className="flex flex-col items-center gap-3">
                  <img src={partner.logo} alt={partner.name} className="h-8 md:h-12 object-contain" />
                  <span className="text-[8px] font-black uppercase tracking-widest">{partner.name}</span>
               </div>
             )) : (
               <>
                 <div className="flex items-center gap-3"><Cloud className="w-8 h-8" /><span className="font-black text-xl text-white">Cloudflare</span></div>
                 <div className="flex items-center gap-3"><CreditCard className="w-8 h-8" /><span className="font-black text-xl text-white">Paystack</span></div>
                 <div className="flex items-center gap-3"><Zap className="w-8 h-8 text-primary" /><span className="font-black text-xl text-white">Firebase</span></div>
                 <div className="flex items-center gap-3"><Users className="w-8 h-8" /><span className="font-black text-xl text-white">Agora</span></div>
               </>
             )}
          </div>
        </div>
      </section>

      {/* App Explorer (Page Explanations) */}
      <section className="max-w-7xl mx-auto px-4 space-y-12">
        <div className="text-center space-y-2">
          <h2 className="text-4xl font-black uppercase tracking-tight text-white">Explore the Ecosystem</h2>
          <p className="text-muted-foreground font-medium uppercase tracking-[0.2em] text-xs">Everything you need to master your media</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
          {features.map((feature, i) => {
            const themeClasses: Record<string, string> = {
              blue: 'bg-blue-500/10 border-blue-500/20 text-blue-500 group-hover:!bg-blue-600 group-hover:!text-white group-hover:border-blue-400 group-hover:shadow-[0_0_30px_rgba(37,99,235,0.5)]',
              fuchsia: 'bg-fuchsia-500/10 border-fuchsia-500/20 text-fuchsia-500 group-hover:!bg-fuchsia-600 group-hover:!text-white group-hover:border-fuchsia-400 group-hover:shadow-[0_0_30px_rgba(192,38,211,0.5)]',
              rose: 'bg-rose-500/10 border-rose-500/20 text-rose-500 group-hover:!bg-rose-600 group-hover:!text-white group-hover:border-rose-400 group-hover:shadow-[0_0_30px_rgba(244,63,94,0.5)]',
              yellow: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-500 group-hover:!bg-yellow-500 group-hover:!text-black group-hover:border-yellow-400 group-hover:shadow-[0_0_30px_rgba(234,179,8,0.5)]',
              emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500 group-hover:!bg-emerald-600 group-hover:!text-white group-hover:border-emerald-400 group-hover:shadow-[0_0_30px_rgba(16,185,129,0.5)]'
            };

            const activeTheme = themeClasses[feature.color] || themeClasses.blue;

            return (
              <motion.div
                key={feature.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <Card 
                  className="p-8 h-full glass-card border-white/5 hover:border-white/20 transition-all duration-500 group flex flex-col justify-between cursor-pointer" 
                  onClick={() => onNavigate(feature.id)}
                >
                  <div className="space-y-6">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border group-hover:scale-110 transition-transform ${
                      feature.color === 'blue' ? 'bg-blue-500/10 border-blue-500/20 group-hover:border-blue-400/50' :
                      feature.color === 'fuchsia' ? 'bg-fuchsia-500/10 border-fuchsia-500/20 group-hover:border-fuchsia-400/50' :
                      feature.color === 'rose' ? 'bg-rose-500/10 border-rose-500/20 group-hover:border-rose-400/50' :
                      feature.color === 'yellow' ? 'bg-yellow-500/10 border-yellow-500/20 group-hover:border-yellow-400/50' :
                      'bg-emerald-500/10 border-emerald-500/20 group-hover:border-emerald-400/50'
                    }`}>
                      <feature.icon className={`w-7 h-7 transition-colors ${
                        feature.color === 'blue' ? 'text-blue-500 group-hover:text-blue-300' :
                        feature.color === 'fuchsia' ? 'text-fuchsia-500 group-hover:text-fuchsia-300' :
                        feature.color === 'rose' ? 'text-rose-500 group-hover:text-rose-300' :
                        feature.color === 'yellow' ? 'text-yellow-500 group-hover:text-yellow-300' :
                        'text-emerald-500 group-hover:text-emerald-300'
                      }`} />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-black uppercase tracking-tight text-white group-hover:text-white transition-colors">{feature.title}</h3>
                        <Badge variant="outline" className={`text-[8px] font-black transition-colors ${
                          feature.color === 'blue' ? 'bg-blue-500/10 text-blue-500 border-blue-500/30 group-hover:!bg-blue-400/20 group-hover:!text-white' :
                          feature.color === 'fuchsia' ? 'bg-fuchsia-500/10 text-fuchsia-500 border-fuchsia-500/30 group-hover:!bg-fuchsia-400/20 group-hover:!text-white' :
                          feature.color === 'rose' ? 'bg-rose-500/10 text-rose-500 border-rose-500/30 group-hover:!bg-rose-400/20 group-hover:!text-white' :
                          feature.color === 'yellow' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30 group-hover:!bg-yellow-500 group-hover:!text-black' :
                          'bg-emerald-500/10 text-emerald-500 border-emerald-500/30 group-hover:!bg-emerald-400/20 group-hover:!text-white'
                        }`}>{feature.badge}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed font-medium group-hover:text-white/80 transition-colors">
                        {feature.desc}
                      </p>
                    </div>
                  </div>
                  <div className={`mt-8 w-full flex items-center justify-between h-12 px-5 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${activeTheme}`}>
                    Go to {feature.title}
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Advanced Features Row */}
      <section className="max-w-7xl mx-auto px-4 grid grid-cols-1 md:grid-cols-2 gap-8">
         <Card className="relative overflow-hidden p-10 glass-card border-white/5 bg-gradient-to-br from-orange-500/10 to-transparent group">
            <div className="absolute top-0 right-0 p-10 opacity-10 group-hover:rotate-12 transition-transform duration-700">
               <Share2 className="w-40 h-40" />
            </div>
            <div className="relative z-10 space-y-6">
               <Badge className="bg-orange-500 text-white border-none font-black text-[9px] uppercase tracking-widest px-3">Rewards Program</Badge>
               <h3 className="text-3xl font-black uppercase tracking-tight text-white">Refer & Earn Big</h3>
               <p className="text-sm text-muted-foreground font-medium max-w-sm leading-relaxed">
                  Help us grow the Aura community! Get <span className="text-orange-400 font-black">₦100 instantly</span> for every friend who signs up with your link. Use rewards for movies and more.
               </p>
               <Button onClick={() => onNavigate('referral')} className="rounded-xl px-6 font-black uppercase text-[10px] tracking-widest bg-orange-600 hover:bg-orange-500">Get Referral Link</Button>
            </div>
         </Card>

         <Card className="relative overflow-hidden p-10 glass-card border-white/5 bg-gradient-to-br from-indigo-500/10 to-transparent group">
            <div className="absolute top-0 right-0 p-10 opacity-10 group-hover:-rotate-12 transition-transform duration-700">
               <Zap className="w-40 h-40" />
            </div>
            <div className="relative z-10 space-y-6">
               <Badge className="bg-indigo-500 text-white border-none font-black text-[9px] uppercase tracking-widest px-3">Bulk System</Badge>
               <h3 className="text-3xl font-black uppercase tracking-tight text-white">Power Tools</h3>
               <p className="text-sm text-muted-foreground font-medium max-w-sm leading-relaxed">
                  Need to save a whole playlist of video or music? Our <span className="text-indigo-400 font-black">Bulk Downloader</span> handles dozens of links simultaneously.
               </p>
               <Button onClick={() => onNavigate('bulk')} className="rounded-xl px-6 font-black uppercase text-[10px] tracking-widest bg-indigo-600 hover:bg-indigo-500">Unlock Bulk Tools</Button>
            </div>
         </Card>
      </section>

      {/* Mission & Vision */}
      <section className="relative py-24 bg-white/[0.02] border-y border-white/5">
         <div className="max-w-5xl mx-auto px-4 grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
            <div className="space-y-8">
               <div className="space-y-4">
                  <h3 className="text-4xl font-black uppercase tracking-tighter text-white">Our Core Mission</h3>
                  <div className="w-12 h-1 bg-primary rounded-full" />
                  <p className="text-lg text-muted-foreground font-medium leading-relaxed">
                     StreamAura was built with a simple yet powerful goal: To give users ultimate control over their digital media. We believe that entertainment should be high-quality, accessible everywhere, and most importantly shared.
                  </p>
               </div>
               <ul className="space-y-4">
                  {[
                    { icon: Shield, text: 'Privacy-focused downloading with no tracking.' },
                    { icon: Award, text: 'Best-in-class media extraction technology.' },
                    { icon: Globe, text: 'Connecting people through synchronized social watch parties.' }
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-4 text-sm font-bold text-white/80">
                       <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center border border-white/10">
                          <item.icon className="w-4 h-4 text-primary" />
                       </div>
                       {item.text}
                    </li>
                  ))}
               </ul>
            </div>
            <div className="relative aspect-square">
               <div className="absolute inset-0 bg-primary/20 rounded-[3rem] blur-[80px] animate-pulse" />
               <div className="relative h-full w-full rounded-[3rem] border border-white/10 bg-white/5 overflow-hidden shadow-2xl flex items-center justify-center p-12">
                  <img src="/logo.png" className="w-full h-full object-contain drop-shadow-[0_0_50px_rgba(225,29,72,0.4)]" alt="StreamAura" />
               </div>
            </div>
         </div>
      </section>

      {/* Call to Action */}
      <section className="px-4">
         <div className="max-w-6xl mx-auto p-12 md:p-20 rounded-[3rem] bg-gradient-to-br from-indigo-900 to-black border border-white/10 text-center space-y-8 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full bg-[url('https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?q=80&w=2070&auto=format&fit=crop')] opacity-10 bg-cover bg-center grayscale" />
            <div className="relative z-10 space-y-6">
               <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tighter leading-tight text-white">Ready to step into <br /><span className="gradient-text">The Grand Theater?</span></h2>
               <p className="text-muted-foreground text-lg font-medium max-w-xl mx-auto leading-relaxed">
                  Join thousands of users enjoying the next generation of social media downloading and virtual cinema.
               </p>
               {!isAuthenticated ? (
                  <Button onClick={() => window.location.href='/?auth=signup'} className="h-14 px-12 rounded-2xl gradient-bg text-sm font-black uppercase tracking-widest shadow-2xl">Create Your Account</Button>
               ) : (
                  <Button onClick={() => onNavigate('cinema')} className="h-14 px-12 rounded-2xl gradient-bg text-sm font-black uppercase tracking-widest shadow-2xl">Enter the Cinema</Button>
               )}
            </div>
         </div>
      </section>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 pt-12 border-t border-white/5 text-white">
         <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
            <div className="col-span-1 md:col-span-1 space-y-6">
               <div className="flex items-center gap-3">
                  <img src="/logo.png" className="w-8 h-8" alt="Logo" />
                  <span className="text-xl font-black uppercase tracking-tighter gradient-text">StreamAura</span>
               </div>
               <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                  The ultimate media powerhouse for downloading, extracting, and watching together in luxury.
               </p>
               <div className="flex gap-4">
                  <button className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center border border-white/10 hover:bg-primary/20 transition-all text-white"><Twitter className="w-4 h-4" /></button>
                  <button className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center border border-white/10 hover:bg-primary/20 transition-all text-white"><Facebook className="w-4 h-4" /></button>
                  <button className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center border border-white/10 hover:bg-primary/20 transition-all text-white"><Instagram className="w-4 h-4" /></button>
                  <button className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center border border-white/10 hover:bg-primary/20 transition-all text-white"><Youtube className="w-4 h-4" /></button>
               </div>
            </div>

            <div className="space-y-6">
               <h4 className="text-[10px] font-black uppercase tracking-widest text-white">Features</h4>
               <ul className="space-y-3 text-xs font-bold text-muted-foreground">
                  <li><button onClick={() => onNavigate('video')} className="hover:text-primary transition-colors text-left">Video Downloader</button></li>
                  <li><button onClick={() => onNavigate('music')} className="hover:text-primary transition-colors text-left">Audio Extractor</button></li>
                  <li><button onClick={() => onNavigate('cinema')} className="hover:text-primary transition-colors text-left">Virtual Cinema</button></li>
                  <li><button onClick={() => onNavigate('bulk')} className="hover:text-primary transition-colors text-left">Bulk Tools</button></li>
               </ul>
            </div>

            <div className="space-y-6">
               <h4 className="text-[10px] font-black uppercase tracking-widest text-white">Support</h4>
               <ul className="space-y-3 text-xs font-bold text-muted-foreground">
                  <li><button onClick={() => onNavigate('about')} className="hover:text-primary transition-colors text-left">About Us</button></li>
                  <li><button onClick={() => onNavigate('contact')} className="hover:text-primary transition-colors text-left">Contact Support</button></li>
                  <li><button onClick={() => onNavigate('privacy')} className="hover:text-primary transition-colors text-left">Privacy Policy</button></li>
                  <li><button className="hover:text-primary transition-colors flex items-center gap-2 text-left">Terms of Service <ExternalLink className="w-3 h-3" /></button></li>
               </ul>
            </div>

            <div className="space-y-6">
               <h4 className="text-[10px] font-black uppercase tracking-widest text-white">Newsletter</h4>
               <p className="text-xs text-muted-foreground font-medium">Get the latest updates and movie room releases.</p>
               <div className="relative">
                  <input type="email" placeholder="Email Address" className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-xs outline-none focus:border-primary/50 text-white" />
                  <button className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-primary hover:bg-primary/80 transition-colors">
                     <ChevronRight className="w-4 h-4 text-white" />
                  </button>
               </div>
            </div>
         </div>
         
         <div className="py-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
            <p>© 2026 StreamAura Media Group. All rights reserved.</p>
            <div className="flex gap-8">
               <span className="flex items-center gap-2"><Lock className="w-3 h-3 text-emerald-500" /> Secure SSL</span>
               <span className="flex items-center gap-2"><Globe className="w-3 h-3 text-blue-500" /> Server Global</span>
            </div>
         </div>
      </footer>
    </div>
  );
};

export default Home;
