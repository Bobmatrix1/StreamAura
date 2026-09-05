import React, { useState, useMemo } from 'react';
import { 
  FileText, 
  ShieldCheck, 
  Scale, 
  Search, 
  Mail, 
  MapPin, 
  CheckCircle2, 
  AlertTriangle, 
  Printer, 
  BookOpen
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

export const TermsOfUse: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const sections: Section[] = useMemo(() => [
    {
      id: 'our-services',
      number: 1,
      title: 'Our Services',
      content: (
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            The information provided when using the Services is not intended for distribution to or use by any person or entity in any jurisdiction or country where such distribution or use would be contrary to law or regulation or which would subject us to any registration requirement within such jurisdiction or country.
          </p>
          <p>
            Accordingly, those persons who choose to access the Services from other locations do so on their own initiative and are solely responsible for compliance with local laws, if and to the extent local laws are applicable.
          </p>
          <p>
            StreamAura provides multimedia streaming, cinema room experiences, media conversion and delivery tools, virtual room entertainment, and e-commerce refreshments accessible via <span className="text-primary font-bold">https://streamaura.site</span>.
          </p>
        </div>
      )
    },
    {
      id: 'intellectual-property',
      number: 2,
      title: 'Intellectual Property Rights',
      content: (
        <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
          <div className="space-y-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-white">Our Intellectual Property</h4>
            <p>
              We are the owner or the licensee of all intellectual property rights in our Services, including all source code, databases, functionality, software, website designs, audio, video, text, photographs, and graphics in the Services (collectively, the "Content"), as well as the trademarks, service marks, and logos contained therein (the "Marks").
            </p>
            <p>
              Our Content and Marks are protected by copyright and trademark laws (and various other intellectual property rights and unfair competition laws) and treaties around the world. The Content and Marks are provided in or through the Services "AS IS" for your personal, non-commercial use or internal business purpose only.
            </p>
          </div>

          <div className="space-y-2 pt-2 border-t border-white/5">
            <h4 className="text-xs font-black uppercase tracking-wider text-white">Your Use of Our Services</h4>
            <p>
              Subject to your compliance with these Legal Terms, including the "PROHIBITED ACTIVITIES" section below, we grant you a non-exclusive, non-transferable, revocable license to:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-xs">
              <li>Access the Services; and</li>
              <li>Download or print a copy of any portion of the Content to which you have properly gained access,</li>
            </ul>
            <p className="text-xs">
              Solely for your personal, non-commercial use or internal business purpose. Except as set out in this section or elsewhere in our Legal Terms, no part of the Services and no Content or Marks may be copied, reproduced, aggregated, republished, uploaded, posted, publicly displayed, encoded, translated, transmitted, distributed, sold, licensed, or otherwise exploited for any commercial purpose whatsoever, without our express prior written permission.
            </p>
            <p className="text-xs">
              If you wish to make any use of the Services, Content, or Marks other than as set out in this section, please address your request to: <span className="text-primary font-bold">streamaura01@gmail.com</span>.
            </p>
          </div>

          <div className="space-y-2 pt-2 border-t border-white/5">
            <h4 className="text-xs font-black uppercase tracking-wider text-white">Your Submissions</h4>
            <p>
              By directly sending us any question, comment, suggestion, idea, feedback, or other information about the Services ("Submissions"), you agree to assign to us all intellectual property rights in such Submission. You agree that we shall own this Submission and be entitled to its unrestricted use and dissemination for any lawful purpose, commercial or otherwise, without acknowledgment or compensation to you.
            </p>
          </div>
        </div>
      )
    },
    {
      id: 'user-representations',
      number: 3,
      title: 'User Representations',
      content: (
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>By using the Services, you represent and warrant that:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            {[
              'You have the legal capacity and agree to comply with these Legal Terms.',
              'You are not a minor in the jurisdiction in which you reside (or have legal guardian consent).',
              'You will not access the Services through automated or non-human means (bots, scripts).',
              'You will not use the Services for any illegal, unauthorized, or infringing purpose.',
              'Your use of the Services will not violate any applicable domestic or international law.'
            ].map((item, idx) => (
              <div key={idx} className="p-3 rounded-xl bg-white/5 border border-white/5 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                <span className="text-xs text-white/90 font-medium">{item}</span>
              </div>
            ))}
          </div>
          <p className="text-xs pt-2">
            If you provide any information that is untrue, inaccurate, not current, or incomplete, we have the right to suspend or terminate your account and refuse any and all current or future use of the Services.
          </p>
        </div>
      )
    },
    {
      id: 'prohibited-activities',
      number: 4,
      title: 'Prohibited Activities',
      content: (
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            You may not access or use the Services for any purpose other than that for which we make the Services available. The Services may not be used in connection with any unauthorized commercial endeavors.
          </p>
          <div className="space-y-2 pt-1 text-xs">
            <p className="font-bold text-white uppercase tracking-wider text-[11px]">As a user of the Services, you agree NOT to:</p>
            <ul className="list-disc pl-5 space-y-1.5 leading-relaxed">
              <li>Systematically retrieve data or other content from the Services to create or compile a collection, database, or directory without written permission from us.</li>
              <li>Trick, defraud, or mislead us and other users, especially in any attempt to learn sensitive account information such as passwords.</li>
              <li>Circumvent, disable, or interfere with security-related features of the Services or features that enforce limitations on Content usage.</li>
              <li>Disparage, tarnish, or otherwise harm, in our opinion, us and/or the Services.</li>
              <li>Use any information obtained from the Services in order to harass, abuse, or harm another person.</li>
              <li>Make improper use of our support services or submit false reports of abuse or misconduct.</li>
              <li>Upload or transmit viruses, Trojan horses, ransomware, spamming (continuous posting of repetitive text), or materials that alter or impair system performance.</li>
              <li>Engage in unauthorized framing of or linking to the Services.</li>
              <li>Attempt to impersonate another user or person or use the username of another user.</li>
              <li>Decipher, decompile, disassemble, or reverse engineer any of the software comprising or in any way making up a part of the Services.</li>
              <li>Use the Services as part of any effort to compete with us or create counterfeit streaming software.</li>
            </ul>
          </div>
        </div>
      )
    },
    {
      id: 'user-contributions',
      number: 5,
      title: 'User Generated Contributions',
      content: (
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            The Services may provide you with the opportunity to create, submit, post, display, transmit, or broadcast content and materials to us or on the Services, including but not limited to chat messages, room commentary, reviews, suggestions, profile pictures, or ratings (collectively, "Contributions").
          </p>
          <p>
            Contributions may be viewable by other users of the Services and through cinema live rooms. When you create or make available any Contributions, you represent and warrant that your Contributions do not infringe any proprietary copyright, patent, trademark, or moral rights of any third party.
          </p>
        </div>
      )
    },
    {
      id: 'contribution-license',
      number: 6,
      title: 'Contribution License',
      content: (
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            You and the Services agree that we may access, store, process, and use any information and personal data that you provide and your choices (including settings) in accordance with our Privacy Policy.
          </p>
          <p>
            By submitting suggestions or other feedback regarding the Services, you agree that we can use and share such feedback for any purpose without compensation to you.
          </p>
          <p>
            We do not assert any ownership over your Contributions. You retain full ownership of all of your Contributions and any intellectual property rights or other proprietary rights associated with your Contributions. You are solely responsible for your Contributions to the Services.
          </p>
        </div>
      )
    },
    {
      id: 'services-management',
      number: 7,
      title: 'Services Management',
      content: (
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>We reserve the right, but not the obligation, to:</p>
          <ul className="list-disc pl-5 space-y-1.5 text-xs">
            <li>Monitor the Services for violations of these Legal Terms;</li>
            <li>Take appropriate legal action against anyone who, in our sole discretion, violates the law or these Legal Terms;</li>
            <li>Refuse, restrict access to, limit the availability of, or disable any of your Contributions or any portion thereof;</li>
            <li>Remove from the Services or otherwise disable all files and content that are excessive in size or burdensome to our systems;</li>
            <li>Otherwise manage the Services in a manner designed to protect our rights and property and facilitate proper functioning.</li>
          </ul>
        </div>
      )
    },
    {
      id: 'term-and-termination',
      number: 8,
      title: 'Term and Termination',
      content: (
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            These Legal Terms shall remain in full force and effect while you use the Services. WITHOUT LIMITING ANY OTHER PROVISION OF THESE LEGAL TERMS, WE RESERVE THE RIGHT TO, IN OUR SOLE DISCRETION AND WITHOUT NOTICE OR LIABILITY, DENY ACCESS TO AND USE OF THE SERVICES (INCLUDING BLOCKING CERTAIN IP ADDRESSES), TO ANY PERSON FOR ANY REASON OR FOR NO REASON, INCLUDING FOR BREACH OF ANY REPRESENTATION, WARRANTY, OR COVENANT.
          </p>
          <p className="text-xs">
            If we terminate or suspend your account for any reason, you are prohibited from registering and creating a new account under your name, a fake or borrowed name, or the name of any third party.
          </p>
        </div>
      )
    },
    {
      id: 'modifications-interruptions',
      number: 9,
      title: 'Modifications and Interruptions',
      content: (
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            We reserve the right to change, modify, or remove the contents of the Services at any time or for any reason at our sole discretion without notice. We will not be liable to you or any third party for any modification, price change, suspension, or discontinuance of the Services.
          </p>
          <p className="text-xs">
            We cannot guarantee the Services will be available at all times. We may experience hardware, software, or network maintenance resulting in interruptions, delays, or errors. You agree that we have no liability whatsoever for any loss, damage, or inconvenience caused by your inability to access or use the Services during downtime.
          </p>
        </div>
      )
    },
    {
      id: 'governing-law',
      number: 10,
      title: 'Governing Law',
      content: (
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            These Legal Terms shall be governed by and defined following the laws of <strong className="text-white">The Federal Republic of Nigeria</strong>.
          </p>
          <p>
            <strong className="text-white">StreamAura</strong> and yourself irrevocably consent that the courts of <strong className="text-white">Lagos State, Nigeria</strong> shall have exclusive jurisdiction to resolve any dispute which may arise in connection with these Legal Terms.
          </p>
        </div>
      )
    },
    {
      id: 'dispute-resolution',
      number: 11,
      title: 'Dispute Resolution',
      content: (
        <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
          <div className="space-y-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-white">Informal Negotiations</h4>
            <p>
              To expedite resolution and control the cost of any dispute, controversy, or claim related to these Legal Terms ("Dispute"), the Parties agree to first attempt to negotiate any Dispute informally for at least <strong className="text-white">thirty (30) days</strong> before initiating arbitration. Such informal negotiations commence upon written notice from one Party to the other Party.
            </p>
          </div>

          <div className="space-y-2 pt-2 border-t border-white/5">
            <h4 className="text-xs font-black uppercase tracking-wider text-white">Binding Arbitration</h4>
            <p>
              If the Parties are unable to resolve a Dispute through informal negotiations, the Dispute shall be finally resolved by binding arbitration in accordance with the United Nations Commission on International Trade Law (UNCITRAL) Arbitration Rules. The number of arbitrators shall be <strong className="text-white">one (1)</strong>. The seat or legal place of arbitration shall be <strong className="text-white">Lagos, Nigeria</strong>. The language of the proceedings shall be <strong className="text-white">English</strong>. The governing law of these Legal Terms shall be the substantive law of <strong className="text-white">The Federal Republic of Nigeria</strong>.
            </p>
          </div>

          <div className="space-y-2 pt-2 border-t border-white/5 text-xs">
            <h4 className="text-xs font-black uppercase tracking-wider text-white">Restrictions</h4>
            <p>
              The Parties agree that any arbitration shall be limited to the Dispute between the Parties individually. To the full extent permitted by law, no arbitration shall be joined with any other proceeding, and there is no right or authority for any Dispute to be arbitrated on a class-action basis.
            </p>
          </div>
        </div>
      )
    },
    {
      id: 'corrections',
      number: 12,
      title: 'Corrections',
      content: (
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            There may be information on the Services that contains typographical errors, inaccuracies, or omissions, including descriptions, pricing, availability, and various other information. We reserve the right to correct any errors, inaccuracies, or omissions and to change or update the information on the Services at any time, without prior notice.
          </p>
        </div>
      )
    },
    {
      id: 'disclaimer',
      number: 13,
      title: 'Disclaimer',
      content: (
        <div className="space-y-3 text-xs text-muted-foreground leading-relaxed bg-black/30 p-4 rounded-2xl border border-white/5 uppercase">
          <p className="font-bold text-white">
            THE SERVICES ARE PROVIDED ON AN AS-IS AND AS-AVAILABLE BASIS. YOU AGREE THAT YOUR USE OF THE SERVICES WILL BE AT YOUR SOLE RISK. TO THE FULLEST EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, IN CONNECTION WITH THE SERVICES AND YOUR USE THEREOF, INCLUDING, WITHOUT LIMITATION, THE IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
          </p>
          <p>
            WE MAKE NO WARRANTIES OR REPRESENTATIONS ABOUT THE ACCURACY OR COMPLETENESS OF THE SERVICES' CONTENT OR THE CONTENT OF ANY WEBSITES OR APPLICATIONS LINKED TO THE SERVICES. WE ASSUME NO LIABILITY OR RESPONSIBILITY FOR ANY ERRORS, PERSONAL INJURY, PROPERTY DAMAGE, SERVER INTERRUPTIONS, OR BUGS TRANSMITTED BY ANY THIRD PARTY.
          </p>
        </div>
      )
    },
    {
      id: 'limitations-of-liability',
      number: 14,
      title: 'Limitations of Liability',
      content: (
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p className="text-xs uppercase font-bold text-white">
            IN NO EVENT WILL WE OR OUR DIRECTORS, EMPLOYEES, OR AGENTS BE LIABLE TO YOU OR ANY THIRD PARTY FOR ANY DIRECT, INDIRECT, CONSEQUENTIAL, EXEMPLARY, INCIDENTAL, SPECIAL, OR PUNITIVE DAMAGES, INCLUDING LOST PROFIT, LOST REVENUE, LOSS OF DATA, OR OTHER DAMAGES ARISING FROM YOUR USE OF THE SERVICES.
          </p>
          <p className="text-xs">
            NOTWITHSTANDING ANYTHING TO THE CONTRARY CONTAINED HEREIN, OUR LIABILITY TO YOU FOR ANY CAUSE WHATSOEVER AND REGARDLESS OF THE FORM OF THE ACTION, WILL AT ALL TIMES BE LIMITED TO <strong className="text-emerald-400">THE LESSER OF THE AMOUNT PAID, IF ANY, BY YOU TO US DURING THE SIX (6) MONTH PERIOD PRIOR TO ANY CAUSE OF ACTION ARISING OR ₦50,000 NGN ($100 USD)</strong>.
          </p>
        </div>
      )
    },
    {
      id: 'indemnification',
      number: 15,
      title: 'Indemnification',
      content: (
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            You agree to defend, indemnify, and hold us harmless, including our subsidiaries, affiliates, and all of our respective officers, agents, partners, and employees, from and against any loss, damage, liability, claim, or demand, including reasonable attorneys' fees and expenses, made by any third party due to or arising out of: (1) use of the Services; (2) breach of these Legal Terms; (3) any breach of your representations and warranties; (4) your violation of the rights of a third party, including intellectual property rights; or (5) any overt harmful act toward any other user of the Services with whom you connected via the Services.
          </p>
        </div>
      )
    },
    {
      id: 'user-data',
      number: 16,
      title: 'User Data',
      content: (
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            We will maintain certain data that you transmit to the Services for the purpose of managing the performance of the Services, as well as data relating to your use of the Services. Although we perform regular routine backups of data, you are solely responsible for all data that you transmit or that relates to any activity you have undertaken using the Services. You agree that we shall have no liability to you for any loss or corruption of any such data.
          </p>
        </div>
      )
    },
    {
      id: 'electronic-communications',
      number: 17,
      title: 'Electronic Communications, Transactions, and Signatures',
      content: (
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            Visiting the Services, sending us emails, and completing online forms constitute electronic communications. You consent to receive electronic communications, and you agree that all agreements, notices, disclosures, and other communications we provide to you electronically, via email and on the Services, satisfy any legal requirement that such communication be in writing.
          </p>
          <p className="text-xs">
            YOU HEREBY AGREE TO THE USE OF ELECTRONIC SIGNATURES, CONTRACTS, ORDERS, AND OTHER RECORDS, AND TO ELECTRONIC DELIVERY OF NOTICES, POLICIES, AND RECORDS OF TRANSACTIONS INITIATED OR COMPLETED BY US OR VIA THE SERVICES.
          </p>
        </div>
      )
    },
    {
      id: 'miscellaneous',
      number: 18,
      title: 'Miscellaneous',
      content: (
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            These Legal Terms and any policies or operating rules posted by us on the Services constitute the entire agreement and understanding between you and us. Our failure to exercise or enforce any right or provision of these Legal Terms shall not operate as a waiver of such right or provision.
          </p>
          <p className="text-xs">
            If any provision or part of a provision of these Legal Terms is determined to be unlawful, void, or unenforceable, that provision is deemed severable from these Legal Terms and does not affect the validity and enforceability of any remaining provisions. There is no joint venture, partnership, employment or agency relationship created between you and us as a result of these Legal Terms.
          </p>
        </div>
      )
    },
    {
      id: 'contact-us',
      number: 19,
      title: 'Contact Us',
      content: (
        <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
          <p>
            In order to resolve a complaint regarding the Services or to receive further information regarding use of the Services, please contact us at:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
              <div className="flex items-center gap-2 text-primary font-black uppercase text-xs">
                <MapPin className="w-4 h-4" /> Registered Office
              </div>
              <p className="text-xs text-white font-bold">StreamAura</p>
              <p className="text-xs text-muted-foreground">
                22 Oguntolu Street, Shomolu,<br />
                Lagos State, Nigeria.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
              <div className="flex items-center gap-2 text-emerald-400 font-black uppercase text-xs">
                <Mail className="w-4 h-4" /> Electronic Inquiries
              </div>
              <p className="text-xs text-white font-bold">Support & Legal Desk</p>
              <p className="text-xs text-muted-foreground font-mono">
                streamaura01@gmail.com
              </p>
              <p className="text-[10px] text-muted-foreground pt-1">
                Official Web: <a href="https://streamaura.site" target="_blank" rel="noreferrer" className="text-primary hover:underline">https://streamaura.site</a>
              </p>
            </div>
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
      sec.number.toString().includes(q)
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
    <div className="max-w-5xl mx-auto space-y-8 pb-32">
      {/* Header Banner */}
      <div className="text-center space-y-4 pt-4">
        <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-indigo-500 via-primary to-purple-600 flex items-center justify-center shadow-xl shadow-primary/20">
          <Scale className="w-10 h-10 text-white" />
        </div>
        <div className="space-y-1">
          <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] font-black uppercase tracking-widest px-3 py-1">
            Official Legal Agreement
          </Badge>
          <h1 className="text-3xl sm:text-4xl font-black gradient-text tracking-tight uppercase">
            Terms of Use
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground font-medium max-w-xl mx-auto">
            Please read these terms carefully before accessing or using StreamAura Services.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] text-muted-foreground font-bold">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Last Updated: September 5, 2026</span>
          </div>
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

      {/* Intro Overview Card */}
      <Card className="glass-card p-6 sm:p-8 border-white/10 space-y-4">
        <div className="flex items-center gap-2 text-primary font-black text-xs uppercase tracking-widest">
          <BookOpen className="w-4 h-4" /> Agreement to Our Legal Terms
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
          We are <strong className="text-white">StreamAura</strong> ("Company," "we," "us," "our"). We operate{' '}
          <a href="https://streamaura.site" className="text-primary underline font-semibold" target="_blank" rel="noreferrer">
            https://streamaura.site
          </a>, as well as any other related products, mobile apps, cinema streaming tools, and media services that refer or link to these legal terms (the "Legal Terms") (collectively, the "Services").
        </p>
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
          You can contact us by email at <strong className="text-white font-mono">streamaura01@gmail.com</strong> or by mail to <strong className="text-white">22 Oguntolu Street, Shomolu, Lagos State, Nigeria</strong>.
        </p>
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-semibold leading-relaxed flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <span>
            These Legal Terms constitute a legally binding agreement made between you, whether personally or on behalf of an entity ("you"), and StreamAura. If you do not agree with all of these Legal Terms, we kindly ask that you please refrain from using or discontinue using the Services.
          </span>
        </div>
      </Card>

      {/* Quick Search & Table of Contents */}
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
              placeholder="Search legal terms (e.g., liability, arbitration)..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-9 pr-3 text-xs outline-none focus:border-primary/50 text-white placeholder:text-muted-foreground/60"
            />
          </div>
        </div>

        {/* TOC Quick Link Buttons */}
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

      {/* Main Sections Accordion / Cards List */}
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
          By accessing or using StreamAura, you acknowledge that you have read, understood, and agreed to be bound by these Legal Terms.
        </p>
        <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">
          StreamAura Legal Team • Lagos, Nigeria
        </p>
      </div>
    </div>
  );
};

export default TermsOfUse;
