import React, { useState, useEffect } from 'react';
import { X, Camera, Lock, Eye, Check } from 'lucide-react';
import { useChurch } from '../context/ChurchContext';
import { MemberRole } from '../types';
import { AvatarDisplay } from './AvatarDisplay';
import { ageFromBirthday, mayHoldOwnContact, normalizeBirthday } from '../lib/memberAge';
import { useNav } from '../../../lib/NavContext';
import { BirthdayMonthDay } from '../../../components/BirthdayMonthDay';

export const EditProfileModal: React.FC = () => {
  const {
    isEditProfileOpen,
    setIsEditProfileOpen,
    selectedMember,
    currentUser,
    updateMemberProfile,
    persistLinkedIdentity,
    linkedChurchRecord,
    isParentOrGuardianOf,
    setIsCropAvatarOpen,
  } = useChurch();
  const { userRole } = useNav();

  const isSuperAdmin = String(userRole || '').toUpperCase() === 'SUPER_ADMIN';
  const isSelf = Boolean(currentUser && selectedMember && currentUser.id === selectedMember.id);
  const isGuardian = Boolean(currentUser && selectedMember && isParentOrGuardianOf(currentUser.id, selectedMember.id));
  const isChildProfile = selectedMember?.householdRole === 'Child' || Boolean(selectedMember?.childLock);
  const canEdit = isSelf || isSuperAdmin || (isGuardian && isChildProfile);

  const [formData, setFormData] = useState({
    fullName: selectedMember?.fullName || '',
    username: selectedMember?.username || '',
    title: selectedMember?.title || '',
    summary: selectedMember?.summary || '',
    bio: selectedMember?.bio || '',
    email: selectedMember?.email || '',
    phone: selectedMember?.phone || '',
    role: (selectedMember?.role || 'MEMBER') as MemberRole,
    dateOfBirth: normalizeBirthday(selectedMember?.dateOfBirth),
    age: selectedMember?.age !== undefined ? String(selectedMember.age) : '',
    showEmail: Boolean(selectedMember?.privacy?.showEmail),
    showPhone: Boolean(selectedMember?.privacy?.showPhone),
    addressAs: selectedMember?.addressAs === 'brother' || selectedMember?.addressAs === 'sister' ? selectedMember.addressAs : '',
  });

  useEffect(() => {
    setFormData({
      fullName: selectedMember?.fullName || '',
      username: selectedMember?.username || '',
      title: selectedMember?.title || '',
      summary: selectedMember?.summary || '',
      bio: selectedMember?.bio || '',
      email: selectedMember?.email || '',
      phone: selectedMember?.phone || '',
      role: selectedMember?.role || 'MEMBER',
      dateOfBirth: normalizeBirthday(selectedMember?.dateOfBirth),
      age: selectedMember?.age !== undefined ? String(selectedMember.age) : '',
      showEmail: Boolean(selectedMember.privacy?.showEmail),
      showPhone: Boolean(selectedMember.privacy?.showPhone),
      addressAs: selectedMember.addressAs === 'brother' || selectedMember.addressAs === 'sister' ? selectedMember.addressAs : '',
    });
  }, [selectedMember]);

  if (!currentUser || !selectedMember || !isEditProfileOpen || !canEdit) return null;

  const previewBirthday = normalizeBirthday(formData.dateOfBirth);
  const previewTypedAge = formData.age.trim() === '' ? undefined : Number(formData.age);
  const previewAge = Number.isFinite(previewTypedAge) ? previewTypedAge : ageFromBirthday(previewBirthday);
  const ownsContact = mayHoldOwnContact({
    age: previewAge,
    householdRole: selectedMember.householdRole,
  });
  // Children and youth keep the full birth date (their age sets Child / Youth);
  // adults give month and day only.
  const fullBirthDate =
    isChildProfile || selectedMember.householdRole === 'Child' || selectedMember.householdRole === 'Youth';
  const canChooseAddress =
    selectedMember.householdRole !== 'Child' &&
    selectedMember.householdRole !== 'Youth' &&
    !(typeof previewAge === 'number' && previewAge < 18);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const birthday = normalizeBirthday(formData.dateOfBirth);
    const computedAge = ageFromBirthday(birthday);
    const typedAge = formData.age.trim() === '' ? undefined : Number(formData.age);
    const age = Number.isFinite(typedAge) ? typedAge : computedAge;
    const ownsContact = mayHoldOwnContact({ age, householdRole: selectedMember.householdRole });
    const dateOfBirth =
      age !== undefined && computedAge !== undefined && age !== computedAge ? undefined : birthday || undefined;
    const updates = {
      fullName: formData.fullName,
      preferredName: formData.fullName,
      username: formData.username,
      title: formData.title,
      summary: formData.summary.slice(0, 160),
      bio: formData.bio,
      email: ownsContact ? formData.email : '',
      phone: ownsContact ? formData.phone : '',
      dateOfBirth,
      age,
      role: isSuperAdmin ? formData.role : selectedMember.role,
      privacy: {
        ...selectedMember.privacy,
        showEmail: ownsContact ? formData.showEmail : false,
        showPhone: ownsContact ? formData.showPhone : false,
      },
      ...(canChooseAddress
        ? {
            addressAs:
              formData.addressAs === 'brother' || formData.addressAs === 'sister' ? formData.addressAs : null,
          }
        : {}),
    };
    updateMemberProfile(selectedMember.id, updates);
    if (isSelf) {
      void persistLinkedIdentity(updates);
    }
    setIsEditProfileOpen(false);
  };

  const remainingChars = 160 - formData.summary.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-xl w-full border border-stone-200 shadow-2xl my-8 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between bg-stone-50/70">
          <div>
            <h3 className="font-semibold text-lg text-stone-900">
              {isSelf ? 'Edit Your Member Profile' : isGuardian ? `Guardian Edit: ${selectedMember.fullName}` : `Admin Edit: ${selectedMember.fullName}`}
            </h3>
            <p className="text-xs text-stone-500">
              Promised Land Christian Center &middot; Member Directory
            </p>
          </div>
          <button
            onClick={() => setIsEditProfileOpen(false)}
            className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-5 max-h-[72vh] overflow-y-auto">
            {/* Avatar section */}
            <div className="flex items-center gap-4 p-4 rounded-xl bg-stone-50 border border-stone-200/80">
              <AvatarDisplay
                name={formData.fullName}
                avatarUrl={selectedMember.avatarUrl}
                size="xl"
              />
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-stone-900">Profile Picture</h4>
                <p className="text-xs text-stone-500">
                  Displayed in directory, small groups, and prayer requests.
                </p>
                <button
                  type="button"
                  onClick={() => setIsCropAvatarOpen(true)}
                  className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#1d372c] bg-white border border-[#1d372c]/30 hover:bg-[#EEF3EF] transition-colors"
                >
                  <Camera className="w-3.5 h-3.5" />
                  Crop or Upload Photo
                </button>
              </div>
            </div>

            {/* Name & Handle */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Full Display Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-[#1d372c]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Username / Handle *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-sm text-stone-400">@</span>
                  <input
                    type="text"
                    required
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full pl-7 pr-3 py-2 text-sm rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-[#1d372c]"
                  />
                </div>
              </div>
            </div>

            {canChooseAddress && (
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">Address as</label>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { value: '', label: 'Name only' },
                      { value: 'brother', label: 'Brother' },
                      { value: 'sister', label: 'Sister' },
                    ] as const
                  ).map((choice) => (
                    <button
                      key={choice.label}
                      type="button"
                      onClick={() => setFormData({ ...formData, addressAs: choice.value })}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg border ${
                        formData.addressAs === choice.value
                          ? 'bg-[#1d372c] text-white border-[#1d372c]'
                          : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'
                      }`}
                    >
                      {choice.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-stone-400 mt-1">
                  Adults are shown as Brother or Sister plus their name. Children keep their given name.
                </p>
              </div>
            )}

            {/* Ministry Title */}
            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Ministry Title / Calling (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Lead Greeter, Youth Choir Alto, Men's Ministry"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-[#1d372c]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  {fullBirthDate ? 'Date of birth' : 'Birthday'}
                </label>
                {!fullBirthDate ? (
                  <BirthdayMonthDay
                    whose="their"
                    value={formData.dateOfBirth}
                    onChange={(dateOfBirth) => setFormData({ ...formData, dateOfBirth })}
                    selectClassName="w-full px-3 py-2 text-sm rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-[#1d372c]"
                  />
                ) : (
                <input
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={(e) => {
                    const dateOfBirth = e.target.value;
                    const age = ageFromBirthday(dateOfBirth);
                    setFormData({
                      ...formData,
                      dateOfBirth,
                      age: age !== undefined ? String(age) : formData.age,
                    });
                  }}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-[#1d372c]"
                />
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">Age</label>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={formData.age}
                  onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                  placeholder="Years"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-[#1d372c]"
                />
                <p className="text-[11px] text-stone-400 mt-1">
                  {fullBirthDate
                    ? 'Age fills in from the date of birth. You can still type it if the date is unknown.'
                    : 'Optional. Type an age only if you want it on the profile.'}
                </p>
              </div>
            </div>

            {isSelf && linkedChurchRecord && (
              <p className="text-[11px] text-stone-500 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">
                Name, how you are addressed, title, birthday, age, and membership role save to this profile and to your church member record.
              </p>
            )}
            {isSelf && !linkedChurchRecord && (
              <p className="text-[11px] text-stone-500 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">
                These details save on this profile. They also update the church database when your account is linked to a member record.
              </p>
            )}

            {/* Role (Admin controlled) */}
            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Membership Role & Tier
              </label>
              {isSuperAdmin ? (
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as MemberRole })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-[#1d372c] bg-white"
                >
                  <option value="MEMBER">Member (Regular church family)</option>
                  <option value="VOLUNTEER">Volunteer (Active ministry server)</option>
                  <option value="LEADER">Leader (Ministry / Deacon / Coordinator)</option>
                  <option value="PASTOR">Pastor (Pastoral leadership)</option>
                  <option value="SUPER_ADMIN">Super Admin (Full Overseer permissions)</option>
                </select>
              ) : (
                <div className="flex items-center gap-2 px-3 py-2 text-xs bg-stone-100 rounded-lg text-stone-600">
                  <Lock className="w-3.5 h-3.5 text-stone-400" />
                  <span>
                    Role is set to <strong className="text-stone-900">{formData.role}</strong> (Only Super Admin can change this).
                  </span>
                </div>
              )}
            </div>

            {/* Short Summary (one-liner max 160 chars) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-stone-700">
                  Short Summary (One-Liner) *
                </label>
                <span
                  className={`text-[11px] font-mono tabular-nums ${
                    remainingChars < 15 ? 'text-rose-600 font-semibold' : 'text-stone-400'
                  }`}
                >
                  {remainingChars} chars remaining
                </span>
              </div>
              <input
                type="text"
                maxLength={160}
                required
                value={formData.summary}
                onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                placeholder="A warm one-sentence spiritual motto or greeting..."
                className="w-full px-3 py-2 text-sm rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-[#1d372c]"
              />
              <p className="text-[11px] text-stone-400 mt-1">
                Appears beneath your name in the directory card and top profile badge.
              </p>
            </div>

            {/* Full Bio */}
            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Full Testimony & Bio (Multi-Line)
              </label>
              <textarea
                rows={5}
                value={formData.bio}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                placeholder="Share your spiritual journey, how you found PLCC, your family, or favorite scripture..."
                className="w-full px-3 py-2 text-sm rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-[#1d372c]"
              />
            </div>

            {/* Contact info & Privacy toggles */}
            <div className="border-t border-stone-200 pt-4 space-y-4">
              <h4 className="text-xs font-semibold text-stone-900 uppercase tracking-wider">
                Contact Information & Directory Privacy
              </h4>
              {!ownsContact && (
                <p className="text-xs text-stone-600">
                  Email and phone stay off this profile. A parent or guardian is the contact.
                </p>
              )}

              {ownsContact && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-[#1d372c]"
                  />
                  <label className="flex items-center gap-2 mt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.showEmail}
                      onChange={(e) => setFormData({ ...formData, showEmail: e.target.checked })}
                      className="rounded accent-[#1d372c]"
                    />
                    <span className="text-xs text-stone-600 flex items-center gap-1">
                      <Eye className="w-3 h-3 text-stone-400" />
                      Show email to church members
                    </span>
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-[#1d372c]"
                  />
                  <label className="flex items-center gap-2 mt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.showPhone}
                      onChange={(e) => setFormData({ ...formData, showPhone: e.target.checked })}
                      className="rounded accent-[#1d372c]"
                    />
                    <span className="text-xs text-stone-600 flex items-center gap-1">
                      <Eye className="w-3 h-3 text-stone-400" />
                      Show phone to church members
                    </span>
                  </label>
                </div>
              </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-stone-50 border-t border-stone-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsEditProfileOpen(false)}
              className="px-4 py-2 text-xs font-medium text-stone-600 hover:text-stone-900 rounded-lg hover:bg-stone-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-semibold text-white bg-[#1d372c] hover:bg-[#12231c] rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              Save Profile Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
