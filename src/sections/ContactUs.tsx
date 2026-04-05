import React from 'react';
import { Mail, MessageCircle, Send, Twitter, LifeBuoy, ExternalLink } from 'lucide-react';

const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 448 512" fill="currentColor" className={className}>
    <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-93.6-25.7l-6.7-4-69.5 18.2 18.5-67.8-4.4-7.1c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-5.5-2.8-23.4-8.6-44.6-25.2-16.5-14.7-27.6-32.8-30.8-38.5-3.2-5.6-.3-8.6 2.5-11.4 2.5-2.5 5.5-6.5 8.3-9.7 2.8-3.2 3.7-5.5 5.5-9.2 1.9-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/>
  </svg>
);

const XIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932L18.901 1.153zM17.61 20.644h2.039L6.486 3.24H4.298L17.61 20.644z"/>
  </svg>
);

const ContactUs: React.FC = () => {
  const contactMethods = [
    { name: 'Email Support', value: 'john@feel-flytech.site', icon: Mail, color: 'bg-lime-500/20 text-lime-400', link: 'mailto:john@feel-flytech.site' },
    { name: 'Official X (Twitter)', value: '@StreamAura1', icon: XIcon, color: 'bg-slate-800/40 text-white', link: 'https://twitter.com/StreamAura1' },
    { name: 'WhatsApp Community', value: 'Join our channel', icon: WhatsAppIcon, color: 'bg-emerald-500/20 text-emerald-400', link: 'https://whatsapp.com/channel/0029VbCapyl0VycCk55O841x' },
    { name: 'Telegram Community', value: 't.me/streamaura1', icon: Send, color: 'bg-blue-500/20 text-blue-400', link: 'https://t.me/streamaura1' },
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
              Suggest a platform you'd like us to support next!
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
