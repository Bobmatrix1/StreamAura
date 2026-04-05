import React from 'react';
import { Shield, EyeOff, Lock, Database, Server, UserCheck } from 'lucide-react';

const PrivacyPolicy: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto space-y-12 pb-32">
      <div className="text-center space-y-4">
        <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-green-500/20">
          <Shield className="w-10 h-10 text-white" />
        </div>
        <h2 className="text-4xl font-bold gradient-text text-green-400">Privacy Policy</h2>
        <p className="text-muted-foreground">Your privacy is our highest priority at StreamAura.</p>
      </div>

      <div className="glass-card p-8 md:p-12 space-y-10">
        <section className="space-y-4">
          <h3 className="text-xl font-bold flex items-center gap-3">
            <Lock className="w-5 h-5 text-green-400" /> Data Protection
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            At StreamAura, we believe in radical transparency. We do not sell, rent, or trade your personal 
            data with third parties. Most of the data processed by the app (like your download history) 
            stays exclusively on your device.
          </p>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="p-6 rounded-2xl bg-white/5 border border-white/5 space-y-3">
            <div className="flex items-center gap-3 text-green-400">
              <EyeOff className="w-5 h-5" />
              <h4 className="font-bold">What we DON'T track</h4>
            </div>
            <ul className="text-xs text-muted-foreground space-y-2 list-disc pl-4">
              <li>Your specific download links or file contents.</li>
              <li>Your browsing history outside of StreamAura.</li>
              <li>Your device's precise location data.</li>
              <li>Personal files stored on your phone or computer.</li>
            </ul>
          </div>

          <div className="p-6 rounded-2xl bg-white/5 border border-white/5 space-y-3">
            <div className="flex items-center gap-3 text-blue-400">
              <Database className="w-5 h-5" />
              <h4 className="font-bold">What we DO collect</h4>
            </div>
            <ul className="text-xs text-muted-foreground space-y-2 list-disc pl-4">
              <li>Anonymous usage statistics (which tabs are clicked).</li>
              <li>Device type (Android/iOS/Desktop) for layout optimization.</li>
              <li>General country-level location for server selection.</li>
              <li>Email address (only for registered accounts).</li>
            </ul>
          </div>
        </div>

        <section className="space-y-4 pt-6 border-t border-white/5">
          <h3 className="text-xl font-bold flex items-center gap-3">
            <Server className="w-5 h-5 text-purple-400" /> Third-Party Services
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We use Firebase (a Google service) to handle secure authentication and basic analytics. 
            We also interface with various media platforms (YouTube, Spotify, etc.) only when you 
            request a specific download. These platforms may collect data according to their own 
            privacy policies.
          </p>
        </section>

        <section className="space-y-4 pt-6 border-t border-white/5">
          <h3 className="text-xl font-bold flex items-center gap-3">
            <UserCheck className="w-5 h-5 text-cyan-400" /> Your Rights
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            You have the right to delete your account and all associated data at any time. 
            You can clear your local download history directly from the <strong>History</strong> tab. 
            For a full account deletion or to export your data, please reach out to us via 
            the <strong>Contact Us</strong> page. We comply with global privacy standards 
            including GDPR and CCPA.
          </p>
        </section>

        <div className="p-4 rounded-xl bg-green-500/5 border border-green-500/10 text-center">
          <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">
            Last Updated: April 2026 • StreamAura Legal Team
          </p>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
