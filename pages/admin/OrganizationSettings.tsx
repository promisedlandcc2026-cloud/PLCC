import React from 'react';
import {
   Building2,
   Settings,
   ChevronUp,
   Search,
   User,
   Globe,
   MapPin,
   Phone,
   Sparkles,
   LifeBuoy,
   ChevronDown,
   CheckCircle2
} from 'lucide-react';
import { logActivity } from '../../lib/logger';
import { supabase } from '@/lib/supabase';

const OrganizationSettingsPage: React.FC = () => {
   const [name, setName] = React.useState("Promised Land Christian Center");
   const [address, setAddress] = React.useState("14025 Little Rd");
   const [city, setCity] = React.useState("Hudson");
   const [state, setState] = React.useState("Florida");
   const [zip, setZip] = React.useState("34667");
   const [phone, setPhone] = React.useState("(555) 123-4567");
   const [website, setWebsite] = React.useState("grace-awc.org");
   const [logoUrl, setLogoUrl] = React.useState("");
   const [primaryContactId, setPrimaryContactId] = React.useState<string | null>(null);
   const [staff, setStaff] = React.useState<any[]>([]);
   const [searchQuery, setSearchQuery] = React.useState("");
   const [isLoading, setIsLoading] = React.useState(true);
   const [isSaving, setIsSaving] = React.useState(false);

   React.useEffect(() => {
      fetchOrganization();
      fetchStaff();
   }, []);

   const fetchStaff = async () => {
      try {
         const res = await fetch('/api/community?resource=chat&subResource=mentors');
         if (res.ok) {
            const data = await res.json();
            const staffList = Array.isArray(data) ? data : (data.mentors || data.staff || []);
            setStaff(staffList);
         }
      } catch (e) {
         console.error("Failed to fetch staff", e);
      }
   };

   const fetchOrganization = async () => {
      try {
         setIsLoading(true);
         const res = await fetch('/api/organization', {
            headers: {
               'Authorization': `Bearer ${localStorage.getItem('awc_auth_token')}`,
               'x-user-id': localStorage.getItem('awc_user_id') || ''
            }
         });
         
         if (!res.ok) throw new Error("Fetch failed");
         const data = await res.json();

         if (data) {
            const org = data; 
            setName(org.name || "");
            setAddress(org.address || org.address_line1 || ""); 
            setCity(org.city || "");
            setState(org.state || "");
            setZip(org.zip || "");
            setPhone(org.phone || "");
            setWebsite(org.website || "");
            setLogoUrl(org.logo_url || "");
            setPrimaryContactId(org.primary_contact_id || null);
         }
      } catch (err) {
         console.error("Failed to fetch organization settings:", err);
      } finally {
         setIsLoading(false);
      }
   };

   const handleSave = async () => {
      const authToken = localStorage.getItem('awc_auth_token');
      const authUserId = localStorage.getItem('awc_user_id');

      if (!authToken || !authUserId) {
         console.error("Cannot update settings: No valid Auth Session found.");
         alert("Your session has expired or is invalid. Please log in again.");
         return;
      }

      setIsSaving(true);
      console.log("[Frontend Debug] Saving Organization Settings:", {
         primary_contact_id: primaryContactId,
         user_id: authUserId
      });

      try {
         const res = await fetch('/api/organization', {
            method: 'POST',
            headers: {
               'Content-Type': 'application/json',
               'Authorization': `Bearer ${authToken}`,
               'x-user-id': authUserId
            },
            body: JSON.stringify({
               name,
               address,
               city,
               state,
               zip,
               phone,
               website,
               logo_url: logoUrl,
               primary_contact_id: primaryContactId
            })
         });

         if (res.ok) {
            const savedData = await res.json();
            console.log("[Frontend Debug] Save Response:", savedData);
            
            logActivity(
               'Organization Settings Updated',
               `Updated profile information for ${name}`,
               'warning',
               'organization',
               'settings'
            );
            alert("Organization settings saved successfully!");
            fetchOrganization();
         } else {
            const errorData = await res.json();
            console.error("[Frontend Error] Save failed:", errorData);
            throw new Error(errorData.error || "Save failed");
         }
      } catch (err) {
         console.error(err);
         alert("Error saving settings: " + (err instanceof Error ? err.message : "Unknown error"));
      } finally {
         setIsSaving(false);
      }
   };

   if (isLoading) return <div className="p-10 text-center">Loading settings...</div>;

   return (
      <div className="space-y-8 animate-in fade-in duration-500">
         <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
               <h1 className="text-4xl font-extrabold text-[#0d1a14] mb-2 tracking-tight">Organization Profile</h1>
               <p className="text-gray-400 font-medium">Manage your ministry's public identity and physical location details.</p>
            </div>
            <button
               onClick={handleSave}
               disabled={isSaving}
               className="px-10 py-4 bg-burgundy text-gold font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-burgundy/20 hover:bg-burgundy-dark transition-all active:scale-95 border-b-4 border-gold/40 disabled:opacity-70"
            >
               {isSaving ? "Saving..." : "Save Profile Changes"}
            </button>
         </div>

         <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Profile Card Sidebar */}
            <div className="lg:col-span-1 space-y-6">
               <div className="bg-white p-10 rounded-[3rem] border border-gray-50 shadow-sm text-center flex flex-col items-center">
                  <div className="relative mb-8 group cursor-pointer">
                     <div className="w-32 h-32 bg-gold-cream rounded-[3rem] border border-gold/20 flex items-center justify-center text-gold shadow-inner group-hover:rotate-6 transition-transform overflow-hidden">
                        {logoUrl ? <img src={logoUrl} alt="Org Logo" className="w-full h-full object-cover" /> : <Building2 size={64} />}
                     </div>
                     <label className="absolute -bottom-2 -right-2 bg-burgundy text-gold p-2.5 rounded-2xl border-4 border-white shadow-lg cursor-pointer hover:scale-110 transition-transform">
                        <Settings size={20} />
                        <input
                           type="file"
                           accept="image/*"
                           className="hidden"
                           onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                 const reader = new FileReader();
                                 reader.onloadend = () => setLogoUrl(reader.result as string);
                                 reader.readAsDataURL(file);
                              }
                           }}
                        />
                     </label>
                  </div>
                  <h3 className="text-2xl font-black text-[#0d1a14] mb-2">{name}</h3>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Ministry ID: PLCC-2024-FL</p>

                  <div className="w-full mt-10 space-y-4 pt-8 border-t border-gray-50">
                     <div className="flex items-center gap-3 text-left">
                        <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gold"><Globe size={18} /></div>
                        <div>
                           <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Website</p>
                           <input
                              value={website}
                              onChange={(e) => setWebsite(e.target.value)}
                              className="text-[13px] font-bold text-burgundy bg-transparent border-b border-transparent focus:border-gold outline-none w-full"
                           />
                        </div>
                     </div>
                     <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl border border-gray-100">
                        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center text-green-600">
                           <CheckCircle2 size={20} />
                        </div>
                        <div>
                           <h4 className="font-bold text-[#0d1a14] text-sm">Primary Domain</h4>
                           <p className="text-xs text-gray-500">plcc-opal.vercel.app</p>
                        </div>
                     </div>
                     <div className="flex items-center gap-3 text-left">
                        <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gold"><Phone size={18} /></div>
                        <div>
                           <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Phone</p>
                           <input
                              value={phone}
                              onChange={(e) => setPhone(e.target.value)}
                              className="text-[13px] font-bold text-burgundy bg-transparent border-b border-transparent focus:border-gold outline-none w-full"
                           />
                        </div>
                     </div>
                  </div>
               </div>

               <div className="bg-gold-cream/30 p-8 rounded-[2.5rem] border border-gold/10 shadow-sm flex items-start gap-4">
                  <Sparkles size={24} className="text-gold shrink-0 mt-1" />
                  <div>
                     <p className="text-[14px] font-bold text-[#0d1a14]">Profile Optimization</p>
                     <p className="text-xs text-gray-400 font-medium leading-relaxed mt-1">Adding your EIN and physical address improves trust for online tax-deductible giving forms.</p>
                  </div>
               </div>
            </div>

            {/* Form Area */}
            <div className="lg:col-span-2 space-y-8">
               <div className="bg-white rounded-[3rem] border border-gray-50 shadow-sm overflow-hidden group">
                  <div className="p-8 border-b border-gray-50 bg-gold-cream/10 flex items-center justify-between">
                     <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center text-burgundy border border-gold/10 group-hover:scale-105 transition-transform"><MapPin size={22} /></div>
                        <h3 className="text-xl font-black text-[#0d1a14]">Physical Headquarters</h3>
                     </div>
                     <ChevronUp size={20} className="text-gray-300" />
                  </div>
                  <div className="p-10 grid grid-cols-1 md:grid-cols-2 gap-8">
                     <div className="space-y-3 md:col-span-2">
                        <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest ml-1">Official Name</label>
                        <input
                           type="text"
                           value={name}
                           onChange={(e) => setName(e.target.value)}
                           className="w-full px-6 py-4 rounded-[1.25rem] bg-gray-50 border border-transparent focus:bg-white focus:border-gold outline-none transition-all font-bold text-[#0d1a14]"
                        />
                     </div>
                     <div className="space-y-3">
                        <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest ml-1">Address Line 1</label>
                        <input
                           type="text"
                           value={address}
                           onChange={(e) => setAddress(e.target.value)}
                           className="w-full px-6 py-4 rounded-[1.25rem] bg-gray-50 border border-transparent focus:bg-white focus:border-gold outline-none transition-all font-bold text-[#0d1a14]"
                        />
                     </div>
                     <div className="space-y-3">
                        <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest ml-1">City</label>
                        <input
                           type="text"
                           value={city}
                           onChange={(e) => setCity(e.target.value)}
                           className="w-full px-6 py-4 rounded-[1.25rem] bg-gray-50 border border-transparent focus:bg-white focus:border-gold outline-none transition-all font-bold text-[#0d1a14]"
                        />
                     </div>
                     <div className="space-y-3">
                        <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest ml-1">State / Province</label>
                        <input
                           type="text"
                           value={state}
                           onChange={(e) => setState(e.target.value)}
                           className="w-full px-6 py-4 rounded-[1.25rem] bg-gray-50 border border-transparent focus:bg-white focus:border-gold outline-none transition-all font-bold text-[#0d1a14]"
                        />
                     </div>
                     <div className="space-y-3">
                        <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest ml-1">Zip / Postal Code</label>
                        <input
                           type="text"
                           value={zip}
                           onChange={(e) => setZip(e.target.value)}
                           className="w-full px-6 py-4 rounded-[1.25rem] bg-gray-50 border border-transparent focus:bg-white focus:border-gold outline-none transition-all font-bold text-[#0d1a14]"
                        />
                     </div>
                  </div>
               </div>

               <div className="bg-white rounded-[3rem] border border-gray-50 shadow-sm overflow-hidden group">
                  <div className="p-8 border-b border-gray-50 bg-gold-cream/10 flex items-center justify-between">
                     <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center text-burgundy border border-gold/10 group-hover:scale-105 transition-transform"><User size={22} /></div>
                        <h3 className="text-xl font-black text-[#0d1a14]">Primary Contact</h3>
                     </div>
                     <ChevronDown size={20} className="text-gray-300" />
                  </div>
                  <div className="p-10">
                     <p className="text-sm text-gray-400 font-medium mb-6 leading-relaxed">Select the designated user who will handle official communication and billing alerts.</p>

                     {primaryContactId && (
                        <div className="mb-6 p-4 bg-burgundy rounded-2xl border border-gold/20 flex items-center justify-between animate-in fade-in slide-in-from-top-2">
                           <div className="flex items-center gap-4">
                              <div className="w-12 h-12 rounded-xl bg-gold text-burgundy flex items-center justify-center font-black">
                                 {staff.find(s => s.id === primaryContactId)?.name?.charAt(0) || 'U'}
                              </div>
                              <div>
                                 <p className="text-[10px] font-bold text-gold/80 uppercase tracking-widest leading-none mb-1">Current Primary Contact</p>
                                 <h4 className="text-white font-black">{staff.find(s => s.id === primaryContactId)?.name || 'Designated User'}</h4>
                              </div>
                           </div>
                           <button onClick={() => setPrimaryContactId(null)} className="text-gold/50 hover:text-gold transition-colors font-bold text-xs">Change</button>
                        </div>
                     )}

                     <div className="relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-gold transition-colors" size={20} />
                        <input
                           type="text"
                           placeholder="Search for user by name or email..."
                           value={searchQuery}
                           onChange={(e) => setSearchQuery(e.target.value)}
                           className="w-full pl-12 pr-6 py-4 rounded-[1.25rem] bg-gray-50 border border-transparent focus:bg-white focus:border-gold outline-none transition-all font-bold text-[#0d1a14]"
                        />
                     </div>

                     {searchQuery.trim() !== "" && (
                        <div className="mt-4 bg-white border border-gray-100 rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 z-10 max-h-60 overflow-y-auto">
                           {staff.filter(s =>
                              s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                              (s.email && s.email.toLowerCase().includes(searchQuery.toLowerCase()))
                           ).map(user => (
                              <button
                                 key={user.id}
                                 onClick={() => {
                                    setPrimaryContactId(user.id);
                                    setSearchQuery("");
                                 }}
                                 className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors text-left border-b border-gray-50 last:border-0"
                              >
                                 <div className="w-10 h-10 rounded-lg bg-burgundy/5 text-burgundy flex items-center justify-center font-black">
                                    {user.name.charAt(0)}
                                 </div>
                                 <div>
                                    <p className="text-sm font-black text-[#0d1a14]">{user.name}</p>
                                    <p className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">{user.role || 'Staff Member'}</p>
                                 </div>
                              </button>
                           ))}
                        </div>
                     )}
                  </div>
               </div>
            </div>
         </div>

         <div className="flex items-center justify-center gap-6 pt-6 border-t border-gray-50">
            <div className="flex items-center gap-3 text-sm font-semibold text-gray-400">
               <LifeBuoy size={18} className="text-burgundy" />
               <span>Need help with multi-location setup? <button className="text-burgundy hover:underline">Contact Support</button></span>
            </div>
         </div>
      </div>
   );
};

export default OrganizationSettingsPage;
