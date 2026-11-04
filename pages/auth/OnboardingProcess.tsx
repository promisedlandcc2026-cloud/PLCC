import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  Users,
  Sparkles,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Activity,
  Award,
  ShieldAlert,
  Phone,
  Heart,
  Church,
  UserPlus,
  MessageSquare,
} from 'lucide-react';
import { useNav } from '../../App';
import { getAuthHeaders } from '../../lib/api';
import { BirthdayMonthDay } from '../../components/BirthdayMonthDay';

type OnboardingPath = 'new' | 'current';

const HEAR_OPTIONS = [
  { id: 'sunday', label: 'Sunday visit' },
  { id: 'family_friend', label: 'Family or friend' },
  { id: 'social', label: 'Social media' },
  { id: 'event', label: 'Church event' },
  { id: 'other', label: 'Other' },
] as const;

const HOPE_OPTIONS = [
  { id: 'worship', label: 'Sunday worship' },
  { id: 'bible_study', label: 'Bible study' },
  { id: 'kids_youth', label: 'Kids / youth' },
  { id: 'baptism_membership', label: 'Baptism / membership class' },
  { id: 'serving', label: 'Serving somewhere' },
  { id: 'prayer', label: 'Prayer support' },
] as const;

const TENURE_OPTIONS = [
  { id: 'under_1y', label: 'Less than 1 year' },
  { id: '1_5y', label: '1–5 years' },
  { id: '5y_plus', label: '5+ years' },
] as const;

const NEW_STEPS = ['name', 'phone', 'hear', 'hopes', 'note', 'review'] as const;
const CURRENT_STEPS = ['name', 'contact', 'teams', 'tenure', 'review'] as const;

type NewStep = (typeof NEW_STEPS)[number];
type CurrentStep = (typeof CURRENT_STEPS)[number];

