import React from 'react';
import { BirthdayMonthDay } from '../../../components/BirthdayMonthDay';
import { Briefcase, Globe, Mail, Smartphone, User } from 'lucide-react';
import { FieldLabel, IconInput, SectionCard } from './ui';
import type { ProfileFields } from './useProfileForm';

type Props = {
  fields: ProfileFields;
  setField: <K extends keyof ProfileFields>(key: K, value: ProfileFields[K]) => void;
  phoneOnlyAccount: boolean;
  disabled?: boolean;
};

const PersonalSection: React.FC<Props> = ({ fields, setField, phoneOnlyAccount, disabled }) => (
  <SectionCard id="profile-personal" icon={Briefcase} title="Personal" subtitle="Name, contact, and birthday">
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <label className="block space-y-1.5 sm:col-span-2">
        <FieldLabel>Full name</FieldLabel>
        <IconInput
          icon={User}
          type="text"
          autoComplete="name"
          value={fields.fullName}
          disabled={disabled}
          onChange={(e) => setField('fullName', e.target.value)}
        />
      </label>

      <label className="block space-y-1.5">
        <FieldLabel>Email</FieldLabel>
        {phoneOnlyAccount ? (
          <div className="h-12 rounded-xl bg-gray-50 border border-gray-100 flex items-center px-3.5 text-sm font-medium text-gray-500">
            <Mail size={16} className="mr-2 text-gray-400 shrink-0" />
            Signed in with phone — no email on file
          </div>
        ) : (
          <IconInput
            icon={Mail}
            type="email"
            autoComplete="email"
            value={fields.email}
            disabled={disabled}
            onChange={(e) => setField('email', e.target.value)}
          />
        )}
      </label>

      <label className="block space-y-1.5">
        <FieldLabel>Phone</FieldLabel>
        <IconInput
          icon={Smartphone}
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          placeholder="0772 123456"
          value={fields.phone}
          disabled={disabled}
          onChange={(e) => setField('phone', e.target.value)}
        />
      </label>

      <label className="block space-y-1.5">
        <FieldLabel>Title</FieldLabel>
        <IconInput
          icon={Globe}
          type="text"
          autoComplete="organization-title"
          placeholder="e.g. Deacon, Usher, Member"
          value={fields.jobTitle}
          disabled={disabled}
          onChange={(e) => setField('jobTitle', e.target.value)}
        />
      </label>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="profile-birthday">
            <FieldLabel hint="optional">Birthday</FieldLabel>
          </label>
          {fields.birthday ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => setField('birthday', '')}
              className="text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-burgundy"
            >
              Remove
            </button>
          ) : null}
        </div>
        <BirthdayMonthDay
          id="profile-birthday"
          value={fields.birthday}
          disabled={disabled}
          onChange={(v) => setField('birthday', v)}
          selectClassName="w-full px-4 py-3.5 rounded-2xl bg-white border border-gray-200 text-base font-semibold text-[#0d1a14] outline-none focus:ring-2 focus:ring-gold/40 disabled:opacity-60"
        />
        <p className="text-[11px] text-gray-500 font-medium">Month and day are enough — your birth year is optional and only saved if you switch it on. Leave blank to keep your birthday off your profile.</p>
      </div>
    </div>
  </SectionCard>
);

export default PersonalSection;
