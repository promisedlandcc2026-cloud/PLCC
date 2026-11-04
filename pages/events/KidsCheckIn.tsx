import React, { useState } from 'react';
import {
  Baby,
  Search,
  Users,
  AlertCircle,
  Printer,
  X,
  CheckCircle2,
  Fingerprint,
  FileText,
  LogIn,
} from 'lucide-react';
import ConsentModal from '../../components/Consent/ConsentModal';
import { extractAllergyAlert } from '../../lib/childAllergy';
import { apiFetch } from '../../lib/api';

const KidsCheckInPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFamily, setSelectedFamily] = useState<any>(null);
  const [families, setFamilies] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [checkInCode, setCheckInCode] = useState<string | null>(null);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [checkedInChildren, setCheckedInChildren] = useState<any[]>([]);
  const [printData, setPrintData] = useState<{
    children: any[];
    code: string;
    date: string;
  } | null>(null);

  const [consentModalOpen, setConsentModalOpen] = useState(false);
  const [pendingCheckIn, setPendingCheckIn] = useState<any[]>([]);
  const [missingConsents, setMissingConsents] = useState<any[]>([]);
  const [currentConsentChild, setCurrentConsentChild] = useState<any>(null);

  React.useEffect(() => {
    const fetchFamilies = async () => {
      if (!searchQuery) {
        setFamilies([]);
        return;
      }
      setIsLoading(true);
      try {
        const data = await apiFetch(
          `/api/vault?resource=events&subResource=checkin&query=${encodeURIComponent(searchQuery)}`
        );
        if (data.ok) {
          setFamilies(data.families);
        }
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };
    const timeoutId = setTimeout(fetchFamilies, 500);
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const roomForAge = (age: number | string | undefined) => {
    const n = parseInt(String(age || 0), 10) || 0;
    if (n < 3) return 'Nursery';
    if (n < 6) return 'Pre-K';
    if (n < 11) return 'Elementary';
    return 'Middle School';
  };

  const getFamilyChildren = (family: any) => {
    const separateChildren = family.members
      .filter((m: any) => m.role === 'Child')
      .map((c: any) => ({ ...c, room: roomForAge(c.age) }));
    const jsonChildren = family.members.flatMap((m: any) =>
      (m.children || []).map((c: any, i: number) => ({
        id: `json-${m.id}-${i}`,
        name: c.name,
        age: c.age,
        notes: c.notes || '',
        role: 'Child',
        access_code: m.access_code,
        room: roomForAge(c.age),
        allergyAlert: extractAllergyAlert(c.notes),
      }))
    );
    return [...separateChildren, ...jsonChildren].map((c: any) => ({
      ...c,
      allergyAlert: c.allergyAlert || extractAllergyAlert(c.notes || c.allergies || c.medical_notes),
    }));
  };

  const handleCheckInSubmit = async (children: any[]) => {
    for (const child of children) {
      const childId = child.id;
      try {
        const res = await fetch(
          `/api/vault?resource=consent&action=check&child_id=${encodeURIComponent(childId)}`
        );
        if (!res.ok) continue;
        const data = await res.json();
        if (data.ok && data.has_missing && data.missing_consents?.length > 0) {
          setCurrentConsentChild(child);
          setMissingConsents(data.missing_consents);
          setPendingCheckIn(children);
          setConsentModalOpen(true);
          return;
        }
      } catch (err) {
        console.warn('Consent check error, proceeding:', err);
      }
    }
    await performCheckIn(children);
  };

  const performCheckIn = async (children: any[]) => {
    try {
      const data = await apiFetch('/api/vault?resource=events&subResource=checkin', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'kids',
          memberIds: children.map((c) => c.id),
          entries: children.map((c) => ({ id: c.id, name: c.name })),
        }),
      });
      if (data.ok) {
        setCheckInCode(data.securityCode);
        setCheckedInChildren(children);
        setShowCodeModal(true);
        setPrintData({
          children: children.map((c) => ({
            ...c,
            room: c.room || roomForAge(c.age),
          })),
          code: data.securityCode,
          date: new Date().toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }),
        });
      } else {
        alert('Check-in failed: ' + (data.error || 'Please try again'));
      }
    } catch (err) {
      console.error(err);
      alert('Check-in failed. Please try again.');
    }
  };

  const handleConsentsCompleted = () => {
    performCheckIn(pendingCheckIn);
    setPendingCheckIn([]);
    setCurrentConsentChild(null);
    setMissingConsents([]);
  };

  const resetToSearch = () => {
    setSelectedFamily(null);
    setCheckInCode(null);
    setPrintData(null);
    setShowCodeModal(false);
    setSearchQuery('');
    setCheckedInChildren([]);
  };

  return (
    <>
      <div id="print-area" className="hidden print:block fixed inset-0 bg-white z-[9999] p-4 text-black font-sans">
        {printData &&
          printData.children.map((child, i) => (
            <div
              key={i}
              className="mb-4 border-2 border-black p-4 w-[300px] h-[200px] flex flex-col justify-between"
              style={{ pageBreakAfter: 'always' }}
            >
              <div>
                <div className="flex justify-between items-start mb-2">
                  <h1 className="text-2xl font-black uppercase leading-none">
                    {child.name.split(' ')[0]}
                  </h1>
                  <span className="text-4xl font-black">{printData.code}</span>
                </div>
                <p className="text-sm font-bold uppercase mb-2">{child.name}</p>
                {child.allergyAlert ? (
                  <div className="mb-2 border-2 border-black bg-black text-white px-2 py-1.5">
                    <p className="text-[9px] font-black uppercase tracking-widest">Allergy / Alert</p>
                    <p className="text-xs font-bold leading-tight">{child.allergyAlert}</p>
                  </div>
                ) : null}
                <div className="flex justify-between items-center border-t-2 border-black pt-2">
                  <div>
                    <p className="text-xs font-bold uppercase">Room</p>
                    <p className="text-xl font-black">{child.room}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold uppercase">Date</p>
                    <p className="text-sm font-bold">{printData.date}</p>
                  </div>
                </div>
              </div>
              <div className="text-center text-[10px] font-bold uppercase tracking-widest pt-2 border-t border-gray-300">
                PLCC Kids Ministry
              </div>
            </div>
          ))}
        {printData && (
          <div
            className="mb-4 border-2 border-black p-4 w-[300px] h-[200px] flex flex-col justify-between"
            style={{ pageBreakAfter: 'always' }}
          >
            <div className="text-center pt-4">
              <h1 className="text-xl font-black uppercase mb-2">Security Tag</h1>
              <p className="text-xs font-bold text-gray-500 uppercase mb-4">
                Keep this tag safe for pickup
              </p>
              <div className="text-6xl font-black">{printData.code}</div>
            </div>
            <div className="text-center text-[10px] font-bold uppercase tracking-widest pt-2 border-t border-gray-300">
              PLCC Kids Ministry
            </div>
          </div>
        )}
      </div>

      <div className="max-w-2xl mx-auto space-y-8 pb-20 pt-6 px-4 print:hidden">
        <div className="text-center">
          <div className="w-14 h-14 bg-gold-cream text-gold rounded-2xl flex items-center justify-center mx-auto mb-4 border border-gold/10">
            <Baby size={28} />
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-[#0d1a14] tracking-tight">
            Kids Check-in
          </h1>
          <p className="text-gray-600 text-base mt-2">
            Find the family, pick the children, then check in.
          </p>
        </div>

        <div className="bg-burgundy/5 border border-burgundy/15 rounded-2xl p-4 flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-burgundy text-gold flex items-center justify-center shrink-0">
            <LogIn size={18} />
          </div>
          <div>
            <p className="font-bold text-[#0d1a14] text-base">Sign in required</p>
            <p className="text-base text-gray-600 mt-1 leading-relaxed">
              Parents and staff must be <span className="font-bold text-burgundy">signed in (logged in)</span> first
              before using Kids Check-in. If you are not signed in, go to Sign In, then come back here.
            </p>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200/60 rounded-2xl p-4 flex items-start gap-3">
          <FileText className="text-burgundy shrink-0 mt-0.5" size={18} />
          <p className="text-sm text-gray-700 leading-relaxed">
            If a form is missing, a signature screen will open here for the parent to sign.
          </p>
        </div>

        {!selectedFamily ? (
          <div className="space-y-6">
            <div className="relative">
              <Search
                className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-300"
                size={22}
                strokeWidth={2.5}
              />
              <input
                type="text"
                placeholder="Search parent or family name..."
                className="w-full pl-14 pr-12 py-4 rounded-2xl bg-white border border-gray-100 shadow-sm outline-none focus:ring-4 focus:ring-burgundy/10 text-lg font-bold text-[#0d1a14] placeholder:text-gray-300"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
              {isLoading && (
                <div className="absolute right-5 top-1/2 -translate-y-1/2">
                  <div className="w-4 h-4 border-2 border-gray-200 border-t-burgundy rounded-full animate-spin" />
                </div>
              )}
            </div>

            <div className="space-y-3">
              {families.map((family) => {
                const parents = family.members.filter(
                  (m: any) => m.role === 'Adult' || !m.role || m.role === 'Member'
                );
                const children = getFamilyChildren(family);
                return (
                  <button
                    key={family.id}
                    onClick={() => {
                      setSelectedFamily({ ...family, parents, children });
                      setCheckInCode(null);
                    }}
                    className="w-full bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:border-burgundy/20 text-left flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <h3 className="font-black text-[#0d1a14] text-lg truncate">{family.name}</h3>
                      <p className="text-xs text-gray-400 mt-1 flex items-center gap-2">
                        <Users size={12} />
                        {children.length} {children.length === 1 ? 'child' : 'children'}
                        {parents[0]?.name ? ` · ${parents.map((p: any) => p.name).join(', ')}` : ''}
                      </p>
                    </div>
                    <span className="text-burgundy font-bold text-sm shrink-0">Select</span>
                  </button>
                );
              })}
              {families.length === 0 && searchQuery && !isLoading && (
                <p className="text-center py-10 text-gray-400 text-sm">
                  No families found. Try another name.
                </p>
              )}
              {!searchQuery && (
                <p className="text-center py-10 text-gray-600 text-base font-medium">Start typing to find a family.</p>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-gray-50 flex items-center justify-between">
              <button
                onClick={() => setSelectedFamily(null)}
                className="flex items-center gap-2 text-sm font-bold text-gray-400 hover:text-burgundy"
              >
                <X size={18} />
                Back
              </button>
              <h3 className="font-black text-[#0d1a14]">{selectedFamily.name}</h3>
              <div className="w-14" />
            </div>

            <div className="p-5 space-y-4">
              {selectedFamily.children.length === 0 ? (
                <p className="text-center py-8 text-gray-400 text-sm">No children listed for this family.</p>
              ) : (
                selectedFamily.children.map((child: any, i: number) => (
                  <div
                    key={i}
                    className="p-5 rounded-2xl bg-gray-50/80 border border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-lg font-black text-[#0d1a14]">{child.name}</h4>
                        <span className="px-2.5 py-0.5 bg-burgundy text-gold rounded-full text-[10px] font-black uppercase">
                          {child.room}
                        </span>
                        {child.alerts && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-red-500 uppercase">
                            <AlertCircle size={12} />
                            Alert
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-400 mt-1">Age: {child.age ?? '—'}</p>
                      {child.alerts && (
                        <p className="mt-2 text-xs font-medium text-red-600">{child.alerts}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleCheckInSubmit([child])}
                      className="shrink-0 px-6 py-3 bg-burgundy text-gold rounded-xl font-bold text-sm hover:opacity-90 active:scale-95"
                    >
                      Check in
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {showCodeModal && checkInCode && (
        <div className="fixed inset-0 z-[300] bg-black/50 flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-green-500 text-white flex items-center justify-center mx-auto">
              <CheckCircle2 size={32} />
            </div>
            <div>
              <h3 className="text-2xl font-black text-[#0d1a14] mb-1">Checked in</h3>
              <p className="text-sm text-gray-500">
                {checkedInChildren.map((c) => c.name).join(', ')}
              </p>
            </div>
            <div className="bg-burgundy rounded-2xl p-6 text-center">
              <div className="inline-flex items-center gap-2 text-gold/80 text-xs font-bold uppercase tracking-widest mb-3">
                <Fingerprint size={16} />
                Pickup code
              </div>
              <div className="bg-white rounded-xl py-6 text-5xl font-black text-burgundy tracking-[0.2em] font-mono">
                {checkInCode}
              </div>
              <p className="text-gold text-sm font-bold mt-4">Take a photo or write this down</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => window.print()}
                className="flex items-center justify-center gap-2 px-4 py-3 border border-gray-200 rounded-xl font-bold text-sm text-burgundy"
              >
                <Printer size={16} />
                Print
              </button>
              <button
                onClick={resetToSearch}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-burgundy text-gold rounded-xl font-bold text-sm"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {currentConsentChild && (
        <ConsentModal
          isOpen={consentModalOpen}
          onClose={() => {
            setConsentModalOpen(false);
            setPendingCheckIn([]);
            setCurrentConsentChild(null);
            setMissingConsents([]);
          }}
          childName={currentConsentChild.name}
          childId={currentConsentChild.id}
          parentId={selectedFamily?.members?.[0]?.id || selectedFamily?.parents?.[0]?.id || ''}
          missingConsents={missingConsents}
          onConsentsCompleted={handleConsentsCompleted}
        />
      )}
    </>
  );
};

export default KidsCheckInPage;