const OnboardingProcess: React.FC = () => {
  const { userId, login, userEmail, userName } = useNav();
  const navigate = useNavigate();

  const [path, setPath] = useState<OnboardingPath | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [birthday, setBirthday] = useState('');
  const [heardAbout, setHeardAbout] = useState('');
  const [hopes, setHopes] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [tenure, setTenure] = useState('');
  const [otherMinistry, setOtherMinistry] = useState('');
  const [teams, setTeams] = useState<any[]>([]);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [existingPrefs, setExistingPrefs] = useState<Record<string, unknown>>({});
  const [isDeploying, setIsDeploying] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const flowSteps = path === 'new' ? NEW_STEPS : path === 'current' ? CURRENT_STEPS : [];
  const currentStepKey = path ? flowSteps[stepIndex] : null;
  const totalProgress = path ? flowSteps.length : 1;
  const progressIndex = path ? stepIndex + 1 : 0;

  useEffect(() => {
    const hasName = !!(userName && String(userName).trim());
    if (hasName) {
      navigate('/launcher', { replace: true });
    }
  }, []);

  useEffect(() => {
    fetch('/api/vault?resource=people&subResource=teams')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.ok && Array.isArray(data.teams)) setTeams(data.teams);
      })
      .catch(() => {});
  }, []);

  // Prefill phone + merge notification prefs from self user
  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/vault?resource=users&self=true`, { headers });
        const data = await res.json();
        const user = data?.user || data?.users?.[0];
        if (user?.phone && !phone) setPhone(String(user.phone));
        if (user?.notification_prefs && typeof user.notification_prefs === 'object') {
          setExistingPrefs(user.notification_prefs);
        }
        if (user?.name && !name) setName(String(user.name));
      } catch {
        // non-blocking
      }
    })();
  }, [userId]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const selectedTeamNames = useMemo(
    () =>
      selectedTeamIds
        .map((id) => teams.find((t) => t.id === id)?.name)
        .filter(Boolean) as string[],
    [selectedTeamIds, teams]
  );

  const canProceed = (): boolean => {
    if (!path) return false;
    const key = flowSteps[stepIndex];
    if (key === 'name') return name.trim().length >= 2;
    if (key === 'phone') return phone.trim().length >= 7;
    if (key === 'hear') return !!heardAbout;
    if (key === 'hopes') return hopes.length >= 1;
    if (key === 'contact') return phone.trim().length >= 7;
    if (key === 'tenure') return !!tenure;
    return true; // note, teams, review optional fields
  };

  const choosePath = (next: OnboardingPath) => {
    setPath(next);
    setStepIndex(0);
  };

  const goBack = () => {
    if (stepIndex === 0) {
      setPath(null);
      return;
    }
    setStepIndex((s) => Math.max(0, s - 1));
  };

  const goNext = () => {
    if (!path) return;
    if (stepIndex >= flowSteps.length - 1) {
      startDeployment();
      return;
    }
    setStepIndex((s) => s + 1);
  };

  const toggleHope = (id: string) => {
    setHopes((prev) => (prev.includes(id) ? prev.filter((h) => h !== id) : [...prev, id]));
  };

  const toggleTeam = (id: string) => {
    setSelectedTeamIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const buildAnswers = () => {
    if (path === 'new') {
      return {
        heardAbout,
        hopes,
        note: note.trim() || null,
        phone: phone.trim(),
        title: title.trim() || null,
      };
    }
    return {
      phone: phone.trim(),
      birthday: birthday.trim() || null,
      tenure,
      teamIds: selectedTeamIds,
      teamNames: selectedTeamNames,
      otherMinistry: otherMinistry.trim() || null,
    };
  };

  const startDeployment = () => {
    if (!path || !userId) return;
    setIsDeploying(true);
    setErrorStatus(null);

    const sequence = [
      'Saving your profile...',
      path === 'new' ? 'Welcoming you to PLCC...' : 'Connecting your ministry interests...',
      ...selectedTeamIds.map((id) => {
        const t = teams.find((team) => team.id === id);
        return `Adding you to ${t?.name || 'your team'}...`;
      }),
      'Activating your member access...',
      'Welcome to PLCC Vault — thank you for joining us.',
    ];

    sequence.forEach((msg, i) => {
      setTimeout(async () => {
        setLogs((prev) => [...prev, msg]);
        if (i !== sequence.length - 1) return;

        try {
          const headers = await getAuthHeaders();
          const notification_prefs = {
            ...existingPrefs,
            onboarding: {
              path,
              answers: buildAnswers(),
              completedAt: new Date().toISOString(),
            },
          };

          const payload: Record<string, unknown> = {
            id: userId,
            name: name.trim(),
            email: userEmail,
            phone: phone.trim() || null,
            notification_prefs,
          };
          if (title.trim()) payload.title = title.trim();
          if (path === 'current' && birthday.trim()) payload.birthday = birthday.trim();

          const res = await fetch('/api/vault?resource=users', {
            method: 'PATCH',
            headers: { ...headers, 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(payload),
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => null);
            throw new Error(errData?.error || `Server error: ${res.status}`);
          }

          const data = await res.json();
          login(data.user);

          if (selectedTeamIds.length > 0) {
            await Promise.all(
              selectedTeamIds.map((teamId) =>
                fetch(`/api/vault?resource=people&subResource=teams&action=join`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': userId,
                    ...headers,
                  },
                  body: JSON.stringify({ teamId, memberId: userId }),
                }).catch((e) => console.error('Auto-join failed:', e))
              )
            );
          }

          setTimeout(() => {
            navigate('/launcher', { replace: true });
          }, 1000);
        } catch (err: any) {
          console.error('Onboarding Save Error:', err);
          if (String(err?.message || '').includes('No active session') || err?.status === 401) {
            localStorage.removeItem('awc_auth_token');
            window.location.hash = '#/login';
            return;
          }
          setErrorStatus(err?.message || 'Error saving profile. Please try again.');
          setIsDeploying(false);
          setLogs([]);
        }
      }, i * 650);
    });
  };

  const stepLabel = () => {
    if (!path) return 'Welcome';
    return `Step ${progressIndex} of ${totalProgress}`;
  };

  const ChoiceCard: React.FC<{
    selected: boolean;
    onClick: () => void;
    title: string;
    desc: string;
  }> = ({ selected, onClick, title, desc }) => (
    <button
      type="button"
      onClick={onClick}
      className={`p-5 md:p-6 rounded-2xl border-2 text-left transition-all ${
        selected
          ? 'bg-burgundy text-white border-gold shadow-xl'
          : 'bg-white text-gray-600 border-gray-100 hover:border-burgundy/30'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`font-black text-base md:text-lg ${selected ? 'text-gold' : 'text-[#0d1a14]'}`}>
            {title}
          </p>
          {desc ? (
            <p className={`text-sm mt-1 font-medium ${selected ? 'text-white/70' : 'text-gray-400'}`}>
              {desc}
            </p>
          ) : null}
        </div>
        {selected ? <CheckCircle2 className="text-gold shrink-0" size={22} /> : null}
      </div>
    </button>
  );

  return (
    <div className="min-h-screen bg-[#F9F9F7] flex flex-col font-inter overflow-x-hidden selection:bg-gold selection:text-white">
      {errorStatus && (
        <div className="bg-red-50 border-b border-red-100 px-4 md:px-10 py-3 flex items-center justify-between z-50">
          <div className="flex items-center gap-2 text-red-600">
            <ShieldAlert className="w-4 h-4 md:w-5 md:h-5" />
            <span className="text-[10px] md:text-xs font-bold uppercase tracking-widest">{errorStatus}</span>
          </div>
          <button type="button" onClick={() => setErrorStatus(null)} className="text-red-400 hover:text-red-600">
            <span className="text-xl font-bold leading-none">&times;</span>
          </button>
        </div>
      )}

      <div className="h-20 md:h-24 px-4 md:px-10 border-b border-gray-100 flex items-center justify-between bg-white shrink-0 relative z-20 shadow-sm">
        <div className="flex items-center gap-3 md:gap-4">
          <div className="w-10 h-10 md:w-12 md:h-12 bg-burgundy rounded-xl md:rounded-2xl flex items-center justify-center text-gold shadow-lg">
            <Award className="w-5 h-5 md:w-6 md:h-6" fill="currentColor" />
          </div>
          <div>
            <span className="block text-[10px] md:text-xs font-black uppercase tracking-[0.2em] text-[#0d1a14] leading-none">
              Welcome to PLCC
            </span>
            <span className="block text-[8px] md:text-[10px] font-bold text-gold uppercase tracking-widest mt-1">
              Account setup
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 md:gap-8">
          {path && (
            <div className="flex gap-1.5 md:gap-2">
              {flowSteps.map((_, i) => (
                <div
                  key={i}
                  className={`w-5 md:w-10 h-1 md:h-1.5 rounded-full transition-all duration-500 ${
                    stepIndex >= i ? 'bg-burgundy' : 'bg-gray-100'
                  }`}
                />
              ))}
            </div>
          )}
          <span className="text-[9px] md:text-[11px] font-black text-gray-300 uppercase tracking-widest whitespace-nowrap">
            {stepLabel()}
          </span>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-start md:justify-center p-6 md:p-16 relative">
        <div className="w-full max-w-3xl relative z-10 py-6 md:py-10">
          {/* Step 0 — New vs Current */}
          {!path && (
            <div className="space-y-8 md:space-y-12 animate-in fade-in slide-in-from-bottom-6 duration-700">
              <div className="text-center">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-burgundy text-gold border border-gold/20 mb-6 shadow-lg">
                  <Church className="w-3.5 h-3.5" />
                  <span className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.3em]">
                    First question
                  </span>
                </div>
                <h2 className="text-3xl md:text-5xl font-black text-[#0d1a14] tracking-tight mb-3 leading-tight">
                  Are you new to PLCC, or already part of the church?
                </h2>
                <p className="text-gray-500 font-medium text-sm md:text-lg max-w-xl mx-auto">
                  We’ll personalize the next few steps based on your answer.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <button
                  type="button"
                  onClick={() => choosePath('new')}
                  className="group p-8 md:p-10 rounded-[2rem] bg-white border-2 border-gray-100 hover:border-burgundy/40 shadow-sm hover:shadow-xl transition-all text-left"
                >
                  <div className="w-14 h-14 rounded-2xl bg-burgundy/10 text-burgundy flex items-center justify-center mb-5 group-hover:scale-105 transition-transform">
                    <UserPlus size={28} />
                  </div>
                  <h3 className="text-xl md:text-2xl font-black text-[#0d1a14] mb-2">I’m new here</h3>
                  <p className="text-sm text-gray-500 font-medium leading-relaxed">
                    Visiting or just getting started — tell us a little about yourself so we can welcome you well.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => choosePath('current')}
                  className="group p-8 md:p-10 rounded-[2rem] bg-white border-2 border-gray-100 hover:border-gold/50 shadow-sm hover:shadow-xl transition-all text-left"
                >
                  <div className="w-14 h-14 rounded-2xl bg-gold/20 text-[#0d1a14] flex items-center justify-center mb-5 group-hover:scale-105 transition-transform">
                    <Users size={28} />
                  </div>
                  <h3 className="text-xl md:text-2xl font-black text-[#0d1a14] mb-2">
                    I’m already a member
                  </h3>
                  <p className="text-sm text-gray-500 font-medium leading-relaxed">
                    You attend regularly — confirm your profile and tell us which ministries you serve with.
                  </p>
                </button>
              </div>
            </div>
          )}

          {/* Shared name */}
          {path && currentStepKey === 'name' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-6 duration-500">
              <div className="text-center">
                <h2 className="text-3xl md:text-5xl font-black text-[#0d1a14] tracking-tight mb-3">
                  What should we call you?
                </h2>
                <p className="text-gray-500 font-medium text-sm md:text-lg">
                  Use the name you’d like church staff to see.
                </p>
              </div>
              <div className="max-w-xl mx-auto space-y-5 bg-white p-6 md:p-10 rounded-[2rem] border border-gray-100 shadow-xl">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gold uppercase tracking-[0.2em] ml-1">
                    Preferred name *
                  </label>
                  <div className="relative">
                    <User className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-300" size={20} />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Jordan Smith"
                      className="w-full pl-14 pr-5 py-4 rounded-2xl bg-[#F9F9F7] border border-transparent outline-none focus:ring-4 focus:ring-burgundy/10 focus:bg-white focus:border-burgundy/20 font-bold text-lg text-[#0d1a14]"
                    />
                  </div>
                </div>
                {path === 'new' && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gold uppercase tracking-[0.2em] ml-1">
                      Title (optional)
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Mr / Ms / Pastor — or leave blank"
                      className="w-full px-5 py-4 rounded-2xl bg-[#F9F9F7] border border-transparent outline-none focus:ring-4 focus:ring-burgundy/10 focus:bg-white focus:border-burgundy/20 font-medium text-base text-[#0d1a14]"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* New: phone */}
          {path === 'new' && currentStepKey === 'phone' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-6 duration-500">
              <div className="text-center">
                <h2 className="text-3xl md:text-5xl font-black text-[#0d1a14] tracking-tight mb-3">
                  Best phone number?
                </h2>
                <p className="text-gray-500 font-medium text-sm md:text-lg">
                  So we can reach you about welcome and next steps.
                </p>
              </div>
              <div className="max-w-xl mx-auto bg-white p-6 md:p-10 rounded-[2rem] border border-gray-100 shadow-xl">
                <div className="relative">
                  <Phone className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-300" size={20} />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                    className="w-full pl-14 pr-5 py-4 rounded-2xl bg-[#F9F9F7] border border-transparent outline-none focus:ring-4 focus:ring-burgundy/10 focus:bg-white focus:border-burgundy/20 font-bold text-lg text-[#0d1a14]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* New: hear about */}
          {path === 'new' && currentStepKey === 'hear' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-6 duration-500">
              <div className="text-center">
                <h2 className="text-3xl md:text-5xl font-black text-[#0d1a14] tracking-tight mb-3">
                  How did you hear about PLCC?
                </h2>
              </div>
              <div className="max-w-xl mx-auto grid gap-3">
                {HEAR_OPTIONS.map((opt) => (
                  <ChoiceCard
                    key={opt.id}
                    selected={heardAbout === opt.id}
                    onClick={() => setHeardAbout(opt.id)}
                    title={opt.label}
                    desc=""
                  />
                ))}
              </div>
            </div>
          )}

          {/* New: hopes */}
          {path === 'new' && currentStepKey === 'hopes' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-6 duration-500">
              <div className="text-center">
                <h2 className="text-3xl md:text-5xl font-black text-[#0d1a14] tracking-tight mb-3">
                  What are you hoping for?
                </h2>
                <p className="text-gray-500 font-medium text-sm md:text-lg">Select all that apply.</p>
              </div>
              <div className="max-w-2xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-3">
                {HOPE_OPTIONS.map((opt) => (
                  <ChoiceCard
                    key={opt.id}
                    selected={hopes.includes(opt.id)}
                    onClick={() => toggleHope(opt.id)}
                    title={opt.label}
                    desc=""
                  />
                ))}
              </div>
            </div>
          )}

          {/* New: note */}
          {path === 'new' && currentStepKey === 'note' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-6 duration-500">
              <div className="text-center">
                <h2 className="text-3xl md:text-5xl font-black text-[#0d1a14] tracking-tight mb-3">
                  Anything we should know?
                </h2>
                <p className="text-gray-500 font-medium text-sm md:text-lg">
                  Optional note or prayer request for our welcome team.
                </p>
              </div>
              <div className="max-w-xl mx-auto bg-white p-6 md:p-10 rounded-[2rem] border border-gray-100 shadow-xl">
                <div className="relative">
                  <MessageSquare className="absolute left-5 top-5 text-gray-300" size={20} />
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={4}
                    placeholder="Optional…"
                    className="w-full pl-14 pr-5 py-4 rounded-2xl bg-[#F9F9F7] border border-transparent outline-none focus:ring-4 focus:ring-burgundy/10 focus:bg-white focus:border-burgundy/20 font-medium text-base text-[#0d1a14] resize-y"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Current: phone + birthday */}
          {path === 'current' && currentStepKey === 'contact' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-6 duration-500">
              <div className="text-center">
                <h2 className="text-3xl md:text-5xl font-black text-[#0d1a14] tracking-tight mb-3">
                  Keep your profile current
                </h2>
                <p className="text-gray-500 font-medium text-sm md:text-lg">
                  Phone helps ministry leaders reach you; birthday powers anniversary blessings.
                </p>
              </div>
              <div className="max-w-xl mx-auto space-y-5 bg-white p-6 md:p-10 rounded-[2rem] border border-gray-100 shadow-xl">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gold uppercase tracking-[0.2em] ml-1">
                    Phone *
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-300" size={20} />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(555) 123-4567"
                      className="w-full pl-14 pr-5 py-4 rounded-2xl bg-[#F9F9F7] border border-transparent outline-none focus:ring-4 focus:ring-burgundy/10 focus:bg-white focus:border-burgundy/20 font-bold text-lg text-[#0d1a14]"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gold uppercase tracking-[0.2em] ml-1">
                    Birthday (optional)
                  </label>
                  <BirthdayMonthDay
                    value={birthday}
                    onChange={setBirthday}
                    selectClassName="w-full px-5 py-4 rounded-2xl bg-[#F9F9F7] border border-transparent outline-none focus:ring-4 focus:ring-burgundy/10 focus:bg-white focus:border-burgundy/20 font-bold text-lg text-[#0d1a14]"
                  />
                  <p className="text-[11px] text-gray-400 font-medium ml-1">Month and day are enough — adding your birth year is up to you.</p>
                </div>
              </div>
            </div>
          )}

          {/* Current: teams */}
          {path === 'current' && currentStepKey === 'teams' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-6 duration-500">
              <div className="text-center">
                <h2 className="text-3xl md:text-5xl font-black text-[#0d1a14] tracking-tight mb-3">
                  Where do you serve?
                </h2>
                <p className="text-gray-500 font-medium text-sm md:text-lg">
                  Pick ministries you already serve on — or want to plug into. Skip if none yet.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {teams.length === 0 ? (
                  <p className="sm:col-span-2 text-center text-sm text-gray-400 font-medium py-8">
                    Ministry list isn’t loading right now — you can continue and join later in Settings.
                  </p>
                ) : (
                  teams.map((team) => {
                    const selected = selectedTeamIds.includes(team.id);
                    return (
                      <button
                        key={team.id}
                        type="button"
                        onClick={() => toggleTeam(team.id)}
                        className={`p-5 rounded-2xl border-2 transition-all flex items-center gap-3 text-left ${
                          selected
                            ? 'bg-burgundy text-white border-gold shadow-lg'
                            : 'bg-white border-gray-100 hover:border-burgundy/30'
                        }`}
                      >
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                            selected ? 'bg-gold text-burgundy' : 'bg-gray-100 text-gray-300'
                          }`}
                        >
                          <Users size={18} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`font-bold truncate ${selected ? 'text-gold' : 'text-[#0d1a14]'}`}>
                            {team.name}
                          </p>
                          <p className={`text-[10px] font-bold uppercase ${selected ? 'text-white/60' : 'text-gray-400'}`}>
                            {team.category || 'Ministry'}
                          </p>
                        </div>
                        {selected ? <CheckCircle2 className="text-gold shrink-0" size={20} /> : null}
                      </button>
                    );
                  })
                )}
              </div>
              <div className="max-w-xl mx-auto">
                <label className="text-[10px] font-black text-gold uppercase tracking-[0.2em] ml-1">
                  Other ministry (optional)
                </label>
                <input
                  type="text"
                  value={otherMinistry}
                  onChange={(e) => setOtherMinistry(e.target.value)}
                  placeholder="Not listed? Tell us here"
                  className="mt-2 w-full px-5 py-4 rounded-2xl bg-white border border-gray-100 outline-none focus:ring-4 focus:ring-burgundy/10 focus:border-burgundy/20 font-medium text-base text-[#0d1a14]"
                />
              </div>
            </div>
          )}

          {/* Current: tenure */}
          {path === 'current' && currentStepKey === 'tenure' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-6 duration-500">
              <div className="text-center">
                <h2 className="text-3xl md:text-5xl font-black text-[#0d1a14] tracking-tight mb-3">
                  How long with PLCC?
                </h2>
              </div>
              <div className="max-w-xl mx-auto grid gap-3">
                {TENURE_OPTIONS.map((opt) => (
                  <ChoiceCard
                    key={opt.id}
                    selected={tenure === opt.id}
                    onClick={() => setTenure(opt.id)}
                    title={opt.label}
                    desc=""
                  />
                ))}
              </div>
            </div>
          )}

          {/* Review */}
          {path && currentStepKey === 'review' && (
            <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
              <div className="text-center">
                <h2 className="text-3xl md:text-5xl font-black text-[#0d1a14] tracking-tight mb-3">
                  Looking good
                </h2>
                <p className="text-gray-500 font-medium text-sm md:text-lg max-w-xl mx-auto">
                  {path === 'current'
                    ? 'You’re all set. Finish below to open PLCC Vault — you can update ministries anytime in Settings.'
                    : 'You’re all set. Finish below to open PLCC Vault — welcome to the family. You can update your profile anytime in Settings.'}
                </p>
              </div>
              <div className="max-w-md mx-auto rounded-[2rem] bg-white border border-gray-100 shadow-xl p-8 space-y-4">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-burgundy/5 text-burgundy flex items-center justify-center">
                  <ShieldCheck className="w-7 h-7" />
                </div>
                <p className="text-center text-sm font-bold text-[#0d1a14]">
                  {name.trim()}
                  <span className="block mt-1 text-xs font-semibold text-burgundy/70 uppercase tracking-wider">
                    {path === 'new' ? 'New guest' : 'Current member'}
                  </span>
                </p>
                <ul className="text-sm text-gray-500 font-medium space-y-2 border-t border-gray-50 pt-4">
                  {phone ? (
                    <li className="flex items-center gap-2">
                      <Phone size={14} className="text-gray-300" /> {phone}
                    </li>
                  ) : null}
                  {path === 'new' && heardAbout ? (
                    <li>
                      Heard about us:{' '}
                      {HEAR_OPTIONS.find((h) => h.id === heardAbout)?.label || heardAbout}
                    </li>
                  ) : null}
                  {path === 'new' && hopes.length > 0 ? (
                    <li className="flex items-start gap-2">
                      <Heart size={14} className="text-gray-300 mt-0.5 shrink-0" />
                      <span>
                        Hoping for:{' '}
                        {hopes
                          .map((h) => HOPE_OPTIONS.find((o) => o.id === h)?.label || h)
                          .join(', ')}
                      </span>
                    </li>
                  ) : null}
                  {path === 'current' && selectedTeamNames.length > 0 ? (
                    <li>Ministries: {selectedTeamNames.join(', ')}</li>
                  ) : null}
                  {path === 'current' && tenure ? (
                    <li>
                      With PLCC: {TENURE_OPTIONS.find((t) => t.id === tenure)?.label || tenure}
                    </li>
                  ) : null}
                </ul>
              </div>
            </div>
          )}

          {/* Nav buttons — path choice has its own cards */}
          {path && !isDeploying && (
            <div className="mt-12 md:mt-16 flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={goBack}
                className="flex items-center gap-2 text-[10px] md:text-xs font-black uppercase tracking-[0.2em] text-gray-300 hover:text-burgundy transition-all"
              >
                Go Back
              </button>
              <button
                type="button"
                onClick={goNext}
                disabled={!canProceed()}
                className="group relative px-10 md:px-16 py-5 md:py-7 bg-burgundy text-gold font-black text-xs md:text-sm uppercase tracking-[0.2em] rounded-2xl md:rounded-[2rem] shadow-2xl shadow-burgundy/30 hover:bg-burgundy-dark transition-all active:scale-95 border-b-4 border-gold/40 flex items-center gap-4 disabled:opacity-30 disabled:pointer-events-none"
              >
                {currentStepKey === 'review' ? 'Finish setup' : 'Continue'}
                <ArrowRight className="group-hover:translate-x-2 transition-transform w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {isDeploying && (
        <div className="fixed inset-0 z-[100] bg-white flex flex-col animate-in fade-in duration-700 overflow-y-auto">
          <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-16 text-center">
            <div className="w-32 h-32 md:w-48 md:h-48 mb-10 relative">
              <div className="absolute inset-0 bg-gold/10 rounded-full blur-[60px] animate-pulse" />
              <Loader2 size={160} className="text-burgundy/10 animate-spin relative z-10 mx-auto" strokeWidth={0.5} />
              <div className="absolute inset-0 flex items-center justify-center z-20">
                <CheckCircle2 size={56} className="text-gold animate-pulse" />
              </div>
            </div>
            <h3 className="text-3xl md:text-5xl font-black text-[#0d1a14] tracking-tight mb-8">
              Setting up<span className="text-gold">…</span>
            </h3>
            <div className="w-full max-w-lg bg-white border-2 border-gray-100 rounded-[2rem] p-6 md:p-8 text-left shadow-xl">
              <div className="flex items-center gap-2 mb-4 text-[10px] font-black text-burgundy uppercase tracking-[0.2em]">
                <Activity className="w-3.5 h-3.5" />
                Progress
              </div>
              <div className="space-y-3 max-h-56 overflow-y-auto">
                {logs.map((log, i) => (
                  <div key={i} className="flex items-center gap-3 animate-in slide-in-from-left-4 duration-500">
                    <CheckCircle2 className="text-green-500 shrink-0" size={16} />
                    <span className="text-sm text-[#0d1a14] font-semibold">{log}</span>
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </div>
            <p className="mt-8 text-xs text-gray-400 font-medium flex items-center gap-2">
              <Sparkles size={14} className="text-gold" />
              Ask Admin is ready once you’re in
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default OnboardingProcess;
