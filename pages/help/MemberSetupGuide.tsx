import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  HelpCircle,
  Mail,
  ShieldAlert,
  UserPlus,
  Users,
  Church,
} from 'lucide-react';

type GuideStep = {
  title: string;
  body: string;
  image?: string;
  imageAlt?: string;
};

/** Shared steps through account creation (screenshots still match login portal). */
const CREATE_STEPS: GuideStep[] = [
  {
    title: 'Open the PLCC website',
    body: 'Go to sanctum-live-nine.vercel.app. In the top navigation, select PLCC Vault.',
    image: '/docs/guides/member-setup/step-01.jpg',
    imageAlt: 'PLCC website home page with PLCC Vault in the navigation',
  },
  {
    title: 'Choose the Members portal',
    body: 'On the PLCC Vault portal screen, select the Members card.',
    image: '/docs/guides/member-setup/step-02.jpg',
    imageAlt: 'PLCC Vault portal selection showing Members',
  },
  {
    title: 'Select Create account',
    body: 'On Member Access, choose Create account (not Sign in). Use an email address whose inbox you can open.',
    image: '/docs/guides/member-setup/step-03.jpg',
    imageAlt: 'PLCC Vault member access Create account screen',
  },
  {
    title: 'Enter your name and phone',
    body: 'Fill in your first name, last name, and phone number, then continue.',
  },
  {
    title: 'Add email, password, and agree to terms',
    body: 'Enter your email, choose a password, accept the terms, and create your account. After this, PLCC Vault opens the welcome setup wizard.',
  },
];

const PATH_CHOICE_STEP: GuideStep = {
  title: 'Say if you are new or already a member',
  body: 'The first setup screen asks: “Are you new to PLCC, or already part of the church?” Pick I’m new here or I’m already a member. The next screens change based on your answer.',
};

const NEW_PATH_STEPS: GuideStep[] = [
  {
    title: 'Preferred name',
    body: 'Enter the name you want church staff to see. Title (Mr/Ms/Pastor) is optional.',
  },
  {
    title: 'Best phone number',
    body: 'Confirm or enter a phone number so the welcome team can reach you.',
  },
  {
    title: 'How did you hear about PLCC?',
    body: 'Choose one: Sunday visit, family or friend, social media, church event, or other.',
  },
  {
    title: 'What are you hoping for?',
    body: 'Select all that apply — for example Sunday worship, Bible study, kids/youth, baptism or membership class, serving, or prayer support.',
  },
  {
    title: 'Optional note',
    body: 'Add a short note or prayer request if you want. You can skip this and continue.',
  },
  {
    title: 'Review and finish',
    body: 'Check your summary, then select Finish setup. You will land on the dashboard. Staff may still need to assign your full role (Pending).',
  },
];

const CURRENT_PATH_STEPS: GuideStep[] = [
  {
    title: 'Confirm your preferred name',
    body: 'Enter the name you want on your PLCC Vault profile.',
  },
  {
    title: 'Phone and birthday',
    body: 'Add your phone (required) and birthday if you want anniversary blessings. Birthday is optional.',
  },
  {
    title: 'Where do you serve?',
    body: 'Select the ministries you already serve on — or want to plug into. Leave blank if none apply, or type another ministry in the optional field.',
  },
  {
    title: 'How long with PLCC?',
    body: 'Choose less than 1 year, 1–5 years, or 5+ years.',
  },
  {
    title: 'Review and finish',
    body: 'Check your summary, then select Finish setup. Church staff will confirm your account shortly if you are still Pending.',
  },
];

