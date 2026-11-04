
import React, { useState } from 'react';
import QRCode from 'react-qr-code';
import {
   CreditCard,
   Smartphone,
   Send,
   DollarSign,
   ExternalLink,
   Copy,
   Check,
   Building2,
   Heart
} from 'lucide-react';

const GivingFormPage: React.FC = () => {
   const [copied, setCopied] = useState<string | null>(null);

   const handleCopy = (text: string, key: string) => {
      navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
   };

   const methods = [
      {
         id: 'text',
         title: 'Text Giving',
         icon: <Smartphone size={24} />,
         value: '855 625 4703',
         action: 'sms:8556254703',
         description: 'Text any amount to this number to give instantly.',
         color: 'bg-indigo-50 text-indigo-600',
         qrValue: 'sms:8556254703'
      },
      {
         id: 'cashapp',
         title: 'Cash App',
         icon: <DollarSign size={24} />,
         value: '$AWCGIVEPLUS',
         action: 'https://cash.app/$AWCGIVEPLUS',
         description: 'Send directly via Cash App. Fast and secure.',
         color: 'bg-green-50 text-green-600',
         qrValue: 'https://cash.app/$AWCGIVEPLUS'
      },
      {
         id: 'zelle',
         title: 'Zelle',
         icon: <Send size={24} />,
         value: '508 933 1804',
         description: 'Send directly from your bank app using this number.',
         color: 'bg-purple-50 text-purple-600',
         // Zelle doesn't have a standard URL scheme for direct payment, usually just the number
         qrValue: '5089331804'
      }
   ];

   const onlineLinks = [
      {
         title: 'Tithes & Offerings',
         url: 'https://secure.myvanco.com/YKB0/campaign/C-1218F?access=tile_direct',
         icon: <Heart size={20} />,
      },
      {
         title: 'Building Fund',
         url: 'https://secure.myvanco.com/YKB0/campaign/C-1218F?access=tile_direct',
         icon: <Building2 size={20} />,
      }
   ];

   return (
      <div className="space-y-10 animate-in fade-in duration-500 pb-12 max-w-7xl mx-auto">
         <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
               <h1 className="text-4xl font-extrabold text-[#0d1a14] mb-2 tracking-tight">Giving Channels</h1>
               <p className="text-gray-400 font-medium">Official donation methods for Abundant Worship Center.</p>
            </div>
         </div>

         <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

            {/* Main Methods */}
            {methods.map((method) => (
               <div key={method.id} className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-all group">
                  <div className="p-8 pb-4 flex items-start justify-between">
                     <div className={`w-14 h-14 rounded-2xl ${method.color} flex items-center justify-center shadow-sm`}>
                        {method.icon}
                     </div>
                     <div className="bg-gray-50 p-2 rounded-xl group-hover:scale-105 transition-transform">
                        <div className="w-24 h-24 bg-white p-2 rounded-lg shadow-sm">
                           <QRCode value={method.qrValue} size={100} style={{ height: "100%", width: "100%" }} viewBox={`0 0 256 256`} />
                        </div>
                     </div>
                  </div>

                  <div className="px-8 pb-8 flex-1 flex flex-col">
                     <h3 className="text-2xl font-black text-[#0d1a14] mb-1">{method.title}</h3>
                     <p className="text-gray-400 text-sm font-medium mb-6 leading-relaxed flex-1">
                        {method.description}
                     </p>

                     <div className="bg-gray-50/80 rounded-2xl p-4 flex items-center justify-between group-hover:bg-gold-cream/30 transition-colors border border-gray-100">
                        <span className="font-bold text-[#0d1a14] text-lg select-all">{method.value}</span>
                        <button
                           onClick={() => handleCopy(method.value, method.id)}
                           className="p-2 text-gray-400 hover:text-burgundy transition-colors"
                        >
                           {copied === method.id ? <Check size={18} /> : <Copy size={18} />}
                        </button>
                     </div>
                  </div>

                  {method.action && (
                     <a
                        href={method.action}
                        target="_blank"
                        rel="noreferrer"
                        className="mx-8 mb-8 py-4 bg-burgundy/5 text-burgundy font-black text-xs uppercase tracking-widest rounded-xl hover:bg-burgundy hover:text-gold transition-all text-center flex items-center justify-center gap-2"
                     >
                        Launch App <ExternalLink size={14} />
                     </a>
                  )}
               </div>
            ))}

         </div>

         {/* Online Giving Section */}
         <div className="bg-gold-cream/20 rounded-[3rem] border border-gold/20 p-8 lg:p-12">
            <div className="flex flex-col lg:flex-row items-center gap-12">
               <div className="flex-1 text-center lg:text-left">
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gold/20 text-[#0d1a14] font-black text-[10px] uppercase tracking-widest mb-4">
                     <CreditCard size={12} /> Secure Portal
                  </div>
                  <h2 className="text-3xl lg:text-4xl font-black text-[#0d1a14] mb-4">Online Giving via Vanco</h2>
                  <p className="text-gray-500 font-medium text-lg leading-relaxed max-w-xl">
                     Manage your recurring gifts, tithes, and building fund contributions securely through our dedicated donor portal.
                  </p>
               </div>

               <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
                  {onlineLinks.map((link) => (
                     <a
                        key={link.title}
                        href={link.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 min-w-[240px] p-6 bg-white border border-gold/20 rounded-[2rem] shadow-xl shadow-gold/5 hover:scale-105 transition-all group flex flex-col items-center justify-center gap-3 text-center"
                     >
                        <div className="w-12 h-12 bg-burgundy text-gold rounded-full flex items-center justify-center shadow-lg group-hover:bg-gold group-hover:text-burgundy transition-colors">
                           {link.icon}
                        </div>
                        <div>
                           <span className="font-black text-[#0d1a14] text-lg block">{link.title}</span>
                           <span className="text-xs text-gray-400 font-bold uppercase tracking-widest flex items-center justify-center gap-1 mt-1">
                              Give Now <ExternalLink size={10} />
                           </span>
                        </div>
                     </a>
                  ))}
               </div>
            </div>
         </div>

      </div>
   );
};

export default GivingFormPage;


