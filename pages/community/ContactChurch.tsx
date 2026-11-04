
import React, { useState } from 'react';
import { Mail, Send, CheckCircle2, User, ShieldCheck, ArrowRight, Loader2, MessageSquare, AlertCircle } from 'lucide-react';
import Toast, { ToastType } from '../../components/common/Toast';

const ContactChurchPage: React.FC = () => {
  const [formData, setFormData] = useState({
    from_name: '',
    from_email: '',
    category: 'general',
    subject: '',
    message: '',
    company_website: '' // Honeypot field
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (formData.from_name.trim().length < 2) {
      newErrors.from_name = 'Name must be at least 2 characters';
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.from_email)) {
      newErrors.from_email = 'Please enter a valid email address';
    }

    if (formData.subject.trim().length < 3) {
      newErrors.subject = 'Subject must be at least 3 characters';
    }

    if (formData.message.trim().length < 10) {
      newErrors.message = 'Message must be at least 10 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!validate()) {
      setToast({ message: 'Please correct the highlighted errors.', type: 'error' });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/vault?resource=ops&action=contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const result = await res.json();

      if (res.ok) {
        setToast({ message: result.message || 'Message dispatched successfully!', type: 'success' });
        setFormData({
          from_name: '',
          from_email: '',
          category: 'general',
          subject: '',
          message: '',
          company_website: ''
        });
        setErrors({});
      } else {
        if (result.errors) {
          setErrors(result.errors);
        }
        setToast({ message: 'Submission failed. Please check your data.', type: 'error' });
      }
    } catch (e) {
      console.error(e);
      setToast({ message: 'A network error occurred. Please try again.', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fafafa] flex items-center justify-center p-4 md:p-12 font-inter overflow-hidden relative">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-burgundy rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-gold rounded-full blur-[120px]" />
      </div>

      <div className="w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl border border-gray-100 p-8 md:p-16 relative z-10 animate-in slide-in-from-bottom-6 duration-700">
        <div className="text-center mb-12">
          <div className="w-16 h-16 bg-burgundy text-gold rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl border border-gold/10">
            <Mail size={32} />
          </div>
          <h1 className="text-4xl font-black text-[#0d1a14] tracking-tighter">Contact Church<span className="text-gold">.</span></h1>
          <p className="text-gray-400 font-medium mt-2">Connect with our administrative and spiritual leadership.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Honeypot Field - Visually Hidden */}
          <div className="absolute opacity-0 -z-10 pointer-events-none overflow-hidden h-0 w-0">
            <label htmlFor="company_website">Company Website</label>
            <input
              id="company_website"
              type="text"
              name="company_website"
              autoComplete="off"
              tabIndex={-1}
              value={formData.company_website}
              onChange={e => setFormData({ ...formData, company_website: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Full Name</label>
              <div className="relative">
                <User size={16} className={`absolute left-5 top-1/2 -translate-y-1/2 transition-colors ${errors.from_name ? 'text-red-400' : 'text-gray-300'}`} />
                <input
                  required
                  type="text"
                  placeholder="John Doe"
                  className={`w-full pl-12 pr-6 h-12 md:h-14 bg-gray-50 rounded-2xl outline-none focus:bg-white focus:ring-4 transition-all font-bold text-[#0d1a14] text-base ${errors.from_name ? 'border-red-300 focus:ring-red-50' : 'border-transparent focus:ring-burgundy/5'}`}
                  value={formData.from_name}
                  onChange={e => setFormData({ ...formData, from_name: e.target.value })}
                />
              </div>
              {errors.from_name && <p className="text-xs text-red-500 font-bold ml-1 flex items-center gap-1"><AlertCircle size={10} /> {errors.from_name}</p>}
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Email Address</label>
              <div className="relative">
                <Mail size={16} className={`absolute left-5 top-1/2 -translate-y-1/2 transition-colors ${errors.from_email ? 'text-red-400' : 'text-gray-300'}`} />
                <input
                  required
                  type="email"
                  placeholder="john@example.com"
                  className={`w-full pl-12 pr-6 h-12 md:h-14 bg-gray-50 rounded-2xl outline-none focus:bg-white focus:ring-4 transition-all font-bold text-[#0d1a14] text-base ${errors.from_email ? 'border-red-300 focus:ring-red-50' : 'border-transparent focus:ring-burgundy/5'}`}
                  value={formData.from_email}
                  onChange={e => setFormData({ ...formData, from_email: e.target.value })}
                />
              </div>
              {errors.from_email && <p className="text-xs text-red-500 font-bold ml-1 flex items-center gap-1"><AlertCircle size={10} /> {errors.from_email}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Category</label>
              <select
                required
                className="w-full px-6 h-12 md:h-14 bg-gray-50 border-transparent rounded-2xl outline-none focus:bg-white focus:ring-4 focus:ring-burgundy/5 transition-all font-bold text-[#0d1a14] text-base appearance-none cursor-pointer"
                value={formData.category}
                onChange={e => setFormData({ ...formData, category: e.target.value })}
              >
                <option value="general">General Inquiry</option>
                <option value="prayer">Prayer Request</option>
                <option value="volunteer">Volunteer Interest</option>
                <option value="finance">Giving & Tithes</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Subject</label>
              <input
                required
                type="text"
                placeholder="How can we help?"
                className={`w-full px-6 h-12 md:h-14 bg-gray-50 rounded-2xl outline-none focus:bg-white focus:ring-4 transition-all font-bold text-[#0d1a14] text-base ${errors.subject ? 'border-red-300 focus:ring-red-50' : 'border-transparent focus:ring-burgundy/5'}`}
                value={formData.subject}
                onChange={e => setFormData({ ...formData, subject: e.target.value })}
              />
              {errors.subject && <p className="text-xs text-red-500 font-bold ml-1 flex items-center gap-1"><AlertCircle size={10} /> {errors.subject}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Your Message</label>
            <textarea
              required
              rows={5}
              placeholder="Type your message here..."
              className={`w-full px-6 py-6 bg-gray-50 rounded-[2rem] outline-none focus:bg-white focus:ring-4 transition-all font-medium text-gray-700 text-base resize-none leading-relaxed shadow-inner min-h-[160px] ${errors.message ? 'border-red-300 focus:ring-red-50' : 'border-transparent focus:ring-burgundy/5'}`}
              value={formData.message}
              onChange={e => setFormData({ ...formData, message: e.target.value })}
            />
            {errors.message && <p className="text-xs text-red-500 font-bold ml-1 flex items-center gap-1"><AlertCircle size={10} /> {errors.message}</p>}
          </div>

          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={isSubmitting}
            className="w-full h-14 md:h-16 bg-burgundy text-gold rounded-[2rem] font-black text-sm uppercase tracking-[0.3em] shadow-2xl shadow-burgundy/20 hover:bg-burgundy-dark transition-all active:scale-95 border-b-8 border-gold/40 flex items-center justify-center gap-3 group disabled:opacity-70"
          >
            {isSubmitting ? <Loader2 size={24} className="animate-spin" /> : (
              <>
                Securely Dispatch
                <ArrowRight size={20} className="group-hover:translate-x-2 transition-transform" />
              </>
            )}
          </button>

          <div className="flex items-center justify-center gap-3 opacity-20 pt-4">
            <ShieldCheck size={14} className="text-burgundy" />
            <span className="text-[9px] font-black uppercase tracking-[0.2em]">End-to-End Secure Protocol</span>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ContactChurchPage;