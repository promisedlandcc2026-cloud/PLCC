import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  X,
  Users,
  CheckCircle2,
  UserPlus,
  LogIn,
  MonitorSmartphone,
  QrCode,
  Hash,
  Eye,
} from 'lucide-react';
import QRCode from 'react-qr-code';
import { apiFetch } from '../../lib/api';

type KioskChoice = 'ask' | 'yes' | 'no';

type CheckInPerson = {
  id: string;
  name: string;
  household: string;
  accessCode?: string;
  avatarUrl?: string;
};

const EventsCheckIn: React.FC = () => {
  const [kioskChoice, setKioskChoice] = useState<KioskChoice>('ask');
  const [query, setQuery] = useState('');
  const [checkedIn, setCheckedIn] = useState<string[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [directMemberId, setDirectMemberId] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [justCheckedIn, setJustCheckedIn] = useState<string | null>(null);
  const [passMember, setPassMember] = useState<CheckInPerson | null>(null);
  const [autoOpenedForQuery, setAutoOpenedForQuery] = useState<string | null>(null);

  const [isVisitorModalOpen, setIsVisitorModalOpen] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [visitorData, setVisitorData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    householdName: '',
  });

  // Support kiosk scanners / deep links: #/events/check-in?code=1234 or ?member=<uuid>
  useEffect(() => {
    const hash = window.location.hash || '';
    const qIndex = hash.indexOf('?');
    if (qIndex === -1) return;
    const params = new URLSearchParams(hash.slice(qIndex + 1));
    const code = params.get('code') || params.get('member') || params.get('id');
    if (code) {
      setKioskChoice('yes');
      setQuery(code.trim());
    }
  }, []);

  const performSearch = async (searchTerm: string) => {
    if (!searchTerm) {
      setSearchResults([]);
      setDirectMemberId(null);
      return;
    }
    setIsSearching(true);
    try {
      const data = await apiFetch(
        `/api/vault?resource=events&subResource=checkin&query=${encodeURIComponent(searchTerm)}`
      );
      if (data.ok) {
        setSearchResults(data.families);
        setDirectMemberId(data.directMemberId || null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => performSearch(query), 500);
    return () => clearTimeout(t);
  }, [query]);

  const results: CheckInPerson[] = useMemo(
    () =>
      searchResults
        .flatMap((f) =>
          f.members.map((m: any) => ({
            id: m.id,
            name: m.name,
            household: f.name,
            accessCode: m.access_code || '',
            avatarUrl: m.avatar_url || '',
          }))
        )
        .filter((user) => !directMemberId || user.id === directMemberId),
    [searchResults, directMemberId]
  );

  // When a 4-digit code or QR id matches one person, show their pass automatically
  useEffect(() => {
    const trimmed = query.trim();
    const isCodeOrId =
      /^\d{4,8}$/.test(trimmed) ||
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);
    if (!isCodeOrId || results.length !== 1 || isSearching) return;
    if (autoOpenedForQuery === trimmed) return;
    setPassMember(results[0]);
    setAutoOpenedForQuery(trimmed);
  }, [query, results, isSearching, autoOpenedForQuery]);

  // Name search path: when one clear match appears, show QR + 4-digit once
  useEffect(() => {
    if (kioskChoice !== 'no') return;
    const trimmed = query.trim();
    if (trimmed.length < 3 || isSearching) return;
    if (results.length !== 1) return;
    if (/^\d{4}$/.test(trimmed)) return;
    if (autoOpenedForQuery === trimmed) return;
    setPassMember(results[0]);
    setAutoOpenedForQuery(trimmed);
  }, [kioskChoice, query, results, isSearching, autoOpenedForQuery]);

  const handleCheckIn = async (id: string) => {
    try {
      const data = await apiFetch('/api/vault?resource=events&subResource=checkin', {
        method: 'POST',
        body: JSON.stringify({ memberIds: [id] }),
      });
      if (data.ok) {
        if (!checkedIn.includes(id)) {
          setCheckedIn([...checkedIn, id]);
        }
        setJustCheckedIn(id);
        setTimeout(() => setJustCheckedIn(null), 2500);
        setPassMember(null);
      } else {
        alert('Check-in failed. Please try again.');
      }
    } catch (e) {
      console.error(e);
      alert('Check-in failed. Please try again.');
    }
  };

  const handleVisitorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsRegistering(true);
    try {
      const res = await fetch('/api/vault?resource=people', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: visitorData.firstName,
          lastName: visitorData.lastName,
          email: visitorData.email,
          phone: visitorData.phone,
          householdName: visitorData.householdName,
          status: 'Visitor',
        }),
      });
      const data = await res.json();
      if (data.ok && data.member) {
        await handleCheckIn(data.member.id);
        setIsVisitorModalOpen(false);
        setVisitorData({ firstName: '', lastName: '', email: '', phone: '', householdName: '' });
      } else {
        alert(data.error || 'Failed to register visitor');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to register visitor');
    } finally {
      setIsRegistering(false);
    }
  };

  const searchPlaceholder =
    kioskChoice === 'yes'
      ? 'Scan QR or type 4-digit code…'
      : kioskChoice === 'no'
        ? 'Type your name to see your code…'
        : 'Search name, phone, or 4-digit code…';

  return (
    <div className="max-w-xl mx-auto space-y-6 pt-8 pb-40 px-4 md:px-0">
      <div className="text-center">
        <h1 className="text-3xl md:text-4xl font-black text-[#0d1a14] mb-2 tracking-tight">
          Check-in
        </h1>
        <p className="text-gray-500 text-sm">
          Find yourself, then check in — or use the kiosk when it is open.
        </p>
      </div>

      <div className="bg-burgundy/5 border border-burgundy/15 rounded-2xl p-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-burgundy text-gold flex items-center justify-center shrink-0">
          <LogIn size={18} />
        </div>
        <div>
          <p className="font-bold text-[#0d1a14] text-sm">Sign in required</p>
          <p className="text-sm text-gray-600 mt-1 leading-relaxed">
            Members must be <span className="font-bold text-burgundy">signed in (logged in)</span> first
            before they can check in. If you are not signed in, go to Sign In, then come back here.
          </p>
        </div>
      </div>

      {/* Kiosk availability */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-gold-cream text-gold flex items-center justify-center shrink-0">
            <MonitorSmartphone size={20} />
          </div>
          <div>
            <p className="font-bold text-[#0d1a14] text-sm">Is a check-in kiosk available?</p>
            <p className="text-sm text-gray-500 mt-1 leading-relaxed">
              The kiosk is the shared screen or tablet at church used for scanning.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setKioskChoice('yes')}
            className={`py-3.5 rounded-xl font-bold text-sm min-h-[48px] border transition-all ${
              kioskChoice === 'yes'
                ? 'bg-burgundy text-gold border-burgundy'
                : 'bg-gray-50 text-[#0d1a14] border-transparent hover:bg-burgundy/5'
            }`}
          >
            Yes — kiosk is open
          </button>
          <button
            type="button"
            onClick={() => setKioskChoice('no')}
            className={`py-3.5 rounded-xl font-bold text-sm min-h-[48px] border transition-all ${
              kioskChoice === 'no'
                ? 'bg-burgundy text-gold border-burgundy'
                : 'bg-gray-50 text-[#0d1a14] border-transparent hover:bg-burgundy/5'
            }`}
          >
            No — show my code
          </button>
        </div>

        {kioskChoice === 'yes' && (
          <div className="rounded-2xl bg-burgundy/[0.04] border border-burgundy/10 p-4 space-y-3">
            <p className="text-sm font-bold text-[#0d1a14]">At the kiosk, do one of these:</p>
            <div className="flex items-start gap-3 text-sm text-gray-600">
              <QrCode size={18} className="text-burgundy shrink-0 mt-0.5" />
              <span>Scan the QR code from your member profile / pass.</span>
            </div>
            <div className="flex items-start gap-3 text-sm text-gray-600">
              <Hash size={18} className="text-burgundy shrink-0 mt-0.5" />
              <span>Or type the <span className="font-bold text-burgundy">4-digit code</span> from your member profile.</span>
            </div>
          </div>
        )}

        {kioskChoice === 'no' && (
          <div className="rounded-2xl bg-amber-50 border border-amber-100 p-4">
            <p className="text-sm text-gray-600 leading-relaxed">
              Type your name below. We will show your <span className="font-bold text-[#0d1a14]">QR code</span> and{' '}
              <span className="font-bold text-[#0d1a14]">4-digit number</span> so you can use them when a kiosk opens —
              or check in right here.
            </p>
          </div>
        )}
      </div>

      {kioskChoice !== 'ask' && (
        <>
          <div className="relative">
            <Search
              className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-300"
              size={22}
              strokeWidth={2.5}
            />
            <input
              type="text"
              inputMode={kioskChoice === 'yes' ? 'numeric' : 'text'}
              placeholder={searchPlaceholder}
              className="w-full pl-14 pr-12 py-4 rounded-2xl bg-white border border-gray-100 shadow-sm outline-none focus:ring-4 focus:ring-burgundy/10 text-lg font-bold text-[#0d1a14] placeholder:text-gray-300"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPassMember(null);
                setAutoOpenedForQuery(null);
              }}
              autoFocus
            />
            {query && (
              <button
                onClick={() => {
                  setQuery('');
                  setPassMember(null);
                  setAutoOpenedForQuery(null);
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-gray-300 hover:text-burgundy"
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            )}
            {isSearching && (
              <div className="absolute right-12 top-1/2 -translate-y-1/2">
                <div className="w-4 h-4 border-2 border-gray-200 border-t-burgundy rounded-full animate-spin" />
              </div>
            )}
          </div>

          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-50">
            {results.length > 0 ? (
              results.map((user) => {
                const done = checkedIn.includes(user.id);
                const flash = justCheckedIn === user.id;
                return (
                  <div
                    key={user.id}
                    className={`p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                      flash ? 'bg-green-50' : ''
                    }`}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center font-black shrink-0 ${
                          done ? 'bg-green-500 text-white' : 'bg-burgundy/5 text-burgundy'
                        }`}
                      >
                        {done ? <CheckCircle2 size={22} /> : user.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-[#0d1a14] truncate">{user.name}</p>
                        <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                          <Users size={11} />
                          {user.household}
                        </p>
                        {user.accessCode && (
                          <p className="text-xs font-bold text-burgundy/70 mt-1 tracking-widest font-mono">
                            Code {user.accessCode}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() => setPassMember(user)}
                        className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl font-bold text-sm bg-gray-50 text-burgundy hover:bg-burgundy/5 min-h-[44px]"
                      >
                        <Eye size={15} />
                        QR / code
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCheckIn(user.id)}
                        disabled={done}
                        className={`flex-1 sm:flex-none px-5 py-3 rounded-xl font-bold text-sm transition-all min-h-[44px] ${
                          done
                            ? 'bg-green-50 text-green-600 cursor-default'
                            : 'bg-burgundy text-gold hover:opacity-90 active:scale-95'
                        }`}
                      >
                        {done ? 'Done' : 'Check in'}
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-12 text-center">
                {query.length > 1 && !isSearching ? (
                  <>
                    <p className="text-gray-500 font-medium mb-6">No one found with that name or code.</p>
                    <button
                      onClick={() => setIsVisitorModalOpen(true)}
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-dashed border-burgundy/30 text-burgundy font-bold text-sm hover:bg-burgundy/5"
                    >
                      <UserPlus size={16} />
                      Register visitor
                    </button>
                  </>
                ) : (
                  <p className="text-gray-400 text-sm">
                    {kioskChoice === 'yes'
                      ? 'Scan a member QR or type a 4-digit code.'
                      : 'Start typing a name to see your QR and code.'}
                  </p>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* Member pass popup: QR + 4-digit */}
      {passMember && (
        <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <p className="text-[10px] font-bold text-gold uppercase tracking-wider">Member pass</p>
                <h2 className="text-xl font-black text-[#0d1a14]">{passMember.name}</h2>
              </div>
              <button
                type="button"
                onClick={() => setPassMember(null)}
                className="p-2.5 text-gray-300 hover:text-burgundy rounded-xl min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Close"
              >
                <X size={22} />
              </button>
            </div>

            <div className="p-6 flex flex-col items-center text-center space-y-5">
              <p className="text-sm text-gray-500 leading-relaxed">
                Show this at the kiosk, or use the 4-digit code there. You can also check in on this phone.
              </p>

              <div className="bg-white p-4 rounded-2xl border-4 border-gold/20 shadow-sm">
                <QRCode
                  value={passMember.id}
                  size={200}
                  style={{ height: 'auto', maxWidth: '100%', width: '100%' }}
                  viewBox="0 0 256 256"
                  fgColor="#0d1a14"
                />
              </div>

              <div className="w-full bg-gray-50 rounded-2xl border border-gray-100 py-5 px-6">
                <p className="text-[10px] uppercase font-black text-gray-400 mb-2 tracking-widest">
                  4-digit code
                </p>
                <p className="text-4xl font-black text-[#0d1a14] tracking-[0.35em] font-mono">
                  {passMember.accessCode || '————'}
                </p>
                {!passMember.accessCode && (
                  <p className="text-xs text-gray-400 mt-2">No code on this profile yet — use the QR or Check in below.</p>
                )}
              </div>

              <p className="text-xs text-gray-400 flex items-center gap-1">
                <Users size={12} />
                {passMember.household}
              </p>

              <div className="w-full flex flex-col gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleCheckIn(passMember.id)}
                  disabled={checkedIn.includes(passMember.id)}
                  className={`w-full py-4 rounded-xl font-bold text-sm min-h-[48px] ${
                    checkedIn.includes(passMember.id)
                      ? 'bg-green-50 text-green-600'
                      : 'bg-burgundy text-gold'
                  }`}
                >
                  {checkedIn.includes(passMember.id) ? 'Already checked in' : 'Check in now'}
                </button>
                <button
                  type="button"
                  onClick={() => setPassMember(null)}
                  className="w-full py-3 text-sm font-bold text-gray-400 hover:text-burgundy min-h-[44px]"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isVisitorModalOpen && (
        <div className="fixed inset-0 z-[200] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-black text-[#0d1a14]">New visitor</h2>
              <button
                onClick={() => setIsVisitorModalOpen(false)}
                className="p-2 text-gray-400 hover:text-burgundy"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleVisitorSubmit} className="space-y-4">
              <input
                required
                placeholder="First name"
                className="w-full px-4 py-3 rounded-xl border border-gray-100 font-medium outline-none focus:ring-2 focus:ring-burgundy/20"
                value={visitorData.firstName}
                onChange={(e) => setVisitorData({ ...visitorData, firstName: e.target.value })}
              />
              <input
                required
                placeholder="Last name"
                className="w-full px-4 py-3 rounded-xl border border-gray-100 font-medium outline-none focus:ring-2 focus:ring-burgundy/20"
                value={visitorData.lastName}
                onChange={(e) => setVisitorData({ ...visitorData, lastName: e.target.value })}
              />
              <input
                placeholder="Phone (optional)"
                className="w-full px-4 py-3 rounded-xl border border-gray-100 font-medium outline-none focus:ring-2 focus:ring-burgundy/20"
                value={visitorData.phone}
                onChange={(e) => setVisitorData({ ...visitorData, phone: e.target.value })}
              />
              <button
                type="submit"
                disabled={isRegistering}
                className="w-full py-4 rounded-xl bg-burgundy text-gold font-bold disabled:opacity-50"
              >
                {isRegistering ? 'Saving…' : 'Save & check in'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default EventsCheckIn;
