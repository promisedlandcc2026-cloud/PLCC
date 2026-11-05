import React from 'react';
import QRCode from 'react-qr-code';
import {
  Smartphone,
  MessageSquare,
  CheckCircle2
} from 'lucide-react';

const TextGivingPage: React.FC = () => {
  const phoneNumber = "855 625 4703";
  const cleanNumber = phoneNumber.replace(/\s/g, '');
  const smsLink = `sms:${cleanNumber}`;

  return (
    <div className="max-w-5xl mx-auto space-y-12 animate-in fade-in duration-500 pb-12">
      <div className="text-center space-y-4">
        <div className="w-24 h-24 rounded-[2.5rem] bg-gold-cream text-gold flex items-center justify-center mx-auto shadow-2xl border border-gold/20">
          <MessageSquare size={48} />
        </div>
        <h1 className="text-6xl font-black text-[#0d1a14] tracking-tighter">Text-to-Give</h1>
        <p className="text-xl text-gray-400 font-medium max-w-2xl mx-auto leading-relaxed">
          The fastest, simplest way to support the vision.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
        {/* Step 1: Just Text */}
        <div className="bg-white p-10 rounded-[3.5rem] border border-gray-100 shadow-sm flex flex-col items-center text-center space-y-8 relative overflow-hidden group hover:shadow-xl transition-all duration-500">
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-burgundy to-gold" />

          <div className="w-16 h-16 rounded-2xl bg-burgundy/5 text-burgundy flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
            <span className="font-black text-2xl">1</span>
          </div>

          <div className="space-y-2">
            <h3 className="text-3xl font-black text-[#0d1a14]">Compose a Text</h3>
            <p className="text-gray-400 font-medium">Open your messaging app and start a new text to:</p>
          </div>

          <div className="bg-gray-900 text-white px-8 py-6 rounded-3xl text-3xl font-black tracking-widest shadow-2xl shadow-gray-200 mobile:text-2xl">
            {phoneNumber}
          </div>
          <p className="text-xs text-gray-300 font-bold uppercase tracking-widest">or scan the QR code to auto-fill</p>
        </div>

        {/* QR Code */}
        <div className="bg-burgundy text-gold p-10 rounded-[3.5rem] shadow-2xl shadow-burgundy/20 flex flex-col items-center justify-center text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10" />

          <div className="bg-white p-4 rounded-3xl shadow-inner mb-8 relative z-10 transform hover:scale-105 transition-transform duration-500">
            <QRCode value={smsLink} size={200} viewBox={`0 0 256 256`} />
          </div>

          <div className="relative z-10 space-y-2">
            <div className="flex items-center justify-center gap-2">
              <Smartphone size={20} />
              <span className="font-bold text-sm uppercase tracking-widest">Scan to Text</span>
            </div>
          </div>
        </div>

        {/* Step 2: The Amount */}
        <div className="lg:col-span-2 bg-white p-12 rounded-[3.5rem] border border-gray-100 shadow-sm flex flex-col md:flex-row items-center gap-12 relative overflow-hidden">
          <div className="flex-1 space-y-6 text-center md:text-left">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-50 text-green-600 font-bold text-xs uppercase tracking-widest">
              <CheckCircle2 size={14} /> simple & secure
            </div>
            <h3 className="text-4xl font-black text-[#0d1a14]">How it works</h3>
            <p className="text-xl text-gray-400 font-medium leading-relaxed">
              Simply text the amount you'd like to give (e.g. <span className="text-burgundy font-bold">50000</span>) to the number.
              First time givers will receive a quick setup link to link their card safely.
              Future gifts happen in seconds!
            </p>
          </div>

          {/* Phone Mockup */}
          <div className="w-full max-w-sm bg-gray-50 rounded-[2.5rem] p-6 border border-gray-200 shadow-inner">
            <div className="space-y-4">
              <div className="flex justify-end">
                <div className="bg-burgundy text-gold font-bold py-3 px-6 rounded-2xl rounded-tr-sm shadow-md text-lg">
                  50
                </div>
              </div>
              <div className="flex justify-start">
                <div className="bg-white text-gray-600 font-medium py-3 px-6 rounded-2xl rounded-tl-sm shadow-sm border border-gray-100 text-sm leading-relaxed">
                  <span className="text-burgundy font-bold">Abundant Worship:</span> Thank you! Tap to complete your $50.00 gift: <span className="text-blue-500 underline">vanco.mobile/x829s</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TextGivingPage;
