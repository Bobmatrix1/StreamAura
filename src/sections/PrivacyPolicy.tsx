import React, { useState, useMemo } from 'react';
import { 
  Shield, 
  ShieldCheck, 
  EyeOff, 
  Database, 
  Globe, 
  Search, 
  Mail, 
  MapPin, 
  CheckCircle2, 
  Printer, 
  FileText, 
  ExternalLink,
  CreditCard,
  UserCheck,
  Share2,
  Cookie,
  FileCheck,
  Sliders
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

export const PrivacyPolicy: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const sections: Section[] = useMemo(() => [
    {
      id: 'infocollect',
      number: 1,
      title: 'What Information Do We Collect?',
      content: (
        <div className="space-y-6 text-sm text-muted-foreground leading-relaxed">
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-primary" /> Personal Information You Disclose to Us
            </h4>
            <div className="p-3 rounded-xl bg-white/5 border border-white/5 text-xs text-muted-foreground">
              <strong className="text-white">In Short:</strong> We collect personal information that you voluntarily provide to us when you register on the Services, express interest in our products and Services, participate in activities on the Services, or contact us.
            </div>
            <p>
              The personal information we collect depends on the context of your interactions with us, your choices, and the features you use. This may include:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
              {[
                'Full Names & Aliases',
                'Phone Numbers',
                'Email Addresses',
                'Mailing Addresses',
                'Usernames & Passwords',
                'Contact Preferences',
                'Authentication Data'
              ].map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2.5 rounded-xl bg-white/5 border border-white/5 text-xs text-white">
                  <CheckCircle2 className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3 pt-3 border-t border-white/5">
            <h4 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
              <EyeOff className="w-4 h-4 text-emerald-400" /> Sensitive Personal Information
            </h4>
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-medium">
              <strong>We do not process sensitive personal information.</strong> We do not collect or process sensitive categories such as racial or ethnic origins, sexual orientation, genetic data, biometric identifiers, health information, or religious beliefs.
            </div>
          </div>

          <div className="space-y-3 pt-3 border-t border-white/5">
            <h4 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-amber-400" /> Payment Data & Billing
            </h4>
            <p>
              We may collect data necessary to process your payments if you make purchases (such as subscriptions, virtual tickets, or cinema refreshments). All payment data is handled, encrypted, and securely processed by our authorized payment partner:
            </p>
            <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-white">TransactPay (Payment Processor)</p>
                <p className="text-[11px] text-muted-foreground">PCI-DSS compliant payment processing & financial gateway.</p>
              </div>
              <a 
                href="https://www.transactpay.ai/legal" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
              >
                TransactPay Privacy Notice <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          <div className="space-y-3 pt-3 border-t border-white/5">
            <h4 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-400" /> Information Automatically Collected
            </h4>
            <div className="p-3 rounded-xl bg-white/5 border border-white/5 text-xs text-muted-foreground">
              <strong className="text-white">In Short:</strong> Some information — such as your Internet Protocol (IP) address, browser, and device characteristics — is collected automatically when you visit our Services.
            </div>
            <p>
              This technical information is primarily needed to maintain the security and operation of our Services, prevent fraud, and for our internal analytics and performance reporting:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs">
              <li><strong className="text-white">Log and Usage Data:</strong> Server log files, IP addresses, browser types, date/time stamps, viewed pages/tools, error reports, and hardware settings.</li>
              <li><strong className="text-white">Device Data:</strong> Computer/mobile device type, operating system, application identification numbers, and system configuration.</li>
              <li><strong className="text-white">Location Data:</strong> Imprecise geographic location derived from IP address for regional server routing and latency optimization.</li>
            </ul>
          </div>

          <div className="space-y-3 pt-3 border-t border-white/5">
            <h4 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
              <Globe className="w-4 h-4 text-cyan-400" /> Google API Services Compliance
            </h4>
            <p className="text-xs">
              StreamAura's use of information received from Google APIs adheres to the{' '}
              <a 
                href="https://developers.google.com/terms/api-services-user-data-policy" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-primary underline font-semibold"
              >
                Google API Services User Data Policy
              </a>
              , including the{' '}
              <a 
                href="https://developers.google.com/terms/api-services-user-data-policy#limited-use" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-primary underline font-semibold"
              >
                Limited Use requirements
              </a>.
            </p>
          </div>
        </div>
      )
    },
    {
      id: 'infouse',
      number: 2,
      title: 'How Do We Process Your Information?',
      content: (
        <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
          <div className="p-3 rounded-xl bg-white/5 border border-white/5 text-xs text-muted-foreground">
            <strong className="text-white">In Short:</strong> We process your information to provide, improve, and administer our Services, communicate with you, ensure security and fraud prevention, and comply with law.
          </div>
          <p>We process your personal information for a variety of legitimate operational reasons, including:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {[
              {
                title: 'Account Creation & Authentication',
                desc: 'To facilitate registration, login verification, session management, and keep accounts in working order.'
              },
              {
                title: 'Administrative Notices',
                desc: 'To send service alerts, security updates, changes to legal terms, and transaction receipts.'
              },
              {
                title: 'User-to-User Communications',
                desc: 'To enable cinema room live chat, watch party comments, and vendor interactions when enabled.'
              },
              {
                title: 'Service Protection & Safety',
                desc: 'To monitor against fraud, prevent security breaches, and enforce our platform terms.'
              },
              {
                title: 'Personalized Experiences',
                desc: 'To tailor media recommendations, display relevant content, and improve user engagement.'
              },
              {
                title: 'Feedback & Support',
                desc: 'To respond to customer support inquiries and evaluate feedback for platform enhancements.'
              },
              {
                title: 'Usage Trends & Analytics',
                desc: 'To analyze aggregated usage patterns, optimize streaming speeds, and improve UI design.'
              },
              {
                title: 'Protecting Vital Interests',
                desc: 'To prevent serious harm or protect the health and safety of users in emergency scenarios.'
              }
            ].map((item, idx) => (
              <div key={idx} className="p-3.5 rounded-xl bg-white/5 border border-white/5 space-y-1">
                <h5 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-primary" /> {item.title}
                </h5>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )
    },
    {
      id: 'legalbases',
      number: 3,
      title: 'What Legal Bases Do We Rely On?',
      content: (
        <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
          <div className="p-3 rounded-xl bg-white/5 border border-white/5 text-xs text-muted-foreground">
            <strong className="text-white">In Short:</strong> We only process your personal information when we have a valid legal reason under applicable data protection laws.
          </div>
          
          <div className="space-y-3 pt-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-white">If you are located in the EU or UK (GDPR):</h4>
            <ul className="list-disc pl-5 space-y-2 text-xs">
              <li><strong className="text-white">Consent:</strong> Where you have given explicit permission for a specific processing purpose (which you can withdraw at any time).</li>
              <li><strong className="text-white">Performance of a Contract:</strong> When processing is necessary to fulfill our service agreement (e.g. streaming, cinema rooms, downloads).</li>
              <li><strong className="text-white">Legitimate Interests:</strong> When reasonably required for our legitimate business operations (analytics, security, user experience) without overriding your fundamental rights.</li>
              <li><strong className="text-white">Legal Obligations:</strong> Compliance with applicable laws, court orders, tax reporting, or law enforcement requests.</li>
              <li><strong className="text-white">Vital Interests:</strong> Protecting the safety and critical health interests of any individual.</li>
            </ul>
          </div>

          <div className="space-y-2 pt-3 border-t border-white/5">
            <h4 className="text-xs font-black uppercase tracking-wider text-white">If you are located in Canada:</h4>
            <p className="text-xs">
              We process data based on express or implied consent in accordance with Canadian privacy standards, with statutory exceptions for fraud detection, legal proceedings, or authorized business transactions.
            </p>
          </div>
        </div>
      )
    },
    {
      id: 'whoshare',
      number: 4,
      title: 'When and With Whom Do We Share Personal Information?',
      content: (
        <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
          <div className="p-3 rounded-xl bg-white/5 border border-white/5 text-xs text-muted-foreground">
            <strong className="text-white">In Short:</strong> We may share information in specific situations described below with verified service partners.
          </div>
          <div className="space-y-3">
            <div className="p-3.5 rounded-xl bg-white/5 border border-white/5 space-y-1">
              <h5 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Share2 className="w-3.5 h-3.5 text-primary" /> Business Transfers
              </h5>
              <p className="text-xs text-muted-foreground">
                In connection with or during negotiations of any merger, sale of company assets, financing, or acquisition of our business by another organization.
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-white/5 border border-white/5 space-y-1">
              <h5 className="text-xs font-bold text-white flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-400" /> Affiliates & Subsidiaries
              </h5>
              <p className="text-xs text-muted-foreground">
                With our corporate affiliates, who will be bound to honor and comply with the obligations of this Privacy Notice.
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-white/5 border border-white/5 space-y-1">
              <h5 className="text-xs font-bold text-white flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-emerald-400" /> Other Users (Public Interactions)
              </h5>
              <p className="text-xs text-muted-foreground">
                When you post public reviews, participate in cinema room chatrooms, or display your public profile, other users in the session can view your contributions.
              </p>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'cookies',
      number: 5,
      title: 'Do We Use Cookies and Other Tracking Technologies?',
      content: (
        <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
          <div className="p-3 rounded-xl bg-white/5 border border-white/5 text-xs text-muted-foreground">
            <strong className="text-white">In Short:</strong> We use cookies and similar technologies to enhance security, remember preferences, and analyze platform usage.
          </div>
          <p>
            Cookies help us keep your login session active, save dark/light theme preferences, and prevent malicious bot access. For a full breakdown of specific cookies and local storage keys, see our{' '}
            <a href="?tab=cookies" className="text-primary font-bold underline">Cookie Policy</a>.
          </p>
          <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-2">
            <h5 className="text-xs font-bold text-white flex items-center gap-2">
              <Cookie className="w-4 h-4 text-amber-400" /> Google Analytics & Measurement
            </h5>
            <p className="text-xs text-muted-foreground">
              We may use Google Analytics to understand traffic flow and performance. You can opt out of Google Analytics tracking at any time by installing the official{' '}
              <a 
                href="https://tools.google.com/dlpage/gaoptout" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-primary underline font-semibold"
              >
                Google Analytics Opt-out Browser Add-on
              </a>{' '}
              or visiting{' '}
              <a 
                href="https://adssettings.google.com/" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-primary underline font-semibold"
              >
                Google Ads Settings
              </a>.
            </p>
          </div>
        </div>
      )
    },
    {
      id: 'sociallogins',
      number: 6,
      title: 'How Do We Handle Your Social Logins?',
      content: (
        <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
          <div className="p-3 rounded-xl bg-white/5 border border-white/5 text-xs text-muted-foreground">
            <strong className="text-white">In Short:</strong> If you choose to log in using a social media account (like Facebook or X), we receive limited profile details.
          </div>
          <p>
            When registering via third-party providers, we receive profile information (such as your name, email address, and profile photo) strictly for authentication and account creation. We do not access your private passwords or publish to your social feed without your explicit consent.
          </p>
        </div>
      )
    },
    {
      id: 'inforetain',
      number: 7,
      title: 'How Long Do We Keep Your Information?',
      content: (
        <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
          <div className="p-3 rounded-xl bg-white/5 border border-white/5 text-xs text-muted-foreground">
            <strong className="text-white">In Short:</strong> We keep your information for as long as you maintain an active account with us, or as needed for legal and financial compliance.
          </div>
          <p>
            When we have no ongoing legitimate business need to process your personal data, we will either permanently delete or anonymize it. If data is stored in archived backup systems, it is securely isolated until standard retention cycles purge the data.
          </p>
        </div>
      )
    },
    {
      id: 'infosafe',
      number: 8,
      title: 'How Do We Keep Your Information Safe?',
      content: (
        <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
          <div className="p-3 rounded-xl bg-white/5 border border-white/5 text-xs text-muted-foreground">
            <strong className="text-white">In Short:</strong> We aim to protect your personal information through robust technical, administrative, and organizational security measures.
          </div>
          <p>
            We implement industry-standard SSL encryption, secure tokens, hashed credentials, and server firewall protections. However, no transmission over the internet can be guaranteed 100% invulnerable, and we recommend accessing StreamAura within a secure internet environment.
          </p>
        </div>
      )
    },
    {
      id: 'infominors',
      number: 9,
      title: 'Do We Collect Information From Minors?',
      content: (
        <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
          <div className="p-3 rounded-xl bg-white/5 border border-white/5 text-xs text-muted-foreground">
            <strong className="text-white">In Short:</strong> We do not knowingly collect data from or market to children under 18 years of age.
          </div>
          <p>
            By using the Services, you represent that you are at least 18 years old or have parental/guardian consent. If we learn that personal information from users under 18 has been collected without valid consent, we will promptly deactivate the account and delete the data.
          </p>
          <p className="text-xs">
            If you believe a minor's information has been provided to us, please notify us immediately at <span className="text-primary font-bold">streamaura01@gmail.com</span>.
          </p>
        </div>
      )
    },
    {
      id: 'privacyrights',
      number: 10,
      title: 'What Are Your Privacy Rights?',
      content: (
        <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
          <div className="p-3 rounded-xl bg-white/5 border border-white/5 text-xs text-muted-foreground">
            <strong className="text-white">In Short:</strong> Depending on your location (such as the EEA, UK, Switzerland, Canada, or US states), you have rights to access, update, export, or delete your personal information.
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {[
              { title: 'Right to Access & Portability', desc: 'Request a copy of the personal data we hold about you in a standard readable format.' },
              { title: 'Right to Rectification', desc: 'Request corrections to any inaccurate, outdated, or incomplete personal details.' },
              { title: 'Right to Erasure (Deletion)', desc: 'Request deletion of your account data and personal records from our active systems.' },
              { title: 'Right to Withdraw Consent', desc: 'Withdraw previously given consent at any time without affecting past lawful processing.' }
            ].map((r, idx) => (
              <div key={idx} className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-1">
                <h5 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-primary" /> {r.title}
                </h5>
                <p className="text-xs text-muted-foreground">{r.desc}</p>
              </div>
            ))}
          </div>

          <div className="space-y-2 pt-3 border-t border-white/5">
            <h4 className="text-xs font-black uppercase tracking-wider text-white">UK & European Supervisory Authorities</h4>
            <p className="text-xs">
              If you are located in the UK and feel your inquiry has not been satisfactorily handled, you may lodge a complaint with the Information Commissioner's Office (ICO):
            </p>
            <div className="p-3 rounded-xl bg-white/5 border border-white/5 text-xs space-y-1">
              <p><strong className="text-white">Website:</strong> <a href="https://ico.org.uk/make-a-complaint" target="_blank" rel="noreferrer" className="text-primary underline">ico.org.uk/make-a-complaint</a></p>
              <p><strong className="text-white">Helpline:</strong> 0303 123 1113</p>
              <p><strong className="text-white">Address:</strong> Information Commissioner's Office, Wycliffe House, Water Lane, Wilmslow, Cheshire, SK9 5AF</p>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'DNT',
      number: 11,
      title: 'Controls for Do-Not-Track & Global Privacy Control',
      content: (
        <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
          <div className="space-y-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-white">Do-Not-Track (DNT)</h4>
            <p className="text-xs">
              Because no uniform technological standard has been finalized for recognizing DNT signals across all browsers, our platform currently does not respond to automated DNT headers.
            </p>
          </div>

          <div className="space-y-2 pt-3 border-t border-white/5">
            <h4 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-primary" /> Global Privacy Control (GPC) Recognition
            </h4>
            <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/20 text-xs text-white space-y-1.5">
              <p className="font-bold text-primary">We recognize and honor Global Privacy Control (GPC) signals.</p>
              <p className="text-muted-foreground">
                If your browser or privacy extension broadcasts a GPC signal, we will treat it as a valid, automated request to opt out of the sale, sharing, or targeted advertising of your data under the California Consumer Privacy Act (CCPA) and applicable state laws. Learn more at{' '}
                <a href="https://globalprivacycontrol.org" target="_blank" rel="noopener noreferrer" className="text-primary underline font-bold">
                  globalprivacycontrol.org
                </a>.
              </p>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'uslaws',
      number: 12,
      title: 'Do United States Residents Have Specific Privacy Rights?',
      content: (
        <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
          <div className="p-3 rounded-xl bg-white/5 border border-white/5 text-xs text-muted-foreground">
            <strong className="text-white">In Short:</strong> Residents of California, Colorado, Connecticut, Delaware, Florida, Indiana, Iowa, Kentucky, Maryland, Minnesota, Montana, Nebraska, New Hampshire, New Jersey, Oregon, Rhode Island, Tennessee, Texas, Utah, and Virginia have specific statutory rights.
          </div>

          <div className="space-y-2 pt-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-white">Categories of Personal Information Collected (Past 12 Months)</h4>
            
            {/* Glass Table */}
            <div className="overflow-x-auto rounded-2xl border border-white/10">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/5 border-b border-white/10 text-[11px] font-black uppercase tracking-wider text-white">
                  <tr>
                    <th className="p-3">Category</th>
                    <th className="p-3">Examples</th>
                    <th className="p-3 text-center">Collected</th>
                    <th className="p-3">Retention</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {[
                    { cat: 'A. Identifiers', ex: 'Real name, postal address, phone, IP address, email, account username', col: true, ret: 'Duration of account' },
                    { cat: 'B. Customer Records (CA)', ex: 'Name, contact info, payment records, billing address', col: true, ret: 'Duration of account' },
                    { cat: 'C. Protected Classifications', ex: 'Gender, age, date of birth, race, national origin', col: false, ret: 'N/A' },
                    { cat: 'D. Commercial Information', ex: 'Transaction history, payment details, refreshments purchases', col: true, ret: 'Duration of account' },
                    { cat: 'E. Biometric Information', ex: 'Fingerprints, voiceprints, facial geometry', col: false, ret: 'N/A' },
                    { cat: 'F. Internet / Network Activity', ex: 'External browsing history across third-party websites', col: false, ret: 'N/A' },
                    { cat: 'G. Geolocation Data', ex: 'Device location (city/country derived from IP)', col: true, ret: 'Duration of account' },
                    { cat: 'H. Audio / Sensory Data', ex: 'Call recordings, ambient sensory data', col: false, ret: 'N/A' },
                    { cat: 'I. Professional / Employment', ex: 'Job history, resumes (for job applicants)', col: false, ret: 'N/A' },
                    { cat: 'J. Education Information', ex: 'Student records, academic transcripts', col: false, ret: 'N/A' },
                    { cat: 'K. Inferences', ex: 'Psychological profiles or consumer behavior models', col: false, ret: 'N/A' },
                    { cat: 'L. Sensitive Personal Information', ex: 'Government ID, religious beliefs, sexual orientation', col: false, ret: 'N/A' },
                  ].map((row, idx) => (
                    <tr key={idx} className="hover:bg-white/[0.02]">
                      <td className="p-3 font-bold text-white whitespace-nowrap">{row.cat}</td>
                      <td className="p-3 text-muted-foreground">{row.ex}</td>
                      <td className="p-3 text-center">
                        <Badge variant="outline" className={row.col ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]" : "bg-white/5 text-muted-foreground border-white/5 text-[10px]"}>
                          {row.col ? "YES" : "NO"}
                        </Badge>
                      </td>
                      <td className="p-3 text-[11px] font-mono text-muted-foreground whitespace-nowrap">{row.ret}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-white/5 border border-white/5 text-xs text-muted-foreground">
            <strong className="text-white">Sales & Sharing Statement:</strong> StreamAura has not sold or shared any personal information in the preceding twelve (12) months and will not sell consumer data in the future.
          </div>
        </div>
      )
    },
    {
      id: 'otherlaws',
      number: 13,
      title: 'Do Other Regions Have Specific Privacy Rights?',
      content: (
        <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-white">Australia & New Zealand</h4>
            <p className="text-xs">
              We process personal information under Australia's Privacy Act 1988 and New Zealand's Privacy Act 2020. You may submit privacy inquiries or lodge complaints with the Office of the Australian Information Commissioner (OAIC) or the Office of the Privacy Commissioner (NZ).
            </p>
          </div>

          <div className="space-y-3 pt-3 border-t border-white/5">
            <h4 className="text-xs font-black uppercase tracking-wider text-white">Republic of South Africa (POPIA / PAIA)</h4>
            <p className="text-xs">
              You have the right to request access to and correction of your personal data. Unresolved complaints may be directed to The Information Regulator (South Africa) at <span className="text-primary font-mono">PAIAComplaints@inforegulator.org.za</span> or <span className="text-primary font-mono">POPIAComplaints@inforegulator.org.za</span>.
            </p>
          </div>
        </div>
      )
    },
    {
      id: 'policyupdates',
      number: 14,
      title: 'Do We Make Updates to This Notice?',
      content: (
        <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
          <div className="p-3 rounded-xl bg-white/5 border border-white/5 text-xs text-muted-foreground">
            <strong className="text-white">In Short:</strong> Yes, we update this notice as necessary to remain compliant with relevant laws and platform enhancements.
          </div>
          <p>
            The updated version will be indicated by the revised date at the top of the policy. We encourage you to review this notice periodically.
          </p>
        </div>
      )
    },
    {
      id: 'contact',
      number: 15,
      title: 'How Can You Contact Us About This Notice?',
      content: (
        <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
          <p>If you have questions, comments, or data privacy requests regarding this notice, please reach out to us:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
              <div className="flex items-center gap-2 text-primary font-bold text-xs">
                <Mail className="w-4 h-4" /> Email Inquiries
              </div>
              <p className="text-xs text-white font-mono">streamaura01@gmail.com</p>
              <p className="text-[11px] text-muted-foreground">Privacy Officer & Legal Support</p>
            </div>
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
              <div className="flex items-center gap-2 text-primary font-bold text-xs">
                <MapPin className="w-4 h-4" /> Postal Address
              </div>
              <p className="text-xs text-white font-medium">StreamAura</p>
              <p className="text-xs text-muted-foreground">22 Oguntolu Street, Shomolu<br />Lagos State, 100001, Nigeria</p>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'request',
      number: 16,
      title: 'How Can You Review, Update, or Delete Your Data?',
      content: (
        <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
          <p>
            Based on the applicable laws of your country or jurisdiction, you have the right to request access to the personal information we collect from you, review details, rectify errors, or request complete account data deletion.
          </p>
          <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20 space-y-3">
            <div className="flex items-center gap-2 text-white font-black text-xs uppercase tracking-wider">
              <FileCheck className="w-4 h-4 text-primary" /> Data Subject Access Request (DSAR)
            </div>
            <p className="text-xs text-muted-foreground">
              To submit a formal automated data access or deletion request, please use our secure Termly DSAR portal:
            </p>
            <Button 
              asChild
              className="rounded-xl text-xs font-bold gap-2 bg-primary hover:bg-primary/80 text-white"
            >
              <a 
                href="https://app.termly.io/dsar/418f0129-b922-4e06-bc03-b60a97828e18" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="flex items-center gap-1.5"
              >
                Submit Data Access / Deletion Request <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            You can also modify your profile details directly in your <strong className="text-white">Account Settings</strong> or request deletion by emailing us at <strong className="text-white font-mono">streamaura01@gmail.com</strong>.
          </p>
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
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none -z-10" />
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider">
            <ShieldCheck className="w-3.5 h-3.5" /> Official Privacy Notice
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-black uppercase tracking-tight text-white">
            Privacy Policy
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Last updated <span className="text-white font-semibold">September 01, 2026</span>
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
          <Shield className="w-4 h-4" /> StreamAura Privacy Commitment
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
          This Privacy Notice for <strong className="text-white">StreamAura</strong> ("we," "us," or "our") describes how and why we collect, store, process, and protect your personal information when you use our services at{' '}
          <a href="https://www.streamaura.site" className="text-primary underline font-semibold" target="_blank" rel="noreferrer">
            https://www.streamaura.site
          </a>, virtual cinema streaming rooms, mobile applications, media tools, and refreshments store.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <div className="p-3 rounded-2xl bg-white/5 border border-white/5 space-y-1">
            <span className="text-[10px] uppercase tracking-widest font-black text-emerald-400">Zero Sensitive Data</span>
            <p className="text-xs text-muted-foreground">We never collect or process sensitive personal, biometric, or religious data.</p>
          </div>
          <div className="p-3 rounded-2xl bg-white/5 border border-white/5 space-y-1">
            <span className="text-[10px] uppercase tracking-widest font-black text-blue-400">GPC Honored</span>
            <p className="text-xs text-muted-foreground">We automatically honor Global Privacy Control signals for browser opt-outs.</p>
          </div>
          <div className="p-3 rounded-2xl bg-white/5 border border-white/5 space-y-1">
            <span className="text-[10px] uppercase tracking-widest font-black text-purple-400">No Data Selling</span>
            <p className="text-xs text-muted-foreground">We do not and will never sell your personal information to data brokers.</p>
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
              placeholder="Search privacy topics (e.g., cookies, rights)..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-9 pr-3 text-xs outline-none focus:border-primary/50 text-white placeholder:text-muted-foreground/60"
            />
          </div>
        </div>

        {/* TOC Quick Jump Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
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
          This Privacy Policy was generated using Termly and customized specifically for StreamAura.
        </p>
        <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">
          StreamAura Data Protection & Privacy Team • Lagos, Nigeria
        </p>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
