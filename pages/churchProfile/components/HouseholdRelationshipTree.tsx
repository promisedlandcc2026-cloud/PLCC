import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  Home,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Lock,
  Unlock,
  Heart,
  ChevronRight,
  Maximize2,
  Minimize2,
  Sparkles,
  UserPlus,
  Baby,
  Smile,
  Info,
  X
} from 'lucide-react';
import { useChurch } from '../context/ChurchContext';
import { ageFromBirthday, householdRoleAllowedForAge, householdRoleForAge, isVaultMemberId } from '../lib/memberAge';
import { AvatarDisplay } from './AvatarDisplay';
import { Member, Household } from '../types';
import { ParentChildLockModal } from './ParentChildLockModal';

interface HouseholdRelationshipTreeProps {
  household?: Household | null;
  currentProfileMember: Member;
  onOpenManageHousehold?: () => void;
}

export const HouseholdRelationshipTree: React.FC<HouseholdRelationshipTreeProps> = ({
  household,
  currentProfileMember,
  onOpenManageHousehold,
}) => {
  const {
    members,
    households,
    currentUser,
    navigateToMemberProfile,
    toggleChildLock,
    isParentOrGuardianOf,
    updateMemberProfile,
    persistLinkedIdentity,
    updateHousehold,
    removeHouseholdMember,
    addHouseholdMember,
    addExistingToMyHousehold,
  } = useChurch();

  const [isExpandedModalOpen, setIsExpandedModalOpen] = useState(false);
  const [selectedChildForLock, setSelectedChildForLock] = useState<Member | null>(null);
  const [isLockModalOpen, setIsLockModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'tree' | 'grid'>('tree');
  const [editorMode, setEditorMode] = useState<'edit' | 'add' | null>(null);
  const [addingToMine, setAddingToMine] = useState(false);
  const [addRole, setAddRole] = useState<Member['householdRole']>('Independent Member');
  const [addNote, setAddNote] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    preferredName: '',
    fullName: '',
    relationshipTitle: '',
    householdRole: 'Spouse' as Member['householdRole'],
    age: '',
  });

  const canAddThisPerson =
    isVaultMemberId(currentProfileMember.id) &&
    currentProfileMember.id !== currentUser.id &&
    !households.some((item) => {
      const memberIds = Array.isArray(item?.memberIds) ? item.memberIds : [];
      return (
        !String(item?.id || '').startsWith('view-') &&
        memberIds.includes(currentUser.id) &&
        memberIds.includes(currentProfileMember.id)
      );
    });
  const roleChoices = (
    ['Head of Household', 'Spouse', 'Independent Member', 'Youth', 'Child'] as const
  ).filter((role) => householdRoleAllowedForAge(role, currentProfileMember.age));
  const chosenRole = roleChoices.includes(addRole) ? addRole : roleChoices[0] || 'Independent Member';

  const confirmAddToMine = async () => {
    setAddBusy(true);
    setAddNote('');
    const result = await addExistingToMyHousehold(currentProfileMember.id, chosenRole);
    setAddBusy(false);
    if (!result.ok) {
      setAddNote(result.error || 'Could not add that member to your household.');
      return;
    }
    setAddingToMine(false);
    setAddNote(`${currentProfileMember.preferredName || currentProfileMember.fullName} is in your household.`);
  };

  const addToHouseholdPanel = canAddThisPerson ? (
    <div className="rounded-xl border border-[#1d372c]/20 bg-[#EEF3EF]/60 p-3 space-y-2">
      <p className="text-xs text-stone-700">
        {currentProfileMember.preferredName || currentProfileMember.fullName} is not in your household yet.
      </p>
      {addingToMine ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-[11px] text-stone-500" htmlFor="add-household-role">
            Place as
          </label>
          <select
            id="add-household-role"
            value={chosenRole}
            onChange={(e) => setAddRole(e.target.value as Member['householdRole'])}
            className="text-xs font-semibold text-stone-800 bg-white border border-stone-200 rounded-lg px-2 py-1"
          >
            {roleChoices.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={addBusy}
            onClick={() => void confirmAddToMine()}
            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-white bg-[#1d372c] hover:bg-[#12231c] disabled:opacity-60"
          >
            {addBusy ? 'Adding…' : 'Add'}
          </button>
          <button
            type="button"
            onClick={() => setAddingToMine(false)}
            className="text-[11px] text-stone-500 hover:text-stone-800"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAddingToMine(true)}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold text-white bg-[#1d372c] hover:bg-[#12231c]"
        >
          <UserPlus className="w-3.5 h-3.5" />
          Add to my household
        </button>
      )}
      {addNote && <p className="text-[11px] text-stone-600">{addNote}</p>}
    </div>
  ) : addNote ? (
    <p className="text-[11px] text-stone-600">{addNote}</p>
  ) : null;

  if (!household) {
    return (
      <div className="bg-white rounded-2xl p-6 border border-stone-200/90 shadow-xs space-y-3">
        <div className="text-center py-4">
          <Home className="w-8 h-8 text-stone-300 mx-auto mb-2" />
          <p className="text-xs text-stone-500 font-medium">Household is not listed on this profile.</p>
        </div>
        {addToHouseholdPanel}
      </div>
    );
  }

  const householdMemberIds = Array.isArray(household.memberIds) ? household.memberIds : [];

  // Get all members of this household
  const householdMembers = members.filter((m) => householdMemberIds.includes(m.id));

  // Separate into Parents / Guardians (Heads & Spouses) and Children / Youth
  const parents = householdMembers.filter(
    (m) => m.householdRole === 'Head of Household' || m.householdRole === 'Spouse'
  );

  const childrenAndYouth = householdMembers.filter(
    (m) => m.householdRole === 'Child' || m.householdRole === 'Youth'
  );

  // Other members if any (e.g. Independent Member or grandparents)
  const otherMembers = householdMembers.filter(
    (m) =>
      m.householdRole !== 'Head of Household' &&
      m.householdRole !== 'Spouse' &&
      m.householdRole !== 'Child' &&
      m.householdRole !== 'Youth'
  );

  const canManageFamily = householdMemberIds.includes(currentUser.id);
  const enteredAge = draft.age.trim() === '' ? undefined : Number(draft.age);
  const knownAge = Number.isFinite(enteredAge) ? enteredAge : undefined;

  const openEditor = (member?: Member) => {
    if (member) {
      setEditorMode('edit');
      setEditingMemberId(member.id);
      setDraft({
        preferredName: member.preferredName || '',
        fullName: member.fullName,
        relationshipTitle: member.relationshipTitle || member.householdRole,
        householdRole: householdRoleForAge(member.householdRole, member.age),
        age: member.age !== undefined ? String(member.age) : '',
      });
      return;
    }
    setEditorMode('add');
    setEditingMemberId(null);
    setDraft({
      preferredName: '',
      fullName: '',
      relationshipTitle: '',
      householdRole: 'Child',
      age: '',
    });
  };

  const saveEditor = () => {
    const fullName = draft.fullName.trim();
    if (!fullName) return;
    const preferredName = draft.preferredName.trim() || fullName;
    const typedAge = draft.age.trim() === '' ? undefined : Number(draft.age);
    const age = Number.isFinite(typedAge) ? typedAge : undefined;
    const householdRole = householdRoleForAge(draft.householdRole, age);
    const relationshipTitle = draft.relationshipTitle.trim() || householdRole;
    const adultRole =
      householdRole === 'Independent Member' ||
      householdRole === 'Head of Household' ||
      householdRole === 'Spouse';
    if (editorMode === 'edit' && editingMemberId) {
      const existing = members.find((m) => m.id === editingMemberId);
      const birthdayAge = ageFromBirthday(existing?.dateOfBirth);
      updateMemberProfile(editingMemberId, {
        fullName,
        preferredName,
        relationshipTitle,
        householdRole,
        age,
        householdId: household.id,
        ...(adultRole ? { childLock: undefined } : {}),
        ...(age !== undefined && birthdayAge !== undefined && age !== birthdayAge
          ? { dateOfBirth: undefined }
          : {}),
      });
      if (householdRole === 'Head of Household') {
        updateHousehold(household.id, { headMemberId: editingMemberId });
      }
      if (editingMemberId === currentUser.id) {
        void persistLinkedIdentity({ fullName, preferredName });
      }
    } else if (editorMode === 'add') {
      addHouseholdMember(household.id, {
        fullName,
        preferredName,
        relationshipTitle,
        householdRole,
        age: Number.isFinite(age) ? age : undefined,
      });
    }
    setEditorMode(null);
    setEditingMemberId(null);
  };

  const handleOpenLockModal = (child: Member, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedChildForLock(child);
    setIsLockModalOpen(true);
  };

  const handleToggleLockQuick = (child: Member, e: React.MouseEvent) => {
    e.stopPropagation();
    const currentlyLocked = child.childLock?.isLocked ?? false;
    toggleChildLock(child.id, !currentlyLocked);
  };

  const renderMemberNode = (member: Member, isChild: boolean = false) => {
    const isCurrent = member.id === currentProfileMember.id;
    const isLockedChild = isChild && member.childLock?.isLocked;
    const canManageLock = isParentOrGuardianOf(currentUser.id, member.id);

    return (
      <div
        key={member.id}
        onClick={() => navigateToMemberProfile(member.id)}
        className={`group relative flex flex-col items-center p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer text-center bg-white min-w-[130px] sm:min-w-[150px] max-w-[170px] ${
          isCurrent
            ? 'border-[#1d372c] shadow-md ring-2 ring-[#1d372c]/15 bg-gradient-to-b from-[#EEF3EF]/30 to-white'
            : 'border-stone-200/90 hover:border-[#1d372c]/60 hover:shadow-md hover:-translate-y-0.5'
        }`}
      >
        {/* Current profile badge */}
        {isCurrent && (
          <span className="absolute -top-2.5 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-[#1d372c] text-[#E8D8B2] shadow-2xs">
            Viewing Profile
          </span>
        )}

        {/* Lock indicator badge for child */}
        {isChild && (
          <div
            className={`absolute top-2 right-2 p-1 rounded-lg border text-[10px] transition-all ${
              isLockedChild
                ? 'bg-amber-50 border-amber-300 text-amber-800'
                : 'bg-stone-50 border-stone-200 text-stone-500 hover:text-stone-800'
            }`}
            title={
              isLockedChild
                ? `Protected Child Profile (Locked by ${member.childLock?.lockedByParentName || 'Parent'})`
                : 'Public Child Profile'
            }
            onClick={(e) => handleOpenLockModal(member, e)}
          >
            {isLockedChild ? (
              <Lock className="w-3 h-3 text-amber-700" />
            ) : (
              <Unlock className="w-3 h-3 text-stone-400" />
            )}
          </div>
        )}

        {/* Avatar with pulse */}
        <div className="relative mt-1 mb-2 group-hover:scale-105 transition-transform duration-200">
          {isLockedChild && member.childLock?.hidePhotos ? (
            <div className="w-12 h-12 rounded-full bg-amber-100 border-2 border-amber-300 flex items-center justify-center text-amber-800 shadow-xs">
              <Shield className="w-6 h-6 text-amber-700" />
            </div>
          ) : (
            <AvatarDisplay
              name={member.fullName}
              avatarUrl={member.avatarUrl}
              size="md"
              showOnlineStatus
              isOnline={member.isOnline}
            />
          )}

          {/* Child age pill on avatar */}
          {isChild && member.age !== undefined && (
            <span className="absolute -bottom-1 -right-1 px-1.5 py-0.2 rounded-full text-[9px] font-extrabold bg-stone-900 text-amber-300 border border-white shadow-2xs">
              {member.age}y
            </span>
          )}
        </div>

        {/* Member Name */}
        <h4 className="text-xs font-bold text-stone-900 group-hover:text-[#1d372c] transition-colors line-clamp-2">
          {member.preferredName || member.fullName}
        </h4>
        {member.fullName && member.fullName !== member.preferredName && (
          <p className="text-[10px] text-stone-500 line-clamp-1 mt-0.5">
            {member.fullName}
          </p>
        )}

        {/* Relationship badge */}
        <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1">
          <span
            className={`text-[9px] font-semibold px-2 py-0.5 rounded-md uppercase tracking-wider ${
              member.householdRole === 'Head of Household'
                ? 'bg-[#1d372c]/10 text-[#1d372c]'
                : member.householdRole === 'Spouse'
                ? 'bg-rose-50 text-rose-700 border border-rose-200/50'
                : member.householdRole === 'Child'
                ? 'bg-blue-50 text-blue-700 border border-blue-200/50'
                : 'bg-emerald-50 text-emerald-700'
            }`}
          >
            {member.relationshipTitle || member.householdRole}
          </span>
        </div>

        {/* Child protection status label or quick toggle */}
        {isChild && (
          <div className="mt-2 pt-2 border-t border-stone-100 w-full flex items-center justify-between text-[10px]">
            <span
              className={`font-medium ${
                isLockedChild ? 'text-amber-700 font-semibold' : 'text-stone-400'
              }`}
            >
              {isLockedChild ? 'Locked' : 'Public'}
            </span>

            {canManageLock && (
              <button
                type="button"
                onClick={(e) => handleOpenLockModal(member, e)}
                className="text-[10px] text-[#1d372c] hover:underline font-semibold"
              >
                Settings
              </button>
            )}
          </div>
        )}

        {/* Kids View — guardians open their child's dashboard (themes, streaks, badges) */}
        {isChild && canManageFamily && isVaultMemberId(member.id) && (
          <Link
            to={`/family/kids/${member.id}`}
            onClick={(e) => e.stopPropagation()}
            className="mt-2 w-full inline-flex items-center justify-center gap-1 min-h-[32px] rounded-lg text-[10px] font-bold text-[#1d372c] bg-[#EEF3EF] hover:bg-[#f7e6ea]"
            aria-label={`Open Kids View for ${member.preferredName || member.fullName}`}
          >
            <Sparkles className="w-3 h-3" />
            Kids View
          </Link>
        )}

        {canManageFamily && (
          <div className="mt-2 flex items-center justify-center gap-2 text-[10px]">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openEditor(member);
              }}
              className="font-semibold text-[#1d372c] hover:underline"
            >
              Edit
            </button>
            {member.id !== currentUser.id && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeHouseholdMember(household.id, member.id);
                }}
                className="font-semibold text-stone-400 hover:text-rose-700"
              >
                Remove
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderTreeContent = () => (
    <div className="space-y-6">
      {viewMode === 'tree' ? (
        <div className="relative py-2 flex flex-col items-center">
          {/* LEVEL 1: Parents / Heads of Household */}
          <div className="relative flex flex-wrap items-center justify-center gap-4 sm:gap-8 z-10">
            {(parents.length > 0 ? parents : otherMembers).length > 0 ? (
              (parents.length > 0 ? parents : otherMembers).map((parent, idx) => (
                <div key={parent.id} className="relative flex items-center">
                  {renderMemberNode(parent, false)}

                  {/* Marital link bridge if exactly 2 parents */}
                  {idx === 0 && parents.length === 2 && (
                    <div className="hidden sm:flex absolute left-full top-1/2 -translate-y-1/2 w-8 items-center justify-center z-0">
                      <div className="w-full h-0.5 bg-[#C9A35A]"></div>
                      <div
                        className="absolute bg-white px-1 py-0.5 rounded-full border border-[#C9A35A] shadow-2xs"
                        title="Matrimonial Union & Co-Guardians"
                      >
                        <Heart className="w-3 h-3 text-[#1d372c] fill-[#1d372c]" />
                      </div>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-xs text-stone-400 italic">No head/guardian recorded</div>
            )}
          </div>

          {/* TREE BRANCH CONNECTOR (SVG Lines) */}
          {childrenAndYouth.length > 0 && (
            <div className="relative w-full max-w-xl flex flex-col items-center my-3 select-none pointer-events-none">
              {/* Vertical trunk coming down from parents */}
              <div className="w-0.5 h-6 bg-stone-300"></div>

              {/* Horizontal distribution bar if more than 1 child */}
              {childrenAndYouth.length > 1 ? (
                <>
                  <div
                    className="h-0.5 bg-stone-300 rounded-full"
                    style={{
                      width: `${Math.min(95, Math.max(40, (childrenAndYouth.length - 1) * 32))}%`,
                    }}
                  ></div>
                  {/* Small connector node */}
                  <div className="absolute top-6 w-2 h-2 rounded-full bg-[#1d372c] border border-white"></div>
                </>
              ) : (
                <div className="w-0.5 h-3 bg-stone-300"></div>
              )}
            </div>
          )}

          {/* LEVEL 2: Children & Youth */}
          {childrenAndYouth.length > 0 ? (
            <div className="relative flex flex-wrap items-start justify-center gap-3 sm:gap-6 z-10 pt-1">
              {childrenAndYouth.map((child) => (
                <div key={child.id} className="flex flex-col items-center">
                  {/* Stem line dropping to child */}
                  <div className="w-0.5 h-3 bg-stone-300 mb-1"></div>
                  {renderMemberNode(child, true)}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-xs text-stone-400 italic bg-stone-50 rounded-xl px-4 mt-2">
              No registered children or youth in this household record.
            </div>
          )}

          {/* Additional / Other household members if any */}
          {parents.length > 0 && otherMembers.length > 0 && (
            <div className="mt-8 pt-4 border-t border-stone-200/80 w-full text-center">
              <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider mb-3 block">
                Extended Household Members
              </span>
              <div className="flex flex-wrap justify-center gap-3">
                {otherMembers.map((other) => renderMemberNode(other, false))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Grid / Compact View */
        <div className="space-y-4">
          <div>
            <h5 className="text-xs font-bold text-stone-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-[#1d372c]" />
              Parents & Guardians ({parents.length})
            </h5>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {parents.map((p) => renderMemberNode(p, false))}
            </div>
          </div>

          <div>
            <h5 className="text-xs font-bold text-stone-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Baby className="w-3.5 h-3.5 text-blue-600" />
              Children & Youth ({childrenAndYouth.length})
            </h5>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {childrenAndYouth.map((c) => renderMemberNode(c, true))}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-stone-200/90 shadow-xs space-y-4">
        {/* Tree Header */}
        {/* Stacked on purpose: this card usually sits in the narrow side column */}
        <div className="flex flex-col gap-3 pb-3 border-b border-stone-100">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#1d372c] shrink-0"></span>
              <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
                Household Relationship Tree
              </h2>
            </div>
            {canManageFamily ? (
              <div className="mt-1 space-y-1">
                <input
                  value={String(household.name || '')}
                  onChange={(e) => updateHousehold(household.id, { name: e.target.value })}
                  aria-label="Household name"
                  className="w-full text-sm font-semibold text-stone-800 bg-transparent border-b border-stone-200 py-1 focus:outline-none focus:border-[#1d372c]"
                />
                <input
                  value={String(household.address || '')}
                  onChange={(e) => updateHousehold(household.id, { address: e.target.value })}
                  aria-label="Home address"
                  placeholder="Home address"
                  className="w-full text-xs text-stone-600 bg-transparent border-b border-stone-200 py-1 focus:outline-none focus:border-[#1d372c]"
                />
              </div>
            ) : (
              <p className="text-xs text-stone-500 mt-0.5">
                {household.name}
                {household.address ? ` · ${household.address}` : ''} ·{' '}
                <span className="font-semibold text-stone-700">
                  {householdMembers.length} Family Members
                </span>
              </p>
            )}
            {canManageFamily && (
              <p className="text-[11px] text-stone-400 mt-1">
                {householdMembers.length} family {householdMembers.length === 1 ? 'member' : 'members'} · this is your household
              </p>
            )}
            <div className="mt-2">{addToHouseholdPanel}</div>
          </div>

          {/* Controls: Mode toggle + Fullscreen */}
          <div className="flex flex-wrap items-center gap-2">
            {canManageFamily && (
              <button
                type="button"
                onClick={() => openEditor()}
                className="inline-flex items-center gap-1 px-3 min-h-[36px] rounded-xl text-[11px] font-semibold text-[#1d372c] bg-[#EEF3EF] hover:bg-[#f7e6ea] whitespace-nowrap"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Add
              </button>
            )}
            {/* View Mode */}
            <div className="bg-stone-100 p-0.5 rounded-xl flex items-center text-[11px] font-semibold text-stone-600">
              <button
                type="button"
                onClick={() => setViewMode('tree')}
                className={`px-3 min-h-[32px] whitespace-nowrap rounded-lg transition-all ${
                  viewMode === 'tree' ? 'bg-white text-stone-900 shadow-2xs' : 'hover:text-stone-900'
                }`}
              >
                Tree View
              </button>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`px-3 min-h-[32px] whitespace-nowrap rounded-lg transition-all ${
                  viewMode === 'grid' ? 'bg-white text-stone-900 shadow-2xs' : 'hover:text-stone-900'
                }`}
              >
                Grid View
              </button>
            </div>

            {/* Expand Fullscreen */}
            <button
              type="button"
              onClick={() => setIsExpandedModalOpen(true)}
              className="ml-auto w-9 h-9 inline-flex items-center justify-center text-stone-500 hover:text-stone-700 hover:bg-stone-100 rounded-xl transition-colors"
              title="Expand Full Tree View"
              aria-label="Expand full tree view"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tree Description & Quick Legend */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-500 bg-stone-50/70 p-2.5 rounded-xl border border-stone-200/60">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 font-medium">
              <span className="w-2 h-2 rounded-full bg-[#1d372c]"></span>
              Parents / Heads
            </span>
            <span className="flex items-center gap-1 font-medium">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              Children / Dependents
            </span>
            <span className="flex items-center gap-1 font-medium text-amber-800">
              <Lock className="w-3 h-3 text-amber-700" />
              Age-Locked Profile
            </span>
          </div>

          <span className="text-[10px] text-stone-400 italic">
            Click any avatar to navigate
          </span>
        </div>

        {/* The Tree Body */}
        {renderTreeContent()}
      </div>

      {/* Fullscreen Expanded Tree Modal */}
      {isExpandedModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-4xl w-full h-[85vh] border border-stone-200 shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-stone-100 bg-[#EEF3EF]/40 flex items-center justify-between">
              <div className="min-w-0 flex-1 pr-4">
                <h3 className="font-bold text-lg text-stone-900 flex items-center gap-2">
                  <Home className="w-5 h-5 text-[#1d372c]" />
                  {household.name} — Relationship Tree
                </h3>
                {canManageFamily ? (
                  <input
                    value={String(household.address || '')}
                    onChange={(e) => updateHousehold(household.id, { address: e.target.value })}
                    aria-label="Home address"
                    placeholder="Home address"
                    className="mt-1 w-full max-w-md text-xs text-stone-600 bg-transparent border-b border-stone-200 focus:outline-none focus:border-[#1d372c]"
                  />
                ) : (
                  <p className="text-xs text-stone-500">{household.address}</p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsExpandedModalOpen(false)}
                  className="p-2 text-stone-400 hover:text-stone-700 hover:bg-white rounded-xl transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="overflow-y-auto p-6 sm:p-8 flex-1 bg-gradient-to-b from-stone-50/50 to-white">
              {renderTreeContent()}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-stone-100 bg-stone-50 flex items-center justify-between text-xs text-stone-500">
              <span>Navigate between family members with clickable profile nodes.</span>
              <button
                onClick={() => setIsExpandedModalOpen(false)}
                className="px-4 py-1.5 bg-stone-200 hover:bg-stone-300 text-stone-800 rounded-xl font-semibold transition-colors"
              >
                Close Tree
              </button>
            </div>
          </div>
        </div>
      )}

      {editorMode && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-2xl max-w-md w-full border border-stone-200 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-stone-900">
                {editorMode === 'add' ? 'Add family member' : 'Edit family member'}
              </h3>
              <button type="button" onClick={() => setEditorMode(null)} className="text-stone-400 hover:text-stone-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <label className="block text-xs font-medium text-stone-700">
              Name on the tree
              <input
                value={draft.preferredName}
                onChange={(e) => setDraft({ ...draft, preferredName: e.target.value })}
                className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-[#1d372c]"
              />
            </label>
            <label className="block text-xs font-medium text-stone-700">
              Full name
              <input
                required
                value={draft.fullName}
                onChange={(e) => setDraft({ ...draft, fullName: e.target.value })}
                className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-[#1d372c]"
              />
            </label>
            <label className="block text-xs font-medium text-stone-700">
              Relationship
              <input
                value={draft.relationshipTitle}
                onChange={(e) => setDraft({ ...draft, relationshipTitle: e.target.value })}
                placeholder="Father / Head of Household"
                className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-[#1d372c]"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-medium text-stone-700">
                Role
                <select
                  value={draft.householdRole}
                  onChange={(e) =>
                    setDraft({ ...draft, householdRole: e.target.value as Member['householdRole'] })
                  }
                  className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-stone-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#1d372c]"
                >
                  {(['Head of Household', 'Spouse', 'Youth', 'Child', 'Independent Member'] as const).map((role) => (
                    <option key={role} value={role} disabled={!householdRoleAllowedForAge(role, knownAge)}>
                      {role}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-stone-500 mt-1 leading-relaxed">
                  Child is under 13 and age-locked. Youth is 13 to 17. Independent Member is 18 or older in this household, including an adult daughter.
                </p>
              </label>
              <label className="block text-xs font-medium text-stone-700">
                Age
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={draft.age}
                  onChange={(e) => {
                    const age = e.target.value;
                    const typed = age.trim() === '' ? undefined : Number(age);
                    const nextAge = Number.isFinite(typed) ? typed : undefined;
                    setDraft({
                      ...draft,
                      age,
                      householdRole: householdRoleForAge(draft.householdRole, nextAge),
                    });
                  }}
                  className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-[#1d372c]"
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEditorMode(null)}
                className="px-3 py-2 text-xs font-medium text-stone-600 hover:bg-stone-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEditor}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#1d372c] hover:bg-[#12231c] rounded-lg"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Child Lock Settings Modal */}
      {selectedChildForLock && (
        <ParentChildLockModal
          isOpen={isLockModalOpen}
          onClose={() => {
            setIsLockModalOpen(false);
            setSelectedChildForLock(null);
          }}
          childMember={selectedChildForLock}
          mode="settings"
        />
      )}
    </>
  );
};
