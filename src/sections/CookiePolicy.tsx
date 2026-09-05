import React, { useState, useMemo } from 'react';
import { 
  Cookie, 
  ShieldCheck, 
  Search, 
  Mail, 
  MapPin, 
  Phone, 
  CheckCircle2, 
  Printer, 
  FileText, 
  ExternalLink, 
  Globe, 
  FileCheck
} from 'lucide-react';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';

interface Section {
  id: string;
  number: number;
  title: string;
  content: React.ReactNode;
}

export const CookiePolicy: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const sections: Section[] = useMemo(() => [
    {
      id: 'what-are-cookies',
      number: 1,
      title: 'What Are Cookies?',
      content: (
        <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
          <p>
            Cookies are small data files that are placed on your computer or mobile device when you visit a website. Cookies are widely used by website owners in order to make their websites work, or to work more efficiently, as well as to provide reporting information.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="p-3.5 rounded-xl bg-white/5 border border-white/5 space-y-1.5">
              <h5 className="text-xs font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-primary" /> First-Party Cookies
              </h5>
              <p className="text-xs text-muted-foreground">
                Cookies set directly by the website owner (<strong className="text-white">StreamAura</strong>). These are essential for session management, login security, and theme settings.
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-white/5 border border-white/5 space-y-1.5">
              <h5 className="text-xs font-bold text-white flex items-center gap-2">
                <Globe className="w-3.5 h-3.5 text-blue-400" /> Third-Party Cookies
              </h5>
              <p className="text-xs text-muted-foreground">
                Cookies set by parties other than the website owner to enable features such as payment gateways, media streaming, and performance analytics.
              </p>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'why-we-use-cookies',
      number: 2,
      title: 'Why Do We Use Cookies?',
      content: (
        <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
          <p>
            We use first- and third-party cookies for several reasons. Some cookies are required for technical reasons in order for our Website to operate, and we refer to these as <strong className="text-white">"essential"</strong> or <strong className="text-white">"strictly necessary"</strong> cookies. Other cookies enable us to track and target the interests of our users to enhance their entertainment experience.
          </p>
          <div className="space-y-2">
            {[
              {
                title: 'Strictly Necessary & Authentication',
                desc: 'Keeping your session alive, verifying user identity, managing cinema room access, and securing wallet transactions.'
              },
              {
                title: 'Performance & Local Cache',
                desc: 'Storing your download history and theme preferences directly on your device for instant offline responsiveness.'
              },
              {
                title: 'Analytics & Optimization',
                desc: 'Measuring video streaming quality, page loading times, and identifying server bottlenecks.'
              },
              {
                title: 'Advertising & Measurement',
                desc: 'Delivering relevant promotional updates and evaluating campaign effectiveness.'
              }
            ].map((item, idx) => (
              <div key={idx} className="p-3 rounded-xl bg-white/5 border border-white/5 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <h5 className="text-xs font-bold text-white">{item.title}</h5>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )
    },
    {
      id: 'control-cookies',
      number: 3,
      title: 'How Can I Control Cookies?',
      content: (
        <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
          <p>
            You have the right to decide whether to accept or reject cookies. You can exercise your cookie rights by setting your preferences in our Cookie Preference Center or through your web browser settings.
          </p>
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-medium">
            <strong>Note on Essential Cookies:</strong> Essential cookies cannot be disabled as they are strictly required to provide core functionalities (such as user authentication and security).
          </div>
          <p className="text-xs">
            If you choose to reject non-essential cookies, you may still use StreamAura, though your access to certain customized features or analytics preferences may be restricted.
          </p>
        </div>
      )
    },
    {
      id: 'cookie-inventory',
      number: 4,
      title: 'Cookies & Local Storage Served on StreamAura',
      content: (
        <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
          <p>
            Below is an inventory of the specific first-party local storage objects and cookies identified on <strong className="text-white">streamaura.site</strong>:
          </p>
          
          <div className="space-y-3">
            {[
              {
                name: 'media-downloader-theme',
                provider: 'streamaura.site',
                type: 'HTML Local Storage',
                expiry: 'Persistent',
                desc: 'Stores your preferred visual theme (dark or light mode) across browsing sessions.'
              },
              {
                name: 'websdk_ng_install_id',
                provider: 'streamaura.site',
                type: 'HTML Local Storage',
                expiry: 'Persistent',
                desc: 'Tracks Progressive Web App (PWA) installation and device identification.'
              },
              {
                name: 'firestore_online_state_firestore/...',
                provider: 'streamaura.site',
                type: 'HTML Local Storage',
                expiry: 'Persistent',
                desc: 'Maintains real-time database connection state for live cinema rooms and notifications.'
              },
              {
                name: 'firestore_sequence_number_firestore/...',
                provider: 'streamaura.site',
                type: 'HTML Local Storage',
                expiry: 'Persistent',
                desc: 'Coordinates real-time data sync and transaction mutation ordering.'
              },
              {
                name: 'firestore_clients_firestore/...',
                provider: 'streamaura.site',
                type: 'HTML Local Storage',
                expiry: 'Persistent',
                desc: 'Manages multi-tab client synchronization and session persistence.'
              },
              {
                name: 'media-downloader-history',
                provider: 'streamaura.site',
                type: 'HTML Local Storage',
                expiry: 'Persistent',
                desc: 'Stores your local download logs and completed media conversions on your device.'
              }
            ].map((item, idx) => (
              <div key={idx} className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-2">
                  <span className="font-mono text-xs font-bold text-primary break-all">{item.name}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-white/5 text-muted-foreground border-white/10 text-[10px]">
                      {item.type}
                    </Badge>
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px]">
                      {item.expiry}
                    </Badge>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <p><strong className="text-white">Provider:</strong> <span className="text-muted-foreground">{item.provider}</span></p>
                  <p><strong className="text-white">Purpose:</strong> <span className="text-muted-foreground">{item.desc}</span></p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )
    },
    {
      id: 'browser-controls',
      number: 5,
      title: 'How Can I Control Cookies on My Browser?',
      content: (
        <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
          <p>
            You can modify your browser settings to accept, reject, or delete cookies. Visit the official support link for your browser:
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {[
              { name: 'Google Chrome', url: 'https://support.google.com/chrome/answer/95647#zippy=%2Callow-or-block-cookies' },
              { name: 'Mozilla Firefox', url: 'https://support.mozilla.org/en-US/kb/enhanced-tracking-protection-firefox-desktop' },
              { name: 'Apple Safari', url: 'https://support.apple.com/en-ie/guide/safari/sfri11471/mac' },
              { name: 'Microsoft Edge', url: 'https://support.microsoft.com/en-us/windows/microsoft-edge-browsing-data-and-privacy-bb8174ba-9d73-dcf2-9b4a-c582b4e640dd' },
              { name: 'Opera Browser', url: 'https://help.opera.com/en/latest/web-preferences/' },
              { name: 'Internet Explorer', url: 'https://support.microsoft.com/en-us/windows/delete-and-manage-cookies-168dab11-0753-043d-7c16-ede5947fc64d' }
            ].map((b, idx) => (
              <a 
                key={idx}
                href={b.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 rounded-xl bg-white/5 border border-white/5 hover:border-primary/40 hover:bg-white/10 transition-all text-xs font-bold text-white flex items-center justify-between group"
              >
                <span>{b.name}</span>
                <ExternalLink className="w-3 h-3 text-muted-foreground group-hover:text-primary transition-colors" />
              </a>
            ))}
          </div>

          <div className="space-y-2 pt-3 border-t border-white/5">
            <h4 className="text-xs font-black uppercase tracking-wider text-white">Targeted Advertising Opt-Out Alliances</h4>
            <p className="text-xs">
              You can also opt out of interest-based advertising through global self-regulatory organizations:
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <a href="http://www.aboutads.info/choices/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold text-primary hover:bg-white/10">
                Digital Advertising Alliance (DAA) <ExternalLink className="w-3 h-3" />
              </a>
              <a href="https://youradchoices.ca/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold text-primary hover:bg-white/10">
                DAA Canada (DAAC) <ExternalLink className="w-3 h-3" />
              </a>
              <a href="http://www.youronlinechoices.com/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold text-primary hover:bg-white/10">
                European Interactive DAA (EDAA) <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'web-beacons',
      number: 6,
      title: 'What About Other Tracking Technologies (Web Beacons)?',
      content: (
        <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
          <p>
            Cookies are not the only way to recognize or track visitors to a website. We may use other, similar technologies from time to time, like web beacons (sometimes called "tracking pixels" or "clear gifs").
          </p>
          <p className="text-xs">
            These tiny graphics files contain a unique identifier that enables us to recognize when someone has visited our Website or opened an email sent by us. This allows us to monitor traffic patterns, deliver or communicate with cookies, understand referral sources, improve site performance, and measure the success of email communications.
          </p>
        </div>
      )
    },
    {
      id: 'flash-cookies',
      number: 7,
      title: 'Do You Use Flash Cookies or Local Shared Objects (LSOs)?',
      content: (
        <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
          <p>
            Websites may use "Flash Cookies" (also known as Local Shared Objects or "LSOs") to collect and store information about your use of our services, fraud prevention, and for other site operations.
          </p>
          <p className="text-xs">
            If you do not want Flash Cookies stored on your computer, you can adjust the settings of your Flash player using the{' '}
            <a href="http://www.macromedia.com/support/documentation/en/flashplayer/help/settings_manager07.html" target="_blank" rel="noreferrer" className="text-primary underline font-bold">
              Website Storage Settings Panel
            </a>{' '}
            or the{' '}
            <a href="http://www.macromedia.com/support/documentation/en/flashplayer/help/settings_manager03.html" target="_blank" rel="noreferrer" className="text-primary underline font-bold">
              Global Storage Settings Panel
            </a>.
          </p>
        </div>
      )
    },
    {
      id: 'targeted-advertising',
      number: 8,
      title: 'Do You Serve Targeted Advertising?',
      content: (
        <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
          <p>
            Third parties may serve cookies on your computer or mobile device to serve advertising through our Website. These companies may use information about your visits to this and other websites in order to provide relevant advertisements about goods and services of potential interest to you.
          </p>
          <p className="text-xs">
            The information collected through this process does not enable us or them to identify your name, contact details, or other directly identifying personal details unless you voluntarily choose to provide them.
          </p>
        </div>
      )
    },
    {
      id: 'updates',
      number: 9,
      title: 'How Often Will You Update This Cookie Policy?',
      content: (
        <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
          <p>
            We may update this Cookie Policy from time to time in order to reflect changes to the cookies we use or for other operational, legal, or regulatory reasons. Please revisit this policy periodically to stay informed about our use of cookies and related technologies.
          </p>
          <p className="text-xs font-semibold text-white">
            The date at the top of this Cookie Policy indicates when it was last updated.
          </p>
        </div>
      )
    },
    {
      id: 'contact',
      number: 10,
      title: 'Where Can I Get Further Information?',
      content: (
        <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
          <p>If you have any questions about our use of cookies or other technologies, please contact us:</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
              <div className="flex items-center gap-2 text-primary font-bold text-xs">
                <Mail className="w-4 h-4" /> Email Inquiries
              </div>
              <p className="text-xs text-white font-mono">streamaura01@gmail.com</p>
              <p className="text-[11px] text-muted-foreground">Direct Legal & Privacy Desk</p>
            </div>
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
              <div className="flex items-center gap-2 text-primary font-bold text-xs">
                <Phone className="w-4 h-4" /> Phone Support
              </div>
              <p className="text-xs text-white font-mono">(+234) 806 059 3953</p>
              <p className="text-[11px] text-muted-foreground">Customer Assistance Line</p>
            </div>
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
              <div className="flex items-center gap-2 text-primary font-bold text-xs">
                <MapPin className="w-4 h-4" /> Postal Address
              </div>
              <p className="text-xs text-white font-medium">StreamAura</p>
              <p className="text-xs text-muted-foreground">22 Oguntolu St, Shomolu<br />Lagos 100001, Nigeria</p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20 space-y-3 pt-4">
            <div className="flex items-center gap-2 text-white font-black text-xs uppercase tracking-wider">
              <FileCheck className="w-4 h-4 text-primary" /> Termly Consent & Data Subject Access
            </div>
            <p className="text-xs text-muted-foreground">
              To review, update, or revoke your cookie consent preferences and data subject access records, visit our Termly portal:
            </p>
            <Button 
              asChild
              className="rounded-xl text-xs font-bold gap-2 bg-primary hover:bg-primary/80 text-white"
            >
              <a 
                href="https://app.termly.io/dsar/7e015be7-b6ca-431b-8aa5-c66c92685e6a" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="flex items-center gap-1.5"
              >
                Access Cookie Consent Portal <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </Button>
          </div>
        </div>
      )
    }
  ], []);

  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return sections;
    const q = searchQuery.toLowerCase();
    return sections.filter(sec => 
      sec.title.toLowerCase().includes(q) || 
      sec.number.toString().includes(q) ||
      sec.id.toLowerCase().includes(q)
    );
  }, [sections, searchQuery]);

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-32 animate-in fade-in duration-500">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 sm:p-8 rounded-3xl glass-card border-white/10 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none -z-10" />
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold uppercase tracking-wider">
            <Cookie className="w-3.5 h-3.5" /> Official Cookie Notice
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-black uppercase tracking-tight text-white">
            Cookie Policy
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Last updated <span className="text-white font-semibold">September 05, 2026</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handlePrint}
            className="h-8 rounded-xl text-[10px] font-black uppercase tracking-wider border-white/10 gap-1.5 hover:bg-white/10"
          >
            <Printer className="w-3.5 h-3.5" /> Print / Save PDF
          </Button>
        </div>
      </div>

      {/* Overview Card */}
      <Card className="glass-card p-6 sm:p-8 border-white/10 space-y-4">
        <div className="flex items-center gap-2 text-primary font-black text-xs uppercase tracking-widest">
          <Cookie className="w-4 h-4" /> StreamAura Cookie & Storage Policy
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
          This Cookie Policy explains how <strong className="text-white">StreamAura</strong> ("Company," "we," "us," and "our") uses cookies and similar technologies to recognize you when you visit our website at{' '}
          <a href="https://www.streamaura.site" className="text-primary underline font-semibold" target="_blank" rel="noreferrer">
            https://www.streamaura.site
          </a>. It explains what these technologies are and why we use them, as well as your rights to control our use of them.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <div className="p-3 rounded-2xl bg-white/5 border border-white/5 space-y-1">
            <span className="text-[10px] uppercase tracking-widest font-black text-amber-400">Local Cache First</span>
            <p className="text-xs text-muted-foreground">Download history & theme preferences stay securely on your device.</p>
          </div>
          <div className="p-3 rounded-2xl bg-white/5 border border-white/5 space-y-1">
            <span className="text-[10px] uppercase tracking-widest font-black text-primary">Full Control</span>
            <p className="text-xs text-muted-foreground">Easily manage or clear cookies through your web browser controls.</p>
          </div>
          <div className="p-3 rounded-2xl bg-white/5 border border-white/5 space-y-1">
            <span className="text-[10px] uppercase tracking-widest font-black text-emerald-400">PWA Optimized</span>
            <p className="text-xs text-muted-foreground">Persistent tokens ensure seamless offline and mobile app functionality.</p>
          </div>
        </div>
      </Card>

      {/* Search & Quick Navigation Table of Contents */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            <h3 className="text-xs font-black uppercase tracking-widest text-white">Table of Contents</h3>
          </div>
          
          {/* Search Bar */}
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text"
              placeholder="Search cookie topics (e.g., storage, browser)..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-9 pr-3 text-xs outline-none focus:border-primary/50 text-white placeholder:text-muted-foreground/60"
            />
          </div>
        </div>

        {/* TOC Quick Jump Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          {sections.map(sec => (
            <button
              key={sec.id}
              onClick={() => scrollToSection(sec.id)}
              className={`p-2.5 rounded-xl text-left text-[11px] font-bold border transition-all truncate flex items-center gap-1.5 ${
                activeSection === sec.id
                  ? 'bg-primary text-white border-primary shadow-md shadow-primary/20'
                  : 'bg-white/5 border-white/5 text-muted-foreground hover:text-white hover:bg-white/10 hover:border-white/10'
              }`}
            >
              <span className="font-mono text-[9px] opacity-60 flex-shrink-0">{sec.number}.</span>
              <span className="truncate">{sec.title}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Sections */}
      <div className="space-y-6">
        {filteredSections.map(sec => (
          <div
            key={sec.id}
            id={sec.id}
            className="scroll-mt-24"
          >
            <Card className="glass-card p-6 sm:p-8 border-white/10 space-y-4 hover:border-primary/30 transition-all">
              <div className="flex items-center gap-3 border-b border-white/5 pb-3">
                <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center text-primary text-xs font-black border border-primary/30">
                  {sec.number}
                </div>
                <h3 className="text-base sm:text-lg font-black uppercase tracking-tight text-white">
                  {sec.title}
                </h3>
              </div>
              <div>
                {sec.content}
              </div>
            </Card>
          </div>
        ))}

        {filteredSections.length === 0 && (
          <div className="text-center py-16 p-8 glass-card border-white/10 rounded-3xl space-y-3">
            <Search className="w-8 h-8 text-muted-foreground mx-auto" />
            <h4 className="text-sm font-black uppercase tracking-wider text-white">No Matching Sections Found</h4>
            <p className="text-xs text-muted-foreground">
              Try searching with another keyword or clear the search filter.
            </p>
            <Button size="sm" variant="outline" onClick={() => setSearchQuery('')} className="rounded-xl text-[10px] font-black uppercase">
              Clear Search
            </Button>
          </div>
        )}
      </div>

      {/* Footer Acknowledgement */}
      <div className="p-6 rounded-3xl bg-white/5 border border-white/10 text-center space-y-2">
        <p className="text-xs text-muted-foreground font-medium">
          This Cookie Policy was generated using Termly's Cookie Consent Manager and customized for StreamAura.
        </p>
        <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">
          StreamAura Data Protection & Privacy Team • Lagos, Nigeria
        </p>
      </div>
    </div>
  );
};

export default CookiePolicy;
