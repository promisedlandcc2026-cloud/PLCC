import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MyPointsCard from '../../components/points/MyPointsCard';
import { useNav } from '../../App';
import { useProfileForm } from './profile/useProfileForm';
import { useChildren } from './profile/useChildren';
import { useAccountSecurity } from './profile/useAccountSecurity';
import ProfileSummaryCard from './profile/ProfileSummaryCard';
import PersonalSection from './profile/PersonalSection';
import ChildrenSection from './profile/ChildrenSection';
import MinistriesSection from './profile/MinistriesSection';
import SecuritySection from './profile/SecuritySection';
import SecurityDialog from './profile/SecurityDialog';
import DisplaySection from './profile/DisplaySection';
import SaveBar from './profile/SaveBar';
import { InlineError } from './profile/ui';

const formatRoleLabel = (role: string | null | undefined) =>
  role ? String(role).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Member';

/** Settings → My Profile. Composes the profile sections; logic lives in ./profile hooks. */
const UserSettingsPage: React.FC = () => {
  const nav = useNav();
  const { userId, userRole } = nav;
  const navigate = useNavigate();
  const isSuperAdmin = userRole === 'SUPER_ADMIN';

  const kids = useChildren();
  const form = useProfileForm(nav, kids);
  const security = useAccountSecurity(userId);

  const [photoError, setPhotoError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  const bannerError = form.saveError || photoError;

  useEffect(() => {
    if (bannerError) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [bannerError]);

  useEffect(() => {
    if (!form.savedAt) return;
    setJustSaved(true);
    const t = setTimeout(() => setJustSaved(false), 3000);
    return () => clearTimeout(t);
  }, [form.savedAt]);

  const handleSave = () => {
    setPhotoError(null);
    void form.save();
  };

  const handleDiscard = () => {
    setPhotoError(null);
    form.resetChanges();
  };

  const mfaOn = security.mfaFactors.length > 0;
  const passkeyCount = security.passkeys.length;
  const saveBarProps = {
    isDirty: form.isDirty,
    isSaving: form.isSaving,
    justSaved,
    canSave: !form.passwordError,
    onSave: handleSave,
    onDiscard: handleDiscard,
  };

  return (
    <div className="animate-in fade-in duration-500 pb-28 md:pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-[#0d1a14] tracking-tight">My Profile</h1>
          <p className="text-sm text-gray-600 font-medium mt-1">Your account details, family, and sign-in security.</p>
        </div>
        <SaveBar {...saveBarProps} variant="header" />
      </div>

      <div className="flex flex-col lg:flex-row gap-8 items-start">
        <aside className="w-full lg:w-[280px] lg:sticky lg:top-6 shrink-0 space-y-4">
          <ProfileSummaryCard
            fullName={form.fields.fullName}
            jobTitle={form.fields.jobTitle}
            avatarUrl={form.fields.avatarUrl}
            roleLabel={formatRoleLabel(userRole)}
            mfaOn={mfaOn}
            passkeyCount={passkeyCount}
            onAvatarChange={(url) => {
              setPhotoError(null);
              form.setField('avatarUrl', url);
            }}
            onAvatarError={setPhotoError}
            footer={
              isSuperAdmin ? (
                <button
                  type="button"
                  onClick={() => navigate('/settings?tab=staff-roles')}
                  className="mt-5 w-full text-sm font-bold text-burgundy underline underline-offset-2 hover:text-burgundy-dark"
                >
                  Manage Staff &amp; Roles
                </button>
              ) : null
            }
          />
          <MyPointsCard />
        </aside>

        <div className="flex-1 w-full min-w-0 space-y-8">
          {bannerError ? (
            <div ref={errorRef}>
              <InlineError message={bannerError} />
            </div>
          ) : null}

          <PersonalSection
            fields={form.fields}
            setField={form.setField}
            phoneOnlyAccount={form.phoneOnlyAccount}
            disabled={form.isSaving}
          />

          <ChildrenSection
            children={kids.children}
            busy={kids.busy}
            error={kids.error}
            onAdd={kids.addChild}
            onPromote={kids.promoteChild}
            onRemove={kids.removeChild}
          />

          <MinistriesSection
            teams={form.uniqueTeams}
            status={form.teamsStatus}
            selected={form.memberships}
            onToggle={form.toggleMembership}
            onViewTeams={() => navigate('/teams')}
          />

          <SecuritySection
            password={form.password}
            setPassword={form.setPassword}
            confirmPassword={form.confirmPassword}
            setConfirmPassword={form.setConfirmPassword}
            passwordError={form.passwordError}
            mfaOn={mfaOn}
            passkeyCount={passkeyCount}
            onOpen={(panel) => void security.openPanel(panel)}
            disabled={form.isSaving}
          />

          {userId ? <DisplaySection userId={userId} /> : null}
        </div>
      </div>

      <SecurityDialog security={security} />
      <SaveBar {...saveBarProps} variant="mobile" />
    </div>
  );
};

export default UserSettingsPage;
