import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  CheckCircle2,
  Loader2,
  Users,
  Baby,
  Phone,
  User,
  AlertTriangle,
  PenLine,
  Shirt,
  DollarSign,
  UserPlus,
  Lock,
  Send,
  CreditCard,
  ExternalLink,
  ShieldCheck,
  ArrowRight,
  Clock,
} from 'lucide-react';
import ConsentNoticeDocument from '../../components/Consent/ConsentNoticeDocument';
import { parseRsvpContribution, rsvpGiftOptions } from '../../api/_utils/cookoutFoodContribution';
import {
  DEFAULT_FELLOWSHIP_EVENT_ID,
  THANKSGIVING_2026_EVENT_ID,
  eventFundName,
  getFellowshipEventConfig,
} from '../../api/_utils/fellowshipEventConfig';
import {
  closedMessageForName,
  isKnownFellowshipKitId,
} from '../../api/_utils/eventRsvpConfig';
import type { GiftPaymentIntent, RsvpPaymentMethodPublic } from '../../api/_utils/rsvpGiftPayment';
import {
  buildTitheRsvpPayUrl,
  rsvpPartyLine,
  rsvpReturnUrl,
  shortEventDate,
  type RsvpPayStatus,
} from '../../api/_utils/rsvpGiftPayment';

import { formatCurrency } from '../../utils/formatters';
/** Display serif (Fraunces, loaded in index.html) — matches PLCC Tithe's amounts. */
const SERIF: React.CSSProperties = { fontFamily: "'Fraunces', Georgia, serif" };

type PublicRsvpConfig = {
  eventId: string;
  name: string;
  shortName: string;
  date: string;
  timeLabel: string;
  location: string;
  template: 'simple' | 'fellowship';
  rsvpCloseAt: string;
  closed: boolean;
  giftMin: number;
  tshirtsEnabled: boolean;
  maxAdultsFromHome: number;
  submitLabel: string;
  menuItems: string[];
  paymentChoiceEnabled: boolean;
  paymentMethods: RsvpPaymentMethodPublic[];
  giftOptions: number[];
  giftHint: string | null;
  giftPerPerson: boolean;
  allowPledge: boolean;
  fundName: string | null;
};

const FOOD_ALLERGY_CONSENT_TEXT = `FOOD ALLERGY & MEAL SAFETY NOTICE
Promised Land Christian Center (PLCC)

At Promised Land Christian Center, we care deeply about the health and safety of every child and family in our church community. Some meals and snacks served at church may contain common food allergens.

FOODS COMMONLY SERVED
{{MENU_LINES}}

These foods may contain or come into contact with allergens such as peanuts, tree nuts, milk, eggs, soy, wheat, fish, or shellfish.

PLEASE HELP US PREVENT ALLERGIC REACTIONS
• Always ask about ingredients before eating
• Do not share food with others
• Supervise children closely during meals and snacks
• Inform church staff immediately of any known allergies
• Keep emergency medication (such as an EpiPen) available if prescribed

IMPORTANT
Promised Land Christian Center cannot guarantee an allergen-free environment. Parents and guardians remain responsible for monitoring what their children eat while on church premises.

IN CASE OF AN EMERGENCY
If someone shows signs of an allergic reaction — such as difficulty breathing, swelling, hives, or dizziness:

CALL 911 IMMEDIATELY

Then notify church staff right away.

This consent is valid for one (1) year from the date signed.`;

const INJURY_CONSENT_TEXT = `PREMISES INJURY & PARENT SUPERVISION CONSENT
Promised Land Christian Center (PLCC)

Church-campus gatherings (fellowship meals, cookouts, and similar events) include outdoor play, running, games, and shared spaces. Children may get scrapes, bumps, or other injuries while playing.

PARENT SUPERVISION
• Parents / guardians are responsible for watching their own children on church grounds during this event
• PLCC does not provide one-to-one childcare for every child at open fellowship events unless Kids Check-In / nursery is separately running
• You agree to keep your children in sight and follow safe play directions

IF A CHILD IS HURT
• You will be notified when possible
• Basic first aid may be given
• 911 may be called for serious injury
• You remain responsible for medical decisions and costs for your child

IMPORTANT
Play on church premises involves risk of injury. You are responsible for supervising your own children at this event. You will not hold Promised Land Christian Center, its leaders, staff, or volunteers liable for ordinary accidents or injuries while your children are under your care on the premises.

IN CASE OF AN EMERGENCY
For serious injury on church premises:

CALL 911 IMMEDIATELY

Then notify church leaders right away.

This consent is required when children are attending.`;

const TSHIRT_SIZE_OPTIONS = [
  'Youth S',
  'Youth M',
  'Youth L',
  'Adult XS',
  'Adult S',
  'Adult M',
  'Adult L',
  'Adult XL',
  'Adult 2XL',
  'Adult 3XL',
] as const;

type TshirtSizeKey = (typeof TSHIRT_SIZE_OPTIONS)[number];

const emptyTshirtCounts = (): Record<TshirtSizeKey, number> =>
  Object.fromEntries(TSHIRT_SIZE_OPTIONS.map((s) => [s, 0])) as Record<TshirtSizeKey, number>;

const formatTshirtSizes = (counts: Record<TshirtSizeKey, number>): string =>
  TSHIRT_SIZE_OPTIONS.filter((s) => counts[s] > 0)
    .map((s) => `${s}×${counts[s]}`)
    .join(', ');

const DEFAULT_MENU_LINES = ['• Rice', '• Potatoes', '• Meat', '• Chicken'].join('\n');

function buildAllergyConsentText(menuItems?: string[]): string {
  const menuLines =
    menuItems && menuItems.length
      ? menuItems.map((item) => `• ${item}`).join('\n')
      : DEFAULT_MENU_LINES;
  return FOOD_ALLERGY_CONSENT_TEXT.replace('{{MENU_LINES}}', menuLines);
}

function composeAllergiesField(opts: {
  none: boolean;
  menuAvoid: string[];
  notes: string;
}): string {
  if (opts.none) return 'None';
  const notes = opts.notes.trim();
  const avoid = opts.menuAvoid;
  if (avoid.length && notes) return `Allergic / please avoid: ${avoid.join(', ')}. ${notes}`;
  if (avoid.length) return `Allergic / please avoid: ${avoid.join(', ')}`;
  return notes;
}

