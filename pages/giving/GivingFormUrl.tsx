import React, { useState, useRef } from 'react';
import QRCode from 'react-qr-code';
import {
  Link,
  Copy,
  Check,
  Download,
  Sparkles,
  LifeBuoy,
  ExternalLink
} from 'lucide-react';

const GivingFormUrlPage: React.FC = () => {
  const [copied, setCopied] = useState(false);
  const baseUrl = "https://secure.myvanco.com/YKB0/campaign/C-1218F?access=tile_direct";
  const [customLabel, setCustomLabel] = useState("");

  // Vanco Link doesn't technically support 'source' params publicly documented, 
  // but appending them changes the QR code uniqueness which can be useful for differentiation.
  const finalUrl = customLabel ? `${baseUrl}&ref=${encodeURIComponent(customLabel)}` : baseUrl;

  const handleCopy = () => {
    navigator.clipboard.writeText(finalUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadQR = () => {
    const svg = document.getElementById("vanco-qr");
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      const pngFile = canvas.toDataURL("image/png");
      const downloadLink = document.createElement("a");
      downloadLink.download = `PLCC-Giving-QR-${customLabel || "Main"}.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(svgData);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-10 animate-in fade-in duration-500 pb-12">
      <div className="text-center">
        <div className="w-20 h-20 rounded-[2.5rem] bg-gold-cream text-gold flex items-center justify-center mx-auto mb-6 shadow-2xl border border-gold/20">
          <Link size={40} />
        </div>
        <h1 className="text-5xl font-extrabold text-[#0d1a14] mb-3 tracking-tighter">Direct Link Generator</h1>
        <p className="text-gray-400 font-medium max-w-lg mx-auto leading-relaxed">
          Create scannable codes for your Vanco donation page.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">

        {/* Left: Configuration */}
        <div className="space-y-6">
          <div className="bg-white p-10 rounded-[3rem] border border-gray-50 shadow-sm space-y-8">
            <div className="space-y-4">
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest block">Destination Support</label>
              <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <ExternalLink size={20} />
                </div>
                <div>
                  <p className="font-bold text-[#0d1a14] text-sm">Vanco Secure Portal</p>
                  <p className="text-xs text-gray-400">secure.myvanco.com</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest block">Link Reference / Label (Optional)</label>
              <input
                type="text"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                placeholder="e.g. SundayService, YouthEvent"
                className="w-full px-6 py-4 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-gold outline-none transition-all font-bold text-[#0d1a14]"
              />
              <p className="text-[10px] text-gray-400">Appends a reference tag to the URL to distinguish QR codes.</p>
            </div>

            <div className="pt-6 border-t border-gray-50">
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest block mb-3">Generated URL</label>
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-gold-cream/30 p-4 rounded-2xl border border-gold/10 font-mono text-xs text-burgundy truncate">
                  {finalUrl}
                </div>
                <button
                  onClick={handleCopy}
                  className="w-12 h-12 flex items-center justify-center bg-burgundy text-gold rounded-xl shadow-lg hover:scale-105 transition-transform"
                >
                  {copied ? <Check size={20} /> : <Copy size={20} />}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] border border-gray-50 shadow-sm flex items-start gap-5">
            <Sparkles size={24} className="text-gold shrink-0 mt-1" />
            <div>
              <h5 className="font-bold text-[#0d1a14] text-lg mb-1">Pro Tip</h5>
              <p className="text-[14px] text-gray-400 font-medium leading-relaxed">
                Print this QR code on donation envelopes or event flyers for quick access.
              </p>
            </div>
          </div>
        </div>

        {/* Right: Preview */}
        <div className="bg-gray-900 rounded-[3rem] p-12 text-center flex flex-col items-center justify-center relative shadow-2xl overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-burgundy/40 opacity-50" />

          <div className="relative z-10 bg-white p-6 rounded-3xl shadow-2xl mb-8 transform group-hover:scale-105 transition-transform duration-500">
            <QRCode
              id="vanco-qr"
              value={finalUrl}
              size={250}
              viewBox={`0 0 256 256`}
              level='H'
            />
          </div>

          <h3 className="relative z-10 text-2xl font-black text-white mb-2">Scan to Give</h3>
          <p className="relative z-10 text-gray-400 font-medium text-sm max-w-xs mx-auto mb-8">
            Directs donors securely to Abundant Worship Center's Vanco page.
          </p>

          <button
            onClick={downloadQR} // Note: Implementation for download requires handling SVG serialization
            className="relative z-10 px-8 py-4 bg-gold text-[#0d1a14] font-black uppercase tracking-widest text-xs rounded-2xl shadow-xl hover:bg-white transition-all flex items-center gap-3"
          >
            <Download size={16} /> Download PNG
          </button>
        </div>

      </div>
    </div>
  );
};

export default GivingFormUrlPage;