const StepCard: React.FC<{ step: GuideStep; index: number; prefix?: string }> = ({
  step,
  index,
  prefix,
}) => (
  <li className="rounded-2xl border border-[#0d1a14]/8 bg-white overflow-hidden">
    <div className="p-5 md:p-6 flex gap-4">
      <div className="w-10 h-10 rounded-xl bg-burgundy text-gold flex items-center justify-center shrink-0 font-black text-sm">
        {prefix || String(index).padStart(2, '0')}
      </div>
      <div className="min-w-0">
        <h3 className="font-bold text-base">{step.title}</h3>
        <p className="text-sm text-gray-600 font-medium leading-relaxed mt-1.5">{step.body}</p>
      </div>
    </div>
    {step.image ? (
      <figure className="border-t border-[#0d1a14]/6 bg-[#faf9f8]">
        <img
          src={step.image}
          alt={step.imageAlt || step.title}
          loading="lazy"
          className="w-full h-auto block"
        />
        <figcaption className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
          Screenshot
        </figcaption>
      </figure>
    ) : null}
  </li>
);

const MemberSetupGuide: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#F9F9F7] text-[#0d1a14]">
      <header className="border-b border-[#0d1a14]/10 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between gap-4">
          <Link
            to="/login"
            className="inline-flex items-center gap-2 text-sm font-bold text-[#0d1a14]/70 hover:text-[#0d1a14]"
          >
            <ArrowLeft size={16} />
            Back to sign in
          </Link>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-burgundy text-gold text-xs font-black uppercase tracking-wider min-h-[44px]"
          >
            Create account
            <ArrowRight size={14} />
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-10 md:py-14 pb-24">
        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-burgundy/70 mb-3">
          Member help · no login needed
        </p>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight leading-tight">
          How to create your account
        </h1>
        <p className="mt-3 text-gray-600 font-medium leading-relaxed max-w-2xl">
          Create your PLCC Vault login, then choose whether you are <strong className="font-bold text-[#0d1a14]">new to PLCC</strong> or{' '}
          <strong className="font-bold text-[#0d1a14]">already a member</strong>. Each path has a short setup made for you.
        </p>

        <div className="mt-8 grid sm:grid-cols-3 gap-3">
          {[
            { icon: Mail, label: 'Email + password', detail: 'Use an inbox you can open' },
            { icon: Church, label: 'New or current', detail: 'First setup question after signup' },
            { icon: HelpCircle, label: 'Stuck?', detail: 'Refresh once, then ask an PLCC admin' },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-[#0d1a14]/8 bg-white p-4">
              <item.icon size={18} className="text-burgundy mb-2" />
              <p className="text-sm font-bold">{item.label}</p>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">{item.detail}</p>
            </div>
          ))}
        </div>

        <section className="mt-10 rounded-2xl border border-[#0d1a14]/8 bg-white p-5 md:p-7">
          <h2 className="text-lg font-black mb-3">What you will do</h2>
          <ol className="space-y-2 text-sm text-gray-600 font-medium list-decimal list-inside">
            <li>Open PLCC Vault and choose the Members portal</li>
            <li>Create an account with name, phone, email, and password</li>
            <li>Choose New guest or Current member</li>
            <li>Finish that short path, review, and enter the Vault</li>
          </ol>
          <p className="mt-4 text-xs text-gray-500 font-medium leading-relaxed flex items-start gap-2">
            <ShieldAlert size={14} className="shrink-0 mt-0.5 text-burgundy/60" />
            Already have an account? Use Sign in on the login page (email code or passkey). This guide is for first-time Create account.
          </p>
        </section>

        <h2 className="mt-12 text-xl font-black tracking-tight">Part 1 · Create your login</h2>
        <ol className="mt-4 space-y-6">
          {CREATE_STEPS.map((step, index) => (
            <StepCard key={step.title} step={step} index={index + 1} />
          ))}
        </ol>

        <h2 className="mt-12 text-xl font-black tracking-tight">Part 2 · Choose your path</h2>
        <ol className="mt-4 space-y-6" start={CREATE_STEPS.length + 1}>
          <StepCard step={PATH_CHOICE_STEP} index={CREATE_STEPS.length + 1} />
        </ol>

        <div className="mt-10 grid md:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-sky-200 bg-sky-50/50 p-5">
            <div className="flex items-center gap-2 mb-2">
              <UserPlus size={18} className="text-sky-800" />
              <h3 className="font-black text-sky-950">I’m new here</h3>
            </div>
            <p className="text-sm text-sky-900/80 font-medium leading-relaxed">
              Welcome questionnaire: name, phone, how you found PLCC, what you are hoping for, optional note, then review.
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5">
            <div className="flex items-center gap-2 mb-2">
              <Users size={18} className="text-emerald-800" />
              <h3 className="font-black text-emerald-950">I’m already a member</h3>
            </div>
            <p className="text-sm text-emerald-900/80 font-medium leading-relaxed">
              Ministry align: name, phone/birthday, ministries you serve with, how long at PLCC, then review.
            </p>
          </div>
        </div>

        <h2 className="mt-12 text-xl font-black tracking-tight text-sky-950">If you chose: I’m new here</h2>
        <ol className="mt-4 space-y-6">
          {NEW_PATH_STEPS.map((step, index) => (
            <StepCard key={step.title} step={step} index={index + 1} prefix={`N${index + 1}`} />
          ))}
        </ol>

        <h2 className="mt-12 text-xl font-black tracking-tight text-emerald-950">
          If you chose: I’m already a member
        </h2>
        <ol className="mt-4 space-y-6">
          {CURRENT_PATH_STEPS.map((step, index) => (
            <StepCard key={step.title} step={step} index={index + 1} prefix={`C${index + 1}`} />
          ))}
        </ol>

        <section className="mt-10 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5 md:p-7">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="text-emerald-700 shrink-0 mt-0.5" size={22} />
            <div>
              <h2 className="text-lg font-black text-emerald-900">Your account is ready</h2>
              <p className="text-sm text-emerald-900/80 font-medium mt-1 leading-relaxed">
                After Finish setup, you land on your dashboard. If your role is still Pending, a Super Admin will assign Member (or another role) in Staff &amp; Roles. You can update profile and ministries later in Settings.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-[#0d1a14]/8 bg-white p-5 md:p-7">
          <h2 className="text-lg font-black mb-4">Quick troubleshooting</h2>
          <div className="space-y-4 text-sm">
            <div>
              <p className="font-bold">I already have an account</p>
              <p className="text-gray-600 font-medium mt-1">
                Use Sign in (not Create account). Sign-in can use an email code or a passkey if you set one up.
              </p>
            </div>
            <div>
              <p className="font-bold">Picked the wrong path (new vs current)</p>
              <p className="text-gray-600 font-medium mt-1">
                Use Go Back until you return to the first setup question, then choose again. After you finish, contact an PLCC administrator if needed.
              </p>
            </div>
            <div>
              <p className="font-bold">No ministry applies</p>
              <p className="text-gray-600 font-medium mt-1">
                Current members can leave ministry selections blank. New guests can skip the optional note.
              </p>
            </div>
            <div>
              <p className="font-bold">Need to change an answer</p>
              <p className="text-gray-600 font-medium mt-1">
                Use Go Back during setup, or update your profile later under Settings.
              </p>
            </div>
            <div>
              <p className="font-bold">Dashboard says I need access</p>
              <p className="text-gray-600 font-medium mt-1">
                You finished setup but may still be Pending. Ask a Super Admin to assign your role in Settings → Staff &amp; Roles.
              </p>
            </div>
          </div>
        </section>

        <div className="mt-10 flex flex-col sm:flex-row gap-3">
          <Link
            to="/login"
            className="inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-burgundy text-gold text-sm font-black uppercase tracking-wider min-h-[48px]"
          >
            Go to create account
            <ArrowRight size={16} />
          </Link>
          <a
            href="https://sanctum-live-nine.vercel.app"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-white border border-[#0d1a14]/15 text-[#0d1a14] text-sm font-bold min-h-[48px]"
          >
            Visit church website
          </a>
        </div>
      </main>
    </div>
  );
};

export default MemberSetupGuide;