const FellowshipCookoutRsvp: React.FC = () => {
  const { eventId: routeEventId } = useParams<{ eventId?: string }>();
  const [searchParams] = useSearchParams();
  const eventId =
    routeEventId || searchParams.get('eventId') || DEFAULT_FELLOWSHIP_EVENT_ID;

  const fallbackCfg = useMemo((): PublicRsvpConfig => {
    if (!isKnownFellowshipKitId(eventId)) {
      return {
        eventId,
        name: 'Event signup',
        shortName: 'Event',
        date: '',
        timeLabel: '',
        location: '',
        template: 'simple',
        rsvpCloseAt: new Date(Date.now() + 86400000).toISOString(),
        closed: false,
        giftMin: 0,
        tshirtsEnabled: false,
        maxAdultsFromHome: 8,
        submitLabel: 'Sign up',
        menuItems: [],
        paymentChoiceEnabled: false,
        paymentMethods: [],
        giftOptions: [],
        giftHint: null,
        giftPerPerson: false,
        allowPledge: false,
        fundName: null,
      };
    }
    const kit = getFellowshipEventConfig(eventId);
    return {
      eventId: kit.eventId,
      name: kit.name,
      shortName: kit.shortName,
      date: kit.date,
      timeLabel: kit.timeLabel,
      location: kit.location,
      template: 'fellowship',
      rsvpCloseAt: kit.rsvpCloseAt,
      closed: Date.now() >= Date.parse(kit.rsvpCloseAt),
      giftMin: kit.giftMin,
      tshirtsEnabled: kit.tshirtsEnabled,
      maxAdultsFromHome: kit.maxAdultsFromHome,
      submitLabel: kit.submitLabel,
      menuItems: kit.menuItems || [],
      paymentChoiceEnabled: Boolean(kit.paymentChoiceEnabled),
      paymentMethods: kit.paymentMethods || [],
      giftOptions: rsvpGiftOptions(kit.giftMin, kit.giftOptions),
      giftHint: kit.giftHint || null,
      giftPerPerson: Boolean(kit.giftPerPerson),
      allowPledge: true,
      fundName: eventFundName(kit.eventId, kit.name),
    };
  }, [eventId]);

  const [eventCfg, setEventCfg] = useState<PublicRsvpConfig>(fallbackCfg);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  const closeAtMs = Date.parse(eventCfg.rsvpCloseAt);
  const maxAdults = Math.max(1, Number(eventCfg.maxAdultsFromHome) || 2);
  const menuItems = eventCfg.menuItems || [];
  const isSimple = eventCfg.template === 'simple';
  const allergyConsentText = useMemo(
    () => buildAllergyConsentText(eventCfg.menuItems),
    [eventCfg.menuItems]
  );

  const [signupsClosed, setSignupsClosed] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [headcount, setHeadcount] = useState('1');
  const [adultsCount, setAdultsCount] = useState('1');
  const [childrenCount, setChildrenCount] = useState('0');
  const [guestsInvited, setGuestsInvited] = useState('0');
  const [foodContribution, setFoodContribution] = useState('');
  const [giftIntent, setGiftIntent] = useState<GiftPaymentIntent | ''>('pay_now');
  const [amountMode, setAmountMode] = useState<'preset' | 'other'>('preset');
  /** Saved and on the way to PLCC Tithe to pay. */
  const [redirectingToTithe, setRedirectingToTithe] = useState<string | null>(null);
  /** Back from PLCC Tithe (or opened from a pay link): show this signup's status. */
  const returnRegistrationId = searchParams.get('r');
  const [allergiesNone, setAllergiesNone] = useState(false);
  const [menuAvoid, setMenuAvoid] = useState<string[]>([]);
  const [allergyNotes, setAllergyNotes] = useState('');
  const [tshirtCounts, setTshirtCounts] = useState<Record<TshirtSizeKey, number>>(emptyTshirtCounts);
  const [allergyAck, setAllergyAck] = useState(false);
  const [injuryAck, setInjuryAck] = useState(false);
  const [parentSignName, setParentSignName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  /** Saved RSVP id — the PLCC Tithe link carries it so the gift can be matched back. */
  const [registrationId, setRegistrationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setConfigLoading(true);
    setConfigError(null);
    setEventCfg(fallbackCfg);
    (async () => {
      try {
        const res = await fetch(
          `/api/vault?resource=events&subResource=rsvp-config&eventId=${encodeURIComponent(eventId)}`
        );
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data.ok) {
          setConfigError(data.error || 'Signup is not available for this event');
          setConfigLoading(false);
          return;
        }
        setEventCfg({
          eventId: data.eventId,
          name: data.name,
          shortName: data.shortName,
          date: data.date,
          timeLabel: data.timeLabel,
          location: data.location || '',
          template: data.template === 'simple' ? 'simple' : 'fellowship',
          rsvpCloseAt: data.rsvpCloseAt,
          closed: Boolean(data.closed),
          giftMin: Number(data.giftMin) || 0,
          tshirtsEnabled: Boolean(data.tshirtsEnabled),
          maxAdultsFromHome: Number(data.maxAdultsFromHome) || 8,
          submitLabel: data.submitLabel || 'Sign up',
          menuItems: Array.isArray(data.menuItems) ? data.menuItems : [],
          paymentChoiceEnabled: Boolean(data.paymentChoiceEnabled),
          paymentMethods: Array.isArray(data.paymentMethods) ? data.paymentMethods : [],
          giftOptions: Array.isArray(data.giftOptions) ? data.giftOptions.map(Number) : [],
          giftHint: typeof data.giftHint === 'string' && data.giftHint ? data.giftHint : null,
          giftPerPerson: data.giftPerPerson === true,
          allowPledge: data.allowPledge !== false,
          fundName: typeof data.fundName === 'string' ? data.fundName : null,
        });
        setSignupsClosed(Boolean(data.closed));
        setConfigLoading(false);
      } catch {
        if (!cancelled) {
          setConfigError('Could not load signup page');
          setConfigLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId, fallbackCfg]);

  const adultOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [
      { value: '1', label: '1 — Just me' },
      { value: '2', label: '2 — Me and my spouse' },
    ];
    for (let n = 3; n <= maxAdults; n++) {
      opts.push({
        value: String(n),
        label: `${n} — Including adult children at home`,
      });
    }
    return opts;
  }, [maxAdults]);

  useEffect(() => {
    setMenuAvoid([]);
    setAllergiesNone(false);
    setAllergyNotes('');
    setAdultsCount((prev) => (Number(prev) > maxAdults ? String(maxAdults) : prev));
  }, [eventId, maxAdults]);

  // Keep the closed flag in sync until rsvpCloseAt. Do not use one long setTimeout —
  // delays over ~24.8 days overflow the 32-bit timer and fire immediately (false "closed").
  useEffect(() => {
    if (signupsClosed) return;
    if (!Number.isFinite(closeAtMs)) return;

    const tick = () => {
      if (Date.now() >= closeAtMs) {
        setSignupsClosed(true);
        return true;
      }
      return false;
    };
    if (tick()) return;

    const MAX_TIMEOUT_MS = 2_147_483_647; // signed 32-bit max for setTimeout
    let timer: number | undefined;
    const schedule = () => {
      const remaining = closeAtMs - Date.now();
      if (remaining <= 0) {
        setSignupsClosed(true);
        return;
      }
      const delay = Math.min(remaining, MAX_TIMEOUT_MS);
      timer = window.setTimeout(() => {
        if (!tick()) schedule();
      }, delay);
    };
    schedule();
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [signupsClosed, closeAtMs]);

  // Per-person events (Marrieds Dinner): the amount scales with adults from the home.
  const giftPeople = eventCfg.giftPerPerson ? Math.max(1, Number(adultsCount) || 1) : 1;
  const effectiveGiftMin = eventCfg.giftMin * giftPeople;

  const giftButtons = useMemo(
    () =>
      (eventCfg.giftOptions.length ? eventCfg.giftOptions : rsvpGiftOptions(eventCfg.giftMin))
        .slice(0, 4)
        .map((n) => n * giftPeople),
    [eventCfg.giftOptions, eventCfg.giftMin, giftPeople]
  );

  const giftEntered = Number(String(foodContribution).replace(/[$,\s]/g, ''));
  const giftTooLow =
    !isSimple && eventCfg.giftMin > 0 && (!Number.isFinite(giftEntered) || giftEntered < effectiveGiftMin);

  // Picking "Me and my spouse" sets $200 automatically (back to $100 for "Just me").
  useEffect(() => {
    if (!eventCfg.giftPerPerson || !eventCfg.giftMin) return;
    setAmountMode('preset');
    setFoodContribution(String(eventCfg.giftMin * giftPeople));
  }, [eventCfg.giftPerPerson, eventCfg.giftMin, giftPeople]);

  /** PLCC Tithe link for this signup: amount, event fund, name and email filled in, and a way back. */
  const titheLinkFor = (regId: string, amount: number): string =>
    buildTitheRsvpPayUrl({
      registrationId: regId,
      amount,
      label: `${eventCfg.shortName || eventCfg.name} RSVP`,
      fund: eventCfg.fundName || eventFundName(eventCfg.eventId, eventCfg.name) || undefined,
      name: name.trim() || null,
      email: email.trim() || null,
      detail: rsvpPartyLine({
        name,
        adults: Number(adultsCount) || 1,
        children: Number(childrenCount) || 0,
        guests: Number(guestsInvited) || 0,
        dateLabel: shortEventDate(eventCfg.date),
      }),
      returnUrl: rsvpReturnUrl(window.location.origin, eventCfg.eventId || eventId, regId),
    });

  const kidsAttending = useMemo(
    () => !isSimple && Number(childrenCount) > 0,
    [childrenCount, isSimple]
  );
  const consentsReady = !kidsAttending || (allergyAck && injuryAck && parentSignName.trim().length >= 2);
  const tshirtTotal = useMemo(
    () => TSHIRT_SIZE_OPTIONS.reduce((sum, s) => sum + (tshirtCounts[s] || 0), 0),
    [tshirtCounts]
  );
  const tshirtSummary = useMemo(() => formatTshirtSizes(tshirtCounts), [tshirtCounts]);

  const setTshirtCount = (size: TshirtSizeKey, value: string) => {
    const n = Math.max(0, Math.min(50, Number(value) || 0));
    setTshirtCounts((prev) => ({ ...prev, [size]: n }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (signupsClosed || Date.now() >= closeAtMs) {
      setSignupsClosed(true);
      setError(closedMessageForName(eventCfg.name));
      return;
    }

    const allergiesValue = composeAllergiesField({
      none: allergiesNone,
      menuAvoid,
      notes: allergyNotes,
    });
    if (!allergiesValue) {
      setError('Food allergies is required. Tap menu items to avoid, add a note, or choose None.');
      return;
    }

    let household = 1;
    let children = 0;
    let guests = 0;
    let contributionAmount: number | null = null;

    if (isSimple) {
      const n = Number(headcount);
      if (!Number.isFinite(n) || n < 1 || Math.floor(n) !== n) {
        setError('Please enter how many people are coming (at least 1).');
        return;
      }
      household = Math.floor(n);
    } else {
      if (kidsAttending) {
        if (!allergyAck) {
          setError('Please acknowledge the Food Allergy Consent. It is required when children are coming.');
          return;
        }
        if (!injuryAck) {
          setError('Please acknowledge the Premises Injury & Parent Supervision Consent. It is required when children are coming.');
          return;
        }
        if (parentSignName.trim().length < 2) {
          setError('Please type your full name to sign both required consents.');
          return;
        }
      }

      const adults = Number(adultsCount);
      children = Number(childrenCount);
      if (!Number.isFinite(adults) || adults < 1 || adults > maxAdults || Math.floor(adults) !== adults) {
        setError(
          maxAdults <= 2
            ? 'Adults from your home must be 1 (just you) or 2 (you and your spouse). Other adults go under Guests.'
            : `Adults from your home must be between 1 and ${maxAdults} (include adult children who live with you). Visitors go under Guests.`
        );
        return;
      }
      if (!Number.isFinite(children) || children < 0) {
        setError('Children cannot be negative.');
        return;
      }

      household = Math.floor(adults) + Math.floor(children);

      if (eventCfg.tshirtsEnabled && tshirtTotal < 1) {
        setError('Please choose at least one T-shirt size for your household.');
        return;
      }

      guests = Number(guestsInvited);
      if (!Number.isFinite(guests) || guests < 0) {
        setError('Number of guests invited cannot be negative.');
        return;
      }

      const contributionParsed = parseRsvpContribution(foodContribution, effectiveGiftMin);
      if (contributionParsed.ok === false) {
        setError(contributionParsed.error);
        return;
      }
      contributionAmount = contributionParsed.value;

      if (eventCfg.paymentChoiceEnabled) {
        if (giftIntent !== 'pay_now' && !(giftIntent === 'pledge' && eventCfg.allowPledge)) {
          setError(eventCfg.allowPledge ? 'Choose Pay now or Pledge for your contribution.' : 'Please choose Pay now.');
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/vault?resource=events&subResource=rsvp&eventId=${encodeURIComponent(eventId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventId,
            name: name.trim(),
            phone: phone.trim(),
            email: email.trim() || null,
            household_size: household,
            children_count: Math.floor(children),
            guests_invited: Math.floor(guests),
            food_contribution_amount: contributionAmount,
            food_contribution_intent: eventCfg.paymentChoiceEnabled ? giftIntent || null : null,
            // Card, bank, MTN, Airtel or Sendwave is chosen on PLCC Tithe.
            food_contribution_payment_method: null,
            allergies: allergiesValue,
            tshirt_sizes: !isSimple && eventCfg.tshirtsEnabled ? tshirtSummary : null,
            food_allergy_acknowledged: kidsAttending ? true : false,
            food_allergy_signed_name: kidsAttending ? parentSignName.trim() : null,
            injury_acknowledged: kidsAttending ? true : false,
            injury_signed_name: kidsAttending ? parentSignName.trim() : null,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not save your signup');
      const savedId = data.registration?.id ? String(data.registration.id) : null;
      setRegistrationId(savedId);
      if (savedId && eventCfg.paymentChoiceEnabled && giftIntent === 'pay_now' && contributionAmount) {
        // One step: straight on to PLCC Tithe in this tab; it brings them back here when done.
        const url = titheLinkFor(savedId, contributionAmount);
        setRedirectingToTithe(url);
        window.location.assign(url);
        return;
      }
      setSubmitted(true);
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (configLoading) {
    return (
      <div className="min-h-screen bg-[#F7F5F2] flex items-center justify-center">
        <Loader2 className="animate-spin text-burgundy" size={28} />
      </div>
    );
  }

  if (configError) {
    return (
      <div className="min-h-screen bg-[#F7F5F2] flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-3">
          <Lock className="mx-auto text-burgundy" size={28} />
          <h1 className="text-xl font-black text-[#0d1a14]">Signup unavailable</h1>
          <p className="text-sm text-gray-600 font-medium">{configError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F5F2] text-[#0d1a14] font-sans selection:bg-gold/30">
      <div className="relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.07] pointer-events-none"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, #1d372c 0%, transparent 45%), radial-gradient(circle at 80% 0%, #C9A35A 0%, transparent 40%)',
          }}
        />
        <div className="relative w-full max-w-xl sm:max-w-2xl lg:max-w-3xl xl:max-w-4xl mx-auto px-4 sm:px-6 pt-10 pb-16 sm:pt-14 sm:pb-24">
          <header className="text-center mb-8 sm:mb-10">
            <div className="flex items-center justify-center gap-4 sm:gap-5 mb-6">
              <img
                src="/images/awc-logo.png"
                alt="Promised Land Christian Center"
                className="w-16 h-16 sm:w-[4.5rem] sm:h-[4.5rem] rounded-full object-contain bg-white shadow-sm ring-1 ring-[#1d372c]/10"
              />
              <img
                src="/images/awc-connect-logo.png"
                alt="PLCC Connect"
                className="w-16 h-16 sm:w-[4.5rem] sm:h-[4.5rem] rounded-full object-contain bg-white shadow-sm ring-1 ring-[#1d372c]/10"
              />
            </div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#1d372c]/80 mb-2">
              Promised Land Christian Center
            </p>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight leading-tight mb-3">
              {eventCfg.name}
            </h1>
            <p className="text-base sm:text-lg text-gray-600 font-medium leading-relaxed max-w-2xl mx-auto">
              {eventCfg.date} · {eventCfg.timeLabel}
            </p>
            <p className="text-sm text-gray-500 mt-2 max-w-2xl mx-auto leading-relaxed">
              {signupsClosed
                ? `Online RSVPs are closed. See event details below — ${eventCfg.name} is still ${eventCfg.date}, ${eventCfg.timeLabel}.`
                : eventCfg.eventId === THANKSGIVING_2026_EVENT_ID
                  ? 'Sign up so we know how many people to plan for and also care for any allergies.'
                  : 'Sign up so we know how many plates to prepare and how to care for children and allergies.'}
            </p>
          </header>

          <div className="bg-white rounded-[1.75rem] sm:rounded-[2rem] border border-[#0d1a14]/8 shadow-[0_24px_60px_rgba(13, 26, 20,0.08)] overflow-hidden">
            {returnRegistrationId ? (
              <RsvpStatusPanel registrationId={returnRegistrationId} />
            ) : redirectingToTithe ? (
              <div className="px-7 py-14 sm:px-10 text-center space-y-4" role="status">
                <Loader2 className="mx-auto animate-spin text-[#1d372c]" size={30} />
                <h2 className="text-2xl font-black tracking-tight">You’re signed up</h2>
                <p className="text-gray-600 font-medium leading-relaxed max-w-sm mx-auto">
                  Taking you to PLCC Tithe to pay {formatCurrency(Number(foodContribution || 0))}…
                </p>
                <a
                  href={redirectingToTithe}
                  className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#0d1a14] px-5 text-sm font-bold text-amber-50 hover:bg-[#12231c]"
                >
                  Continue to PLCC Tithe <ArrowRight size={16} />
                </a>
              </div>
            ) : submitted ? (
              <div className="px-7 py-14 sm:px-10 text-center space-y-4">
                <div className="inline-flex w-16 h-16 rounded-full bg-green-50 text-green-600 items-center justify-center border border-green-100">
                  <CheckCircle2 size={32} />
                </div>
                <h2 className="text-2xl font-black tracking-tight">You’re signed up</h2>
                <p className="text-gray-600 font-medium leading-relaxed max-w-sm mx-auto">
                  Thank you, {name.trim().split(' ')[0] || 'friend'}. See you at {eventCfg.name} on {eventCfg.date}.
                </p>
                {eventCfg.paymentChoiceEnabled && giftIntent === 'pledge' && (
                  <div className="mx-auto max-w-sm space-y-3">
                    <p className="text-sm text-gray-500 font-medium">
                      You pledged {foodContribution ? formatCurrency(Number(foodContribution)) : 'a contribution'}. Pay at
                      the event, or online anytime before then.
                    </p>
                    {registrationId ? (
                      <a
                        href={titheLinkFor(registrationId, Number(foodContribution) || 0)}
                        className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl border border-[#0d1a14]/15 bg-white px-4 text-sm font-bold text-[#0d1a14] hover:bg-[#F7F2F3]"
                      >
                        Pay now on PLCC Tithe <ArrowRight size={15} />
                      </a>
                    ) : null}
                  </div>
                )}
              </div>
            ) : signupsClosed ? (
              <div className="px-7 py-14 sm:px-10 text-center space-y-4">
                <div className="inline-flex w-16 h-16 rounded-full bg-[#0d1a14]/5 text-[#0d1a14] items-center justify-center border border-[#0d1a14]/10">
                  <Lock size={28} />
                </div>
                <h2 className="text-2xl font-black tracking-tight">Online RSVPs are closed</h2>
                <p className="text-gray-600 font-medium leading-relaxed max-w-sm mx-auto">
                  {closedMessageForName(eventCfg.name)}
                </p>
                <p className="text-sm text-[#0d1a14] font-semibold leading-relaxed max-w-sm mx-auto">
                  {eventCfg.name} · {eventCfg.date} · {eventCfg.timeLabel}
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="px-6 py-8 sm:px-9 sm:py-10 space-y-6">
                <div className="space-y-2">
                  <label htmlFor="cookout-name" className="block text-sm font-bold text-[#0d1a14]">
                    Your name <span className="text-burgundy">*</span>
                  </label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      id="cookout-name"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Full name"
                      className="w-full min-h-[52px] pl-12 pr-4 rounded-xl border-2 border-gray-200 bg-[#FBFBF9] text-base font-medium outline-none focus:border-burgundy focus:bg-white transition-colors"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="cookout-phone" className="block text-sm font-bold text-[#0d1a14]">
                    Phone number <span className="text-burgundy">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      id="cookout-phone"
                      required
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="So we can reach you"
                      className="w-full min-h-[52px] pl-12 pr-4 rounded-xl border-2 border-gray-200 bg-[#FBFBF9] text-base font-medium outline-none focus:border-burgundy focus:bg-white transition-colors"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="cookout-email" className="block text-sm font-bold text-[#0d1a14]">
                    Email <span className="text-burgundy">*</span>
                  </label>
                  <input
                    id="cookout-email"
                    required
                    autoComplete="email"
                    inputMode="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full min-h-[52px] px-4 rounded-xl border-2 border-gray-200 bg-[#FBFBF9] text-base font-medium outline-none focus:border-burgundy focus:bg-white transition-colors"
                  />
                </div>

                {isSimple ? (
                  <div className="rounded-2xl border border-[#1d372c]/10 bg-white p-5 sm:p-6 space-y-3">
                    <label htmlFor="cookout-headcount" className="block text-sm font-bold text-[#0d1a14]">
                      How many are coming? <span className="text-burgundy">*</span>
                    </label>
                    <div className="relative">
                      <Users className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input
                        id="cookout-headcount"
                        required
                        type="number"
                        min={1}
                        max={100}
                        value={headcount}
                        onChange={(e) => setHeadcount(e.target.value)}
                        className="w-full min-h-[52px] pl-12 pr-4 rounded-xl border-2 border-gray-200 bg-[#FBFBF9] text-base font-medium outline-none focus:border-burgundy focus:bg-white transition-colors"
                      />
                    </div>
                    <p className="text-xs text-gray-500">Include everyone in your party.</p>
                  </div>
                ) : (
                <div className="rounded-2xl border border-[#1d372c]/10 bg-white p-5 sm:p-6 space-y-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                  <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
                    <div>
                      <p className="text-base font-semibold text-[#0d1a14] tracking-tight">Who’s coming</p>
                      <p className="text-sm text-gray-500 mt-1">
                        Tell us how many plates to prepare from your home and any guests.
                      </p>
                    </div>
                    <p className="text-sm font-medium text-[#0d1a14]/80 tabular-nums sm:text-right">
                      {(Number(adultsCount) || 0) + (Number(childrenCount) || 0) + (Number(guestsInvited) || 0)} people total
                      <span className="text-gray-400 font-normal"> · adults + children + guests</span>
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div className="rounded-2xl border border-black/[0.06] bg-[#FAFAF8] p-4 space-y-2.5">
                      <label htmlFor="cookout-adults" className="block text-sm font-semibold text-[#0d1a14]">
                        Adults from your home <span className="text-burgundy">*</span>
                      </label>
                      <div className="relative">
                        <Users className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#1d372c]/40 pointer-events-none" size={18} />
                        <select
                          id="cookout-adults"
                          required
                          value={adultsCount}
                          onChange={(e) => setAdultsCount(e.target.value)}
                          className="w-full min-h-[48px] pl-11 pr-10 rounded-xl border border-gray-200 bg-white text-base font-semibold text-[#0d1a14] outline-none focus:border-burgundy focus:ring-2 focus:ring-burgundy/10 transition-colors appearance-none"
                        >
                          {adultOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <p className="text-xs text-gray-500">
                        {maxAdults > 2
                          ? 'Include adult children who live with you. Visitors / friends go under Guests.'
                          : 'Only 1 or 2. Other adults (family or friends) go under Guests.'}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-black/[0.06] bg-[#FAFAF8] p-4 space-y-2.5">
                      <label htmlFor="cookout-children" className="block text-sm font-semibold text-[#0d1a14]">
                        Children under 18 from your home <span className="text-burgundy">*</span>
                      </label>
                      <div className="relative">
                        <Baby className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#1d372c]/40" size={18} />
                        <input
                          id="cookout-children"
                          required
                          type="number"
                          min={0}
                          max={50}
                          value={childrenCount}
                          onChange={(e) => {
                            setChildrenCount(e.target.value);
                            if (Number(e.target.value) <= 0) {
                              setAllergyAck(false);
                              setInjuryAck(false);
                              setParentSignName('');
                            }
                          }}
                          className="w-full min-h-[48px] pl-11 pr-3 rounded-xl border border-gray-200 bg-white text-base font-semibold text-[#0d1a14] outline-none focus:border-burgundy focus:ring-2 focus:ring-burgundy/10 transition-colors"
                        />
                      </div>
                      <p className="text-xs text-gray-500">
                        Kids under 18 only · adult children count under Adults · use 0 if none
                      </p>
                    </div>

                    <div className="rounded-2xl border border-black/[0.06] bg-[#FAFAF8] p-4 space-y-2.5">
                      <label htmlFor="cookout-guests" className="block text-sm font-semibold text-[#0d1a14]">
                        Guests you invited <span className="text-burgundy">*</span>
                      </label>
                      <div className="relative">
                        <UserPlus className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#1d372c]/40" size={18} />
                        <input
                          id="cookout-guests"
                          required
                          type="number"
                          min={0}
                          max={100}
                          value={guestsInvited}
                          onChange={(e) => setGuestsInvited(e.target.value)}
                          className="w-full min-h-[48px] pl-11 pr-3 rounded-xl border border-gray-200 bg-white text-base font-semibold text-[#0d1a14] outline-none focus:border-burgundy focus:ring-2 focus:ring-burgundy/10 transition-colors"
                        />
                      </div>
                      <p className="text-xs text-gray-500">Friends, other adults, or extra family · 0 if none</p>
                    </div>

                    <div className="sm:col-span-2 rounded-2xl border border-[#E4DCCF] bg-[#FBF8F3] p-4 sm:p-5 space-y-5">
                      <fieldset className="space-y-3">
                        <legend className="mb-3 text-sm font-semibold text-[#0d1a14]">
                          Your contribution <span className="text-burgundy">*</span>
                        </legend>
                        <div className="flex items-baseline gap-1.5 border-b-[1.5px] border-[#16251f] pb-2">
                          <span style={SERIF} className="text-3xl text-gray-500" aria-hidden>
                            $
                          </span>
                          {amountMode === 'other' ? (
                            <input
                              id="rsvp-amount-other"
                              type="number"
                              inputMode="numeric"
                              min={effectiveGiftMin}
                              max={1000}
                              step={1}
                              autoFocus
                              placeholder={String(effectiveGiftMin)}
                              value={foodContribution}
                              onChange={(e) => setFoodContribution(e.target.value)}
                              aria-label="Your amount in UGX"
                              style={SERIF}
                              className="w-full min-w-0 flex-1 border-0 bg-transparent p-0 text-6xl leading-none text-[#16251f] outline-none placeholder:text-[#D9CFC0]"
                            />
                          ) : (
                            <span style={SERIF} className="text-6xl leading-none text-[#16251f] tabular-nums" aria-live="polite">
                              {foodContribution || <span className="text-[#D9CFC0]">0</span>}
                            </span>
                          )}
                        </div>
                        <div className={`grid gap-2 ${giftButtons.length <= 2 ? 'grid-cols-2' : 'grid-cols-5'}`}>
                          {giftButtons.map((n) => {
                            const on = amountMode === 'preset' && foodContribution === String(n);
                            return (
                              <button
                                key={n}
                                type="button"
                                aria-pressed={on}
                                onClick={() => {
                                  setAmountMode('preset');
                                  setFoodContribution(String(n));
                                }}
                                className={`min-h-[48px] rounded-xl border text-[15px] font-bold transition-colors ${
                                  on
                                    ? 'border-[#112019] bg-[#112019] text-[#F4EFE7]'
                                    : 'border-[#E4DCCF] bg-white text-[#16251f] hover:border-[#B8892E]'
                                }`}
                              >
                                ${n}
                              </button>
                            );
                          })}
                          <button
                            type="button"
                            aria-pressed={amountMode === 'other'}
                            onClick={() => {
                              setAmountMode('other');
                              setFoodContribution('');
                            }}
                            className={`min-h-[48px] rounded-xl border text-[13px] font-bold transition-colors ${
                              amountMode === 'other'
                                ? 'border-[#112019] bg-[#112019] text-[#F4EFE7]'
                                : 'border-[#E4DCCF] bg-white text-[#16251f] hover:border-[#B8892E]'
                            }`}
                          >
                            Other
                          </button>
                        </div>
                        {amountMode === 'other' && foodContribution !== '' && giftTooLow ? (
                          <p role="alert" className="text-sm font-semibold text-[#B42318]">
                            Please enter ${effectiveGiftMin} or more.
                          </p>
                        ) : null}
                        <p className="text-xs text-gray-500">
                          {eventCfg.giftPerPerson
                            ? `${formatCurrency(eventCfg.giftMin)} per person (required)${
                                giftPeople > 1 ? ` · ${giftPeople} adults = ${formatCurrency(effectiveGiftMin)}` : ''
                              }.`
                            : eventCfg.giftHint || `${formatCurrency(eventCfg.giftMin)} minimum per household. Helps cover the food.`}
                        </p>
                      </fieldset>

                      {eventCfg.paymentChoiceEnabled && (
                        <fieldset className="space-y-2.5">
                          <legend className="mb-2.5 text-sm font-semibold text-[#0d1a14]">
                            When will you give? <span className="text-burgundy">*</span>
                          </legend>
                          {(
                            [
                              {
                                id: 'pay_now' as const,
                                title: 'Pay now',
                                blurb: 'Card, bank, MTN, Airtel or Sendwave, on PLCC Tithe',
                              },
                              ...(eventCfg.allowPledge
                                ? [
                                    {
                                      id: 'pledge' as const,
                                      title: 'Pledge',
                                      blurb: 'Pay later or at the event. You can pay online anytime from your signup.',
                                    },
                                  ]
                                : []),
                            ] as const
                          ).map((opt) => {
                            const on = giftIntent === opt.id;
                            return (
                              <label
                                key={opt.id}
                                className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors ${
                                  on ? 'border-[1.5px] border-[#B8892E] bg-white' : 'border-[#E4DCCF] bg-white/60'
                                }`}
                              >
                                <input
                                  type="radio"
                                  name="rsvp-gift-intent"
                                  checked={on}
                                  onChange={() => setGiftIntent(opt.id)}
                                  className="mt-0.5 h-[18px] w-[18px] accent-[#112019]"
                                />
                                <span>
                                  <span className="block text-[15px] font-bold text-[#16251f]">{opt.title}</span>
                                  <span className="mt-0.5 block text-[13px] leading-snug text-gray-600">{opt.blurb}</span>
                                </span>
                              </label>
                            );
                          })}
                          {giftIntent === 'pay_now' && (
                            <p className="flex items-start gap-2 rounded-xl bg-[#EFE7DA] px-3.5 py-3 text-[13px] leading-relaxed text-[#3D2A22]">
                              <ArrowRight size={16} className="mt-0.5 shrink-0 text-[#112019]" aria-hidden />
                              <span>
                                Next you'll finish on <span className="font-bold">PLCC Tithe</span>, the church's giving site.
                                Your name and email are filled in for you, and you'll come right back here.
                              </span>
                            </p>
                          )}
                        </fieldset>
                      )}
                    </div>
                  </div>
                </div>
                )}

                {!isSimple && eventCfg.tshirtsEnabled && (
                <div className="space-y-3 rounded-2xl border-2 border-gray-200 bg-[#FBFBF9] p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-burgundy/10 text-burgundy flex items-center justify-center shrink-0">
                      <Shirt size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-[#0d1a14]">
                        T-shirt sizes <span className="text-burgundy">*</span>
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Enter how many shirts you need for each size. Total selected: {tshirtTotal}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {TSHIRT_SIZE_OPTIONS.map((size) => (
                      <label key={size} className="block rounded-xl border border-gray-200 bg-white px-3 py-2.5">
                        <span className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1">
                          {size}
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={50}
                          value={tshirtCounts[size] || 0}
                          onChange={(e) => setTshirtCount(size, e.target.value)}
                          className="w-full min-h-[40px] px-2 rounded-lg border border-gray-200 bg-[#FBFBF9] text-base font-bold text-[#0d1a14] outline-none focus:border-burgundy focus:bg-white"
                          aria-label={`Number of ${size} shirts`}
                        />
                      </label>
                    ))}
                  </div>
                </div>
                )}

                <div className="space-y-3 rounded-2xl border-2 border-gray-200 bg-[#FBFBF9] p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-burgundy/10 text-burgundy flex items-center justify-center shrink-0">
                      <AlertTriangle size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-[#0d1a14]">
                        Food allergies <span className="text-burgundy">*</span>
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {menuItems.length
                          ? 'Tap any menu items your household must avoid, and add extra notes if needed.'
                          : 'List allergies, or choose None.'}
                      </p>
                    </div>
                  </div>

                  {menuItems.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-black uppercase tracking-widest text-gray-400">
                        Dinner menu — tap what to avoid
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {menuItems.map((item) => {
                          const selected = menuAvoid.includes(item);
                          return (
                            <button
                              key={item}
                              type="button"
                              disabled={allergiesNone}
                              onClick={() => {
                                setAllergiesNone(false);
                                setMenuAvoid((prev) =>
                                  prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item]
                                );
                              }}
                              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors disabled:opacity-40 ${
                                selected
                                  ? 'bg-burgundy text-gold border-burgundy'
                                  : 'bg-white text-[#0d1a14] border-gray-200 hover:border-burgundy/40'
                              }`}
                            >
                              {item}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setAllergiesNone(true);
                        setMenuAvoid([]);
                        setAllergyNotes('');
                      }}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                        allergiesNone
                          ? 'bg-burgundy text-gold border-burgundy'
                          : 'bg-white text-[#0d1a14] border-gray-200 hover:border-burgundy/40'
                      }`}
                    >
                      None
                    </button>
                    {!allergiesNone && (menuAvoid.length > 0 || allergyNotes.trim()) && (
                      <p className="text-xs text-gray-500 font-medium">
                        {menuAvoid.length
                          ? `${menuAvoid.length} menu item${menuAvoid.length === 1 ? '' : 's'} flagged`
                          : 'Notes added'}
                      </p>
                    )}
                  </div>

                  <div className="relative">
                    <textarea
                      id="cookout-allergies"
                      rows={3}
                      disabled={allergiesNone}
                      value={allergyNotes}
                      onChange={(e) => {
                        setAllergiesNone(false);
                        setAllergyNotes(e.target.value);
                      }}
                      placeholder={
                        menuItems.length
                          ? 'Other allergies or notes (optional if you tapped menu items)'
                          : 'e.g. peanuts, shellfish — or choose None above'
                      }
                      className="w-full px-4 py-3.5 rounded-xl border-2 border-gray-200 bg-white text-base font-medium outline-none focus:border-burgundy transition-colors resize-y min-h-[96px] disabled:opacity-50 disabled:bg-gray-50"
                    />
                  </div>
                  <p className="text-xs text-gray-500">
                    Required for every signup. Choose None if there are no allergies.
                  </p>
                </div>

                {kidsAttending && (
                  <div className="rounded-2xl border-2 border-[#1d372c]/25 bg-[#1d372c]/[0.03] p-5 space-y-5">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#1d372c] text-[#C9A35A] flex items-center justify-center shrink-0">
                        <PenLine size={18} />
                      </div>
                      <div>
                        <p className="text-sm font-black text-[#0d1a14] uppercase tracking-wide">
                          Required parent consents <span className="text-burgundy">*</span>
                        </p>
                        <p className="text-xs text-gray-600 font-medium mt-1">
                          Because children are attending, you must read, check, and sign both forms below before finishing.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-black uppercase tracking-widest text-burgundy">1. Food Allergy Consent</p>
                      <div className="max-h-[28rem] overflow-y-auto rounded-2xl border border-[#1d372c]/15">
                        <ConsentNoticeDocument
                          title="Food Allergy & Meal Safety Notice"
                          content={allergyConsentText}
                          bannerText="PLEASE READ BEFORE EATING"
                          compact
                        />
                      </div>
                      <label className="flex items-start gap-3 cursor-pointer pt-1">
                        <input
                          type="checkbox"
                          checked={allergyAck}
                          onChange={(e) => setAllergyAck(e.target.checked)}
                          className="mt-1 w-5 h-5 rounded border-gray-300 text-burgundy focus:ring-burgundy"
                        />
                        <span className="text-sm font-bold text-[#0d1a14] leading-snug">
                          I have read the Food Allergy Consent and I acknowledge it.
                        </span>
                      </label>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-black uppercase tracking-widest text-burgundy">2. Premises Injury & Parent Supervision</p>
                      <div className="max-h-[28rem] overflow-y-auto rounded-2xl border border-[#1d372c]/15">
                        <ConsentNoticeDocument
                          title="Premises Injury & Parent Supervision Consent"
                          content={INJURY_CONSENT_TEXT}
                          compact
                        />
                      </div>
                      <label className="flex items-start gap-3 cursor-pointer pt-1">
                        <input
                          type="checkbox"
                          checked={injuryAck}
                          onChange={(e) => setInjuryAck(e.target.checked)}
                          className="mt-1 w-5 h-5 rounded border-gray-300 text-burgundy focus:ring-burgundy"
                        />
                        <span className="text-sm font-bold text-[#0d1a14] leading-snug">
                          I understand I am responsible for watching my own children, and I acknowledge this injury consent.
                        </span>
                      </label>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <label htmlFor="parent-sign" className="block text-sm font-bold text-[#0d1a14]">
                          Type your full name to sign both consents <span className="text-burgundy">*</span>
                        </label>
                        {parentSignName.trim() && (
                          <button
                            type="button"
                            onClick={() => setParentSignName('')}
                            className="text-xs font-bold text-burgundy underline underline-offset-2 hover:text-[#15281f]"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <input
                        id="parent-sign"
                        value={parentSignName}
                        onChange={(e) => setParentSignName(e.target.value)}
                        placeholder="Signature (full legal name)"
                        className="w-full min-h-[52px] px-4 rounded-xl border-2 border-gray-200 bg-white text-base font-medium outline-none focus:border-burgundy transition-colors"
                      />
                      <p className="text-xs text-gray-500">Made a typo? Edit the name above or tap Clear and type again.</p>
                    </div>
                  </div>
                )}

                {error && (
                  <p className="text-sm font-semibold text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting || !consentsReady || giftTooLow}
                  className="w-full min-h-[56px] rounded-2xl bg-[#1d372c] text-[#C9A35A] font-black text-sm uppercase tracking-[0.16em] shadow-lg shadow-[#1d372c]/25 hover:bg-[#15281f] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {submitting ? <Loader2 className="animate-spin" size={20} /> : null}
                  {submitting
                    ? 'Saving…'
                    : !isSimple && eventCfg.paymentChoiceEnabled && giftIntent === 'pay_now'
                      ? Number(foodContribution) > 0
                        ? `Sign up & pay ${formatCurrency(Number(foodContribution))}`
                        : 'Sign up & pay'
                      : eventCfg.submitLabel || 'Sign up'}
                  {!submitting && !isSimple && eventCfg.paymentChoiceEnabled && giftIntent === 'pay_now' ? (
                    <ArrowRight size={18} aria-hidden />
                  ) : null}
                </button>
                {!isSimple && eventCfg.paymentChoiceEnabled && giftIntent === 'pay_now' ? (
                  <p className="-mt-2 flex items-center justify-center gap-1.5 text-xs text-gray-500">
                    <Lock size={12} aria-hidden /> Secure checkout on PLCC Tithe
                  </p>
                ) : null}
              </form>
            )}
          </div>

          <p className="text-center text-xs text-gray-500 mt-8 font-medium">
            Questions? Contact your church office or a ministry leader.
          </p>
        </div>
      </div>
    </div>
  );
};

type RsvpStatusData = {
  eventName: string;
  date: string;
  timeLabel: string;
  location: string;
  firstName: string;
  adults: number;
  children: number;
  guests: number;
  amount: number;
  status: RsvpPayStatus;
  paidVia: string | null;
  payUrl: string | null;
};

const STATUS_PILL: Record<RsvpPayStatus, { label: string; className: string; line: string }> = {
  paid: { label: 'Paid', className: 'bg-[#E3F1E8] text-[#1F5C38]', line: 'Thank you. Your receipt was emailed by PLCC Tithe.' },
  waiting: {
    label: 'Waiting',
    className: 'bg-[#FCEFD6] text-[#7A4A00]',
    line: 'Payment sent. The church confirms MTN, Airtel and Sendwave payments, usually within 2 business days, then this shows Paid.',
  },
  processing: {
    label: 'Processing',
    className: 'bg-[#E6EEF8] text-[#1E4C80]',
    line: 'Your bank payment is clearing. That usually takes 2 to 4 business days.',
  },
  pledged: { label: 'Pledged', className: 'bg-[#EFE7DA] text-[#112019]', line: 'Pay at the event, or online anytime before then.' },
  due: { label: 'Not paid yet', className: 'bg-[#F5EFF0] text-[#1d372c]', line: 'Your spot is saved. Finish your payment on PLCC Tithe whenever you’re ready.' },
};

/**
 * The guest's own signup after PLCC Tithe sends them back (?r=<registration id>):
 * Paid / Waiting / Processing / Pledged / Not paid yet, with a Pay link when it's still owed.
 */
const RsvpStatusPanel: React.FC<{ registrationId: string }> = ({ registrationId }) => {
  const [data, setData] = useState<RsvpStatusData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const check = React.useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch(
        `/api/vault?resource=events&subResource=rsvp-status&r=${encodeURIComponent(registrationId)}`
      );
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || 'We couldn’t check your signup right now.');
      setData(body as RsvpStatusData);
      setError(null);
      return body.status as RsvpPayStatus;
    } catch (err: any) {
      setError(err?.message || 'We couldn’t check your signup right now.');
      return null;
    } finally {
      setChecking(false);
    }
  }, [registrationId]);

  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    let timer: number | undefined;
    const run = async () => {
      const status = await check();
      // A card payment can take a few seconds to confirm after Tithe sends them back.
      if (!cancelled && status === 'due' && tries < 3) {
        tries += 1;
        timer = window.setTimeout(run, 4000);
      }
    };
    void run();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [check]);

  if (!data) {
    return (
      <div className="px-7 py-14 sm:px-10 text-center space-y-4" role="status">
        {error ? (
          <>
            <p className="text-gray-600 font-medium">{error}</p>
            <button
              type="button"
              onClick={() => void check()}
              className="inline-flex min-h-[44px] items-center rounded-xl border border-[#0d1a14]/15 px-4 text-sm font-bold text-[#0d1a14]"
            >
              Try again
            </button>
          </>
        ) : (
          <Loader2 className="mx-auto animate-spin text-[#1d372c]" size={28} />
        )}
      </div>
    );
  }

  const pill = STATUS_PILL[data.status];
  const people = [
    data.adults ? `${data.adults} adult${data.adults === 1 ? '' : 's'}` : '',
    data.children ? `${data.children} ${data.children === 1 ? 'child' : 'children'}` : '',
    data.guests ? `${data.guests} guest${data.guests === 1 ? '' : 's'}` : '',
  ]
    .filter(Boolean)
    .join(', ');
  const paid = data.status === 'paid';

  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12 space-y-6">
      <div className="text-center space-y-3">
        <div
          className={`inline-flex w-16 h-16 rounded-full items-center justify-center ${
            paid || data.status === 'pledged' || data.status === 'due' ? 'bg-[#E3F1E8] text-[#2E7D4F]' : 'bg-[#FCEFD6] text-[#7A4A00]'
          }`}
        >
          {data.status === 'waiting' || data.status === 'processing' ? <Clock size={30} /> : <CheckCircle2 size={32} />}
        </div>
        <h2 style={SERIF} className="text-[34px] font-semibold leading-tight text-[#16251f]">
          {paid ? 'You’re signed up and paid' : 'You’re signed up'}
        </h2>
        <p className="text-gray-600 font-medium leading-relaxed max-w-sm mx-auto">
          Thank you, {data.firstName}. See you at {data.eventName}
          {data.date ? ` on ${shortEventDate(data.date)}` : ''}
          {data.timeLabel ? `, ${data.timeLabel}` : ''}.
        </p>
      </div>

      {data.amount > 0 ? (
        <div className="mx-auto max-w-sm rounded-2xl border border-[#E4DCCF] bg-[#FFFDF8] p-5 space-y-3 text-left">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-500">Your contribution</p>
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${pill.className}`}>{pill.label}</span>
          </div>
          <p style={SERIF} className="text-[40px] font-semibold leading-none text-[#16251f] tabular-nums">
            {formatCurrency(data.amount)}
          </p>
          <p className="text-[13px] leading-relaxed text-gray-600">
            {paid && data.paidVia ? `${data.paidVia} · ` : ''}
            {pill.line}
          </p>
          {people || data.location ? (
            <div className="border-t border-[#EDE4D6] pt-3 text-[13px] text-gray-600 space-y-0.5">
              {people ? <p>{people}</p> : null}
              {data.location ? <p>{data.location}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mx-auto max-w-sm flex flex-col gap-2.5">
        {data.payUrl ? (
          <a
            href={data.payUrl}
            className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-[#0d1a14] px-4 text-[15px] font-bold text-amber-50 hover:bg-[#12231c]"
          >
            Pay {formatCurrency(data.amount)} on PLCC Tithe <ArrowRight size={16} />
          </a>
        ) : null}
        {data.status === 'waiting' || data.status === 'processing' || data.status === 'due' ? (
          <button
            type="button"
            onClick={() => void check()}
            disabled={checking}
            className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-[#0d1a14]/15 bg-white px-4 text-sm font-bold text-[#0d1a14] disabled:opacity-60"
          >
            {checking ? <Loader2 size={15} className="animate-spin" /> : null}
            Check again
          </button>
        ) : null}
      </div>
    </div>
  );
};

export default FellowshipCookoutRsvp;
