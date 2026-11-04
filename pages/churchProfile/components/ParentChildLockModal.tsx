import React, { useState, useEffect } from 'react';
import {
  X,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Lock,
  Unlock,
  KeyRound,
  Eye,
  EyeOff,
  User,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Sparkles
} from 'lucide-react';
import { useChurch } from '../context/ChurchContext';
import { Member, ChildLockSettings } from '../types';
import { ageFromBirthday, normalizeBirthday } from '../lib/memberAge';

interface ParentChildLockModalProps {
  isOpen: boolean;
  onClose: () => void;
  childMember: Member;
  mode?: 'settings' | 'pin_unlock';
}

export const ParentChildLockModal: React.FC<ParentChildLockModalProps> = ({
  isOpen,
  onClose,
  childMember,
  mode = 'settings',
}) => {
  const {
    currentUser,
    toggleChildLock,
    updateChildLockSettings,
    updateMemberProfile,
    verifyParentPin,
    unlockChildForSession,
    isParentOrGuardianOf,
  } = useChurch();

  const isGuardian = isParentOrGuardianOf(currentUser.id, childMember.id);

  // Settings State
  const initialLock = childMember.childLock || {
    isLocked: true,
    parentPin: '1234',
    hideFromDirectory: true,
    hideContactInfo: true,
    hidePhotos: false,
    ageThreshold: 13,
    note: '',
  };

  const [activeTab, setActiveTab] = useState<'settings' | 'pin_unlock'>(mode);
  const [isLocked, setIsLocked] = useState(initialLock.isLocked);
  const [hideFromDirectory, setHideFromDirectory] = useState(initialLock.hideFromDirectory ?? true);
  const [hideContactInfo, setHideContactInfo] = useState(initialLock.hideContactInfo ?? true);
  const [hidePhotos, setHidePhotos] = useState(initialLock.hidePhotos ?? false);
  const [ageThreshold, setAgeThreshold] = useState<number>(initialLock.ageThreshold ?? 13);
  const [parentPin, setParentPin] = useState(initialLock.parentPin || '1234');
  const [note, setNote] = useState(initialLock.note || '');
  const [childBirthday, setChildBirthday] = useState(normalizeBirthday(childMember.dateOfBirth));
  const [childAge, setChildAge] = useState(
    childMember.age !== undefined ? String(childMember.age) : ''
  );

  // PIN Unlock State
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinSuccess, setPinSuccess] = useState(false);

  useEffect(() => {
    setActiveTab(mode);
    setPinError('');
    setEnteredPin('');
    setPinSuccess(false);
  }, [mode, isOpen]);

  useEffect(() => {
    if (childMember.childLock) {
      setIsLocked(childMember.childLock.isLocked);
      setHideFromDirectory(childMember.childLock.hideFromDirectory ?? true);
      setHideContactInfo(childMember.childLock.hideContactInfo ?? true);
      setHidePhotos(childMember.childLock.hidePhotos ?? false);
      setAgeThreshold(childMember.childLock.ageThreshold ?? 13);
      setParentPin(childMember.childLock.parentPin || '1234');
      setNote(childMember.childLock.note || '');
    }
    setChildBirthday(normalizeBirthday(childMember.dateOfBirth));
    setChildAge(childMember.age !== undefined ? String(childMember.age) : '');
  }, [childMember]);

  if (!isOpen) return null;

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: ChildLockSettings = {
      isLocked,
      lockedByParentId: currentUser.id,
      lockedByParentName: currentUser.fullName,
      parentPin: parentPin || '1234',
      hideFromDirectory,
      hideContactInfo,
      hidePhotos,
      ageThreshold,
      note: note.trim() || `Guarded by ${currentUser.fullName} under Child Protection Policy.`,
      lockedAt: isLocked ? new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : undefined,
    };

    const birthday = normalizeBirthday(childBirthday);
    const computedAge = ageFromBirthday(birthday);
    const typedAge = childAge.trim() === '' ? undefined : Number(childAge);
    const age = Number.isFinite(typedAge) ? typedAge : computedAge;
    updateMemberProfile(childMember.id, {
      dateOfBirth:
        age !== undefined && computedAge !== undefined && age !== computedAge ? undefined : birthday || undefined,
      age,
    });
    updateChildLockSettings(childMember.id, updated);
    onClose();
  };

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!enteredPin) {
      setPinError('Please enter the 4-digit parent PIN');
      return;
    }

    const isValid = verifyParentPin(childMember.id, enteredPin);
    if (isValid) {
      setPinError('');
      setPinSuccess(true);
      setTimeout(() => {
        unlockChildForSession(childMember.id);
        onClose();
      }, 500);
    } else {
      setPinError('Incorrect PIN. The default guardian PIN is 1234.');
    }
  };

  const handleQuickGuardianUnlock = () => {
    unlockChildForSession(childMember.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-lg w-full border border-stone-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-5 border-b border-stone-100 bg-[#EEF3EF]/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#1d372c] text-[#E8D8B2] flex items-center justify-center shadow-xs">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-stone-900 leading-tight flex items-center gap-2">
                Parental Privacy & Child Lock
              </h3>
              <p className="text-xs text-stone-500">
                Child Profile: <span className="font-semibold text-stone-800">{childMember.fullName}</span>
                {childMember.age && ` (Age ${childMember.age})`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-white rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch if guardian */}
        {isGuardian && (
          <div className="flex border-b border-stone-100 bg-stone-50/70 px-6 pt-2">
            <button
              onClick={() => setActiveTab('settings')}
              className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-all ${
                activeTab === 'settings'
                  ? 'border-[#1d372c] text-[#1d372c]'
                  : 'border-transparent text-stone-500 hover:text-stone-800'
              }`}
            >
              Parent Controls & Rules
            </button>
            <button
              onClick={() => setActiveTab('pin_unlock')}
              className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-all ${
                activeTab === 'pin_unlock'
                  ? 'border-[#1d372c] text-[#1d372c]'
                  : 'border-transparent text-stone-500 hover:text-stone-800'
              }`}
            >
              Guardian PIN Passcode
            </button>
          </div>
        )}

        {/* Body Content */}
        <div className="overflow-y-auto p-6 space-y-5 flex-1">
          {activeTab === 'settings' ? (
            <form onSubmit={handleSaveSettings} className="space-y-5">
              {/* Main Lock Switch Banner */}
              <div
                className={`p-4 rounded-2xl border transition-all ${
                  isLocked
                    ? 'bg-amber-50/70 border-amber-200 text-amber-950'
                    : 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold ${
                        isLocked ? 'bg-amber-600 text-white' : 'bg-emerald-600 text-white'
                      }`}
                    >
                      {isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold">
                        {isLocked ? 'Child Profile is LOCKED' : 'Child Profile is PUBLIC'}
                      </h4>
                      <p className="text-xs opacity-80 mt-0.5">
                        {isLocked
                          ? 'Profile is hidden/shielded from non-family viewers based on age.'
                          : 'Profile is visible in the member directory.'}
                      </p>
                    </div>
                  </div>

                  {/* Toggle Switch */}
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isLocked}
                      onChange={(e) => setIsLocked(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-stone-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1d372c]"></div>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-stone-700 uppercase tracking-wider">
                    Child birthday
                  </label>
                  <input
                    type="date"
                    value={childBirthday}
                    onChange={(e) => {
                      const dateOfBirth = e.target.value;
                      const age = ageFromBirthday(dateOfBirth);
                      setChildBirthday(dateOfBirth);
                      if (age !== undefined) setChildAge(String(age));
                    }}
                    className="mt-2 w-full px-3 py-2 text-sm rounded-lg border border-stone-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#1d372c]"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-stone-700 uppercase tracking-wider">
                    Child age
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={18}
                    value={childAge}
                    onChange={(e) => setChildAge(e.target.value)}
                    className="mt-2 w-full px-3 py-2 text-sm rounded-lg border border-stone-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#1d372c]"
                  />
                </div>
              </div>

              {/* Age Restriction Rule */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-stone-700 uppercase tracking-wider flex items-center justify-between">
                  <span>Age-Based Auto Protection Rule</span>
                  <span className="text-[#1d372c] font-mono text-[11px] normal-case">
                    Current Age: {childAge || childMember.age || 'Not specified'}
                  </span>
                </label>
                <div className="p-3.5 rounded-xl border border-stone-200 bg-stone-50 space-y-2">
                  <p className="text-xs text-stone-600 leading-relaxed">
                    Lock and restrict profile details automatically for children under a specific age threshold:
                  </p>
                  <div className="flex items-center gap-3 pt-1">
                    {[13, 16, 18].map((age) => (
                      <button
                        key={age}
                        type="button"
                        onClick={() => setAgeThreshold(age)}
                        className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg border transition-all ${
                          ageThreshold === age
                            ? 'bg-[#1d372c] text-white border-[#1d372c] shadow-2xs'
                            : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
                        }`}
                      >
                        Under {age} Years
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Privacy Toggles */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-stone-700 uppercase tracking-wider">
                  Privacy & Masking Controls
                </label>

                <div className="space-y-2">
                  {/* Hide from church directory */}
                  <label className="flex items-center justify-between p-3 rounded-xl border border-stone-200 hover:bg-stone-50 cursor-pointer transition-colors">
                    <div className="flex items-center gap-2.5">
                      <EyeOff className="w-4 h-4 text-stone-500" />
                      <div>
                        <p className="text-xs font-semibold text-stone-800">
                          Hide from Church Directory
                        </p>
                        <p className="text-[11px] text-stone-500">
                          Exclude child from public search results and member directory listings
                        </p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={hideFromDirectory}
                      onChange={(e) => setHideFromDirectory(e.target.checked)}
                      className="w-4 h-4 rounded text-[#1d372c] focus:ring-[#1d372c]"
                    />
                  </label>

                  {/* Hide Contact Info */}
                  <label className="flex items-center justify-between p-3 rounded-xl border border-stone-200 hover:bg-stone-50 cursor-pointer transition-colors">
                    <div className="flex items-center gap-2.5">
                      <Lock className="w-4 h-4 text-stone-500" />
                      <div>
                        <p className="text-xs font-semibold text-stone-800">
                          Mask Contact Info & Phone
                        </p>
                        <p className="text-[11px] text-stone-500">
                          Hide phone numbers, direct email, and addresses from viewers
                        </p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={hideContactInfo}
                      onChange={(e) => setHideContactInfo(e.target.checked)}
                      className="w-4 h-4 rounded text-[#1d372c] focus:ring-[#1d372c]"
                    />
                  </label>

                  {/* Hide Child Photos */}
                  <label className="flex items-center justify-between p-3 rounded-xl border border-stone-200 hover:bg-stone-50 cursor-pointer transition-colors">
                    <div className="flex items-center gap-2.5">
                      <ShieldAlert className="w-4 h-4 text-stone-500" />
                      <div>
                        <p className="text-xs font-semibold text-stone-800">
                          Shield Child Avatar / Photo
                        </p>
                        <p className="text-[11px] text-stone-500">
                          Display protective guardian shield icon instead of photo to general viewers
                        </p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={hidePhotos}
                      onChange={(e) => setHidePhotos(e.target.checked)}
                      className="w-4 h-4 rounded text-[#1d372c] focus:ring-[#1d372c]"
                    />
                  </label>
                </div>
              </div>

              {/* 4-digit Parent PIN */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-stone-700 uppercase tracking-wider flex items-center justify-between">
                  <span>Parent Security PIN Code</span>
                  <span className="text-[11px] text-stone-400 font-normal">Default: 1234</span>
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                  <input
                    type="password"
                    maxLength={6}
                    value={parentPin}
                    onChange={(e) => setParentPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="Enter 4-digit PIN"
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-stone-200 text-sm font-mono tracking-widest focus:outline-hidden focus:ring-2 focus:ring-[#1d372c]/30 focus:border-[#1d372c]"
                  />
                </div>
                <p className="text-[11px] text-stone-500">
                  Allows parents to unlock child profile on any device without switching logins.
                </p>
              </div>

              {/* Parent Note */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-stone-700 uppercase tracking-wider">
                  Guardian Privacy Note
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Protected under PLCC Child Privacy Policy (Under 13)"
                  className="w-full px-3.5 py-2 rounded-xl border border-stone-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-[#1d372c]/30 focus:border-[#1d372c]"
                />
              </div>

              {/* Submit Buttons */}
              <div className="pt-2 flex items-center justify-end gap-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium text-stone-600 hover:text-stone-900 rounded-xl hover:bg-stone-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold bg-[#1d372c] hover:bg-[#12231c] text-white rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Save Child Privacy Rules
                </button>
              </div>
            </form>
          ) : (
            /* PIN Unlock Form */
            <div className="space-y-5 py-2">
              <div className="text-center space-y-2">
                <div className="w-14 h-14 rounded-3xl bg-[#EEF3EF] text-[#1d372c] flex items-center justify-center mx-auto shadow-xs border border-[#C9A35A]/30">
                  <Lock className="w-7 h-7" />
                </div>
                <h4 className="text-base font-bold text-stone-900">
                  Guardian Passcode Required
                </h4>
                <p className="text-xs text-stone-600 max-w-xs mx-auto leading-relaxed">
                  This profile is locked by parents under the church child protection policy.
                  Enter the 4-digit guardian PIN code to view details.
                </p>
              </div>

              <form onSubmit={handlePinSubmit} className="space-y-4 max-w-xs mx-auto">
                <div>
                  <input
                    type="password"
                    maxLength={4}
                    value={enteredPin}
                    onChange={(e) => {
                      setEnteredPin(e.target.value.replace(/\D/g, ''));
                      setPinError('');
                    }}
                    placeholder="••••"
                    autoFocus
                    className="w-full text-center text-2xl font-mono tracking-[0.5em] py-3 rounded-2xl border-2 border-stone-300 focus:border-[#1d372c] focus:ring-2 focus:ring-[#1d372c]/20 focus:outline-hidden"
                  />
                  {pinError && (
                    <p className="text-xs text-red-600 mt-2 text-center font-medium">
                      {pinError}
                    </p>
                  )}
                  {pinSuccess && (
                    <p className="text-xs text-emerald-600 mt-2 text-center font-bold flex items-center justify-center gap-1">
                      <CheckCircle2 className="w-4 h-4" />
                      PIN Verified! Unlocking...
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <button
                    type="submit"
                    className="w-full py-2.5 px-4 bg-[#1d372c] hover:bg-[#12231c] text-white text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2"
                  >
                    <Unlock className="w-4 h-4" />
                    Unlock Child Profile
                  </button>

                  {isGuardian && (
                    <button
                      type="button"
                      onClick={handleQuickGuardianUnlock}
                      className="w-full py-2 px-4 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5"
                    >
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      Instant Guardian Unlock (Verified Parent)
                    </button>
                  )}
                </div>

                <div className="pt-2 text-center">
                  <span className="text-[11px] text-stone-400">
                    Parent or church leaders can reset the PIN in Household settings.
                  </span>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
