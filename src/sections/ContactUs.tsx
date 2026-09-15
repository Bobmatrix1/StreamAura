import React from 'react';
import { Mail, MessageCircle, LifeBuoy, ExternalLink } from 'lucide-react';
import { TikTokLogo, InstagramLogo, XLogo, TelegramLogo, WhatsAppLogo } from '../components/SocialLogos';

const ContactUs: React.FC = () => {
  const contactMethods = [
    { name: 'Email Support', value: 'john@feel-flytech.site', icon: Mail, color: 'bg-lime-500/20 text-lime-400', link: 'mailto:john@feel-flytech.site' },
    { name: 'TikTok Official', value: '@streamaura0', icon: TikTokLogo, color: 'bg-cyan-500/20 text-cyan-400', link: 'https://www.tiktok.com/@streamaura0?_r=1&_t=ZS-99WmicLaizl' },
    { name: 'Instagram Official', value: '@streamaura1', icon: InstagramLogo, color: 'bg-pink-500/20 text-pink-400', link: 'https://www.instagram.com/streamaura1?stkn=OWM2ZXVuajhxdWVw' },
    { name: 'Official X (Twitter)', value: '@StreamAura1', icon: XLogo, color: 'bg-slate-800/60 text-white', link: 'https://x.com/StreamAura1' },
    { name: 'Telegram Community', value: 't.me/streamaura1', icon: TelegramLogo, color: 'bg-blue-500/20 text-blue-400', link: 'https://t.me/streamaura1' },
    { name: 'WhatsApp Community', value: 'StreamAura Channel', icon: WhatsAppLogo, color: 'bg-emerald-500/20 text-emerald-400', link: 'https://whatsapp.com/channel/0029VbCapyl0VycCk55O841x' },
  ];

  const handleExternalLink = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-12 pb-32">
      <div className="text-center space-y-4">
        <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-lime-500 to-green-600 flex items-center justify-center shadow-lg shadow-lime-500/20">
          <LifeBuoy className="w-10 h-10 text-white" />
        </div>
        <h2 className="text-4xl font-bold gradient-text text-lime-400">Contact Us</h2>
        <p className="text-muted-foreground text-lg">We're here to help you get the most out of StreamAura.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-card p-8 space-y-8">
          <h3 className="text-xl font-bold flex items-center gap-3 text-lime-400">
            <MessageCircle className="w-5 h-5" /> Get in Touch
          </h3>
          <div className="space-y-4">
            {contactMethods.map((method, i) => (
              <div 
                key={i} 
                onClick={() => handleExternalLink(method.link)}
                className="p-4 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-between group hover:bg-white/10 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${method.color}`}>
                    <method.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{method.name}</p>
                    <p className="text-sm font-bold text-foreground">{method.value}</p>
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="glass-card p-8 space-y-4">
            <h3 className="font-bold text-lg text-foreground">Report a Bug</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Found a link that won't download? Or a video player that hangs? Please let us know! 
              Our developers work 24/7 to keep the engine running smoothly.
            </p>
            <button 
              onClick={() => handleExternalLink('https://wa.me/message/B6NFNENSALEIK1')}
              className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-sm font-black uppercase tracking-widest hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 transition-all flex items-center justify-center gap-2"
            >
              Submit Bug Report
            </button>
          </div>

          <div className="glass-card p-8 space-y-4">
            <h3 className="font-bold text-lg text-foreground">Feedback & Requests</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Have an idea for a new feature? We love hearing from our community. 
              Suggest a feature or anything youd like to be added to the streamaura platform.
            </p>
            <button 
              onClick={() => handleExternalLink('https://wa.me/message/B6NFNENSALEIK1')}
              className="w-full py-3 rounded-xl bg-lime-600 text-white text-sm font-black uppercase tracking-widest shadow-lg shadow-lime-600/20 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              Send Feedback
            </button>
          </div>
        </div>
      </div>

      <div className="glass-card p-6 text-center">
        <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">
          Average Response Time: <span className="text-lime-400 font-bold">1-2 Hours</span>
        </p>
      </div>
    </div>
  );
};

export default ContactUs;
