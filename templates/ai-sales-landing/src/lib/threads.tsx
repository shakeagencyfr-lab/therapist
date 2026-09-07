// Thread = one conversation in the inbox. Each carries everything needed to
// render the inbox row, chat header, conversation stream, and lead panel.
//
// These are illustrative, fictional demo conversations. Brand names, people and
// amounts are invented to show how the AI sales agent qualifies, books and
// closes for everyday businesses. Names and numbers are shown redacted, the way
// they'd appear in a real shared inbox.

import type { ReactNode } from "react";

export type ConvoEvent =
  | {
      type: "msg";
      direction: "in" | "out";
      text: string;
      grouped?: boolean;
      leading?: ReactNode;
    }
  | { type: "date"; label: string }
  | { type: "system"; tone: "ai" | "lead" | "win" | "warn"; label: string }
  | { type: "gap"; label: string }
  | { type: "win"; headline: string; sub?: string };

export type LeadRowSpec = { label: string; value: string };

export type Thread = {
  id: string;
  inbox: {
    initials?: string;
    redacted?: boolean;
    name: string;
    preview: string;
  };
  header: {
    name: string;
    redactedBadge?: boolean;
    channelTag: string;
    statusText: string;
  };
  lead: {
    displayName: string;
    redactedBadge?: boolean;
    sub: string;
    statusLabel: string;
    statusValue: string;
    rows: LeadRowSpec[];
    insight: string;
  };
  events: ConvoEvent[];
};

const PaymentIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="#25D366"
    style={{ display: "inline" }}
  >
    <path d="M12 0a12 12 0 1 0 0 24 12 12 0 0 0 0-24zm-1.4 17.4-5-5 1.4-1.4 3.6 3.6 7.2-7.2 1.4 1.4z" />
  </svg>
);

export const StarIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="#f59e0b"
    style={{ display: "inline" }}
  >
    <path d="M12 2 9.1 8.5 2 9.3l5 4.9L5.8 22 12 18.3 18.2 22 17 14.2l5-4.9-7.1-.8z" />
  </svg>
);

// ───────────────────────────────────────────────────────────────────────────
// Thread 1 - Med-spa booking. Inbound on Instagram, AI qualifies the treatment,
// answers pricing + aftercare, offers slots and books a paid appointment with a
// deposit. No human input.
// ───────────────────────────────────────────────────────────────────────────
const spaThread: Thread = {
  id: "spa",
  inbox: {
    redacted: true,
    name: "Lead · redacted",
    preview: "Deposit paid. Booked Thu 14:30.",
  },
  header: {
    name: "Lead",
    redactedBadge: true,
    channelTag: "Instagram",
    statusText: "AI handling. Zero human input.",
  },
  lead: {
    displayName: "Lead",
    redactedBadge: true,
    sub: "@·········· · Instagram DM",
    statusLabel: "Status",
    statusValue: "Booked · deposit paid",
    rows: [
      { label: "Business", value: "Lumière Skin Studio" },
      { label: "Treatment", value: "Hydrafacial (60 min)" },
      { label: "Deposit paid", value: "$25" },
      { label: "Human input", value: "0 messages" },
    ],
    insight:
      "First-time enquiry off an Instagram post. AI matched the treatment to her concern, answered the pricing and downtime questions, then booked a Thursday slot and took the $25 deposit in-chat.",
  },
  events: [
    { type: "date", label: "Mar 3" },
    {
      type: "msg",
      direction: "in",
      text: "hi! saw your glow facial on insta 😍",
    },
    {
      type: "msg",
      direction: "in",
      grouped: true,
      text: "do you have anything for dull skin / clogged pores?",
    },
    { type: "system", tone: "ai", label: "Incoming Instagram DM · tagged" },
    {
      type: "msg",
      direction: "out",
      text: "Hi! So glad you found us 💚 Yes — for dull skin and congested pores our Hydrafacial is the one most clients love",
    },
    {
      type: "msg",
      direction: "out",
      grouped: true,
      text: "It cleanses, exfoliates and hydrates in one session, with no downtime. May I ask your name? And is this your first facial with us?",
    },
    {
      type: "msg",
      direction: "in",
      text: "I'm Maya, and yep first time. Never had a facial actually",
    },
    { type: "system", tone: "ai", label: "Contact details updated" },
    {
      type: "msg",
      direction: "out",
      text: "Lovely to meet you, Maya! First facials are honestly the best — instant glow",
    },
    {
      type: "msg",
      direction: "out",
      grouped: true,
      text: "Quick check: any active breakouts or sensitive skin we should know about? Just so we tailor it for you",
    },
    {
      type: "msg",
      direction: "in",
      text: "a bit of redness around the nose sometimes, nothing major",
    },
    {
      type: "msg",
      direction: "out",
      text: "Got it — that's very manageable, our therapist will adjust the serums for that",
    },
    {
      type: "msg",
      direction: "in",
      text: "how much is it? and how long does it take",
    },
    {
      type: "msg",
      direction: "out",
      text: "The Hydrafacial is $120 and runs about 60 minutes",
    },
    {
      type: "msg",
      direction: "out",
      grouped: true,
      text: "You can go straight back to your day after — a little glow, no peeling or redness",
    },
    {
      type: "system",
      tone: "lead",
      label: "Lead asked pricing · buying signal",
    },
    {
      type: "msg",
      direction: "in",
      text: "ok love that. can I come in this week?",
    },
    {
      type: "system",
      tone: "ai",
      label: "Retrieved available slots from calendar",
    },
    {
      type: "msg",
      direction: "out",
      text: "Yes! This week I have Wednesday 11:00, Thursday 14:30, or Friday 16:00",
    },
    {
      type: "msg",
      direction: "out",
      grouped: true,
      text: "Which works best for you?",
    },
    { type: "msg", direction: "in", text: "thursday afternoon is perfect" },
    {
      type: "msg",
      direction: "out",
      text: "Thursday 14:30 it is 🎉 To lock it in we take a small $25 deposit, which comes straight off your treatment on the day",
    },
    {
      type: "msg",
      direction: "out",
      grouped: true,
      text: "Here's the secure link: lumiereskin.example/book",
    },
    { type: "msg", direction: "in", text: "done!", leading: <PaymentIcon /> },
    { type: "system", tone: "ai", label: "Deposit confirmed · $25" },
    {
      type: "msg",
      direction: "out",
      text: "Perfect, deposit received and your spot is confirmed 💖",
    },
    {
      type: "msg",
      direction: "out",
      grouped: true,
      text: "You're booked for the Hydrafacial, Thursday at 14:30. I'll send a reminder the day before. Come with a clean face if you can — see you then, Maya!",
    },
    { type: "system", tone: "win", label: "Appointment booked · Thu 14:30" },
    {
      type: "win",
      headline: "DM to booked appointment in minutes.",
      sub: "AI matched the treatment, answered pricing and downtime, booked the slot and took the deposit. Zero humans involved.",
    },
  ],
};

// ───────────────────────────────────────────────────────────────────────────
// Thread 2 - Fitness coaching enrolment. Lead replies to a campaign, AI runs a
// short qualifier (goal, schedule, experience), handles a price objection with a
// payment-plan option and enrols them on a monthly plan. No human input.
// ───────────────────────────────────────────────────────────────────────────
const coachThread: Thread = {
  id: "coach",
  inbox: {
    redacted: true,
    name: "Lead · redacted",
    preview: "Enrolled · Lean-12 monthly plan.",
  },
  header: {
    name: "Lead",
    redactedBadge: true,
    channelTag: "WhatsApp",
    statusText: "AI handling · coaching enrolment",
  },
  lead: {
    displayName: "Lead",
    redactedBadge: true,
    sub: "+1 ·· ·· ·· · US",
    statusLabel: "Status",
    statusValue: "Enrolled · monthly",
    rows: [
      { label: "Business", value: "Northside Strength Co." },
      { label: "Plan", value: "Lean-12 ($89/mo)" },
      { label: "Goal", value: "Lose 15 lb · build habit" },
      { label: "Human input", value: "0 messages" },
    ],
    insight:
      "Replied to a re-engagement campaign. AI qualified the goal and schedule, handled the 'too expensive' objection with a 3-pay option, and enrolled them on the monthly plan — all in one conversation.",
  },
  events: [
    { type: "date", label: "Feb 12" },
    {
      type: "system",
      tone: "ai",
      label: "Added to campaign · New Year reactivation",
    },
    {
      type: "msg",
      direction: "in",
      text: "Hey saw your message about the coaching thing. Still thinking about getting back in shape",
    },
    {
      type: "msg",
      direction: "out",
      text: "Hey! Great to hear from you 💪 What's the main goal right now — lose some weight, build strength, or just get back into a routine?",
    },
    {
      type: "msg",
      direction: "in",
      text: "Honestly all of it lol. Want to drop maybe 15 pounds and actually stick to it this time",
    },
    { type: "system", tone: "ai", label: "AI qualifies lead · goal captured" },
    {
      type: "msg",
      direction: "out",
      text: "That's a totally doable goal, and the 'stick to it' part is exactly what our coaching is built for",
    },
    {
      type: "msg",
      direction: "out",
      grouped: true,
      text: "Quick one: how many days a week can you realistically train? And do you prefer the gym or working out at home?",
    },
    {
      type: "msg",
      direction: "in",
      text: "Maybe 3 days. Gym, I have a membership already",
    },
    {
      type: "msg",
      direction: "out",
      text: "Perfect — 3 days at the gym is plenty for real results",
    },
    {
      type: "msg",
      direction: "out",
      grouped: true,
      text: "Our Lean-12 plan is built for exactly this: a 3-day program tailored to you, weekly check-ins, and a coach in your pocket to keep you on track. Most people see steady progress in the first month",
    },
    { type: "msg", direction: "in", text: "How much is it?" },
    {
      type: "msg",
      direction: "out",
      text: "It's $89 a month, cancel anytime — no lock-in",
    },
    {
      type: "msg",
      direction: "in",
      text: "Hmm that's a bit more than I wanted to spend right now",
    },
    { type: "system", tone: "lead", label: "Price objection" },
    {
      type: "msg",
      direction: "out",
      text: "Totally fair. A lot of folks start with our 3-pay option — $33 a week for the first month, then it switches to the regular $89/mo. Same program, just gentler upfront",
    },
    {
      type: "msg",
      direction: "out",
      grouped: true,
      text: "And if it's not for you in the first 14 days, we refund it. So there's basically no risk in trying",
    },
    {
      type: "msg",
      direction: "in",
      text: "Ok that actually works. Let's do the 3-pay one",
    },
    {
      type: "msg",
      direction: "out",
      text: "Love it — let's get you started 🙌 Here's the secure sign-up: northsidestrength.example/lean12",
    },
    {
      type: "msg",
      direction: "out",
      grouped: true,
      text: "Once you're in, your coach builds your first week's plan within 24 hours",
    },
    {
      type: "msg",
      direction: "in",
      text: "Just signed up",
      leading: <PaymentIcon />,
    },
    { type: "system", tone: "ai", label: "Enrolment confirmed · Lean-12" },
    {
      type: "msg",
      direction: "out",
      text: "You're in! 🎉 Welcome to Northside. I've let your coach know — expect your first plan and a welcome call invite tomorrow",
    },
    {
      type: "msg",
      direction: "out",
      grouped: true,
      text: "Proud of you for starting. Let's get those 15 pounds gone 💪",
    },
    { type: "system", tone: "win", label: "Enrolled · monthly plan" },
    {
      type: "win",
      headline: "Cold reply to paying member.",
      sub: "AI qualified the goal, handled the price objection with a payment plan, and closed the enrolment in one chat.",
    },
  ],
};

// ───────────────────────────────────────────────────────────────────────────
// Thread 3 - E-commerce product question → purchase, with a clean human handoff.
// AI answers sizing/fit and closes the sale, then a few days later a warranty
// edge case comes in and the AI recognises it's outside scope and alerts a human.
// ───────────────────────────────────────────────────────────────────────────
const shopThread: Thread = {
  id: "shop",
  inbox: {
    redacted: true,
    name: "Lead · redacted",
    preview: "Warranty case forwarded to support.",
  },
  header: {
    name: "Lead",
    redactedBadge: true,
    channelTag: "Web Chat",
    statusText: "AI handling · online store (handed off)",
  },
  lead: {
    displayName: "Lead",
    redactedBadge: true,
    sub: "Web chat visitor · UK",
    statusLabel: "Status",
    statusValue: "Paid · warranty handed off",
    rows: [
      { label: "Business", value: "Drift & Co. Footwear" },
      { label: "Order", value: "Trail Runner · $138" },
      { label: "AI handled", value: "Sizing + checkout" },
      { label: "Human picked up", value: "Warranty claim" },
    ],
    insight:
      "AI answered a fit question and closed a $138 order in one session. Five days later the same customer came back with a warranty question — the AI recognised it needed a human and handed off cleanly with full context.",
  },
  events: [
    { type: "date", label: "Apr 2" },
    {
      type: "msg",
      direction: "in",
      text: "Hi, are the Trail Runners true to size? I'm normally a UK 9 but between sizes in some brands",
    },
    {
      type: "msg",
      direction: "out",
      text: "Hi! Great question 👟 The Trail Runner runs slightly snug, so if you're between sizes we'd usually suggest sizing up to a UK 9.5",
    },
    {
      type: "msg",
      direction: "out",
      grouped: true,
      text: "Are you planning to wear thicker socks, or mainly for road or trail?",
    },
    {
      type: "msg",
      direction: "in",
      text: "Mostly trail, lighter socks. So 9.5 you reckon?",
    },
    {
      type: "msg",
      direction: "out",
      text: "For trail with lighter socks, yes — I'd go 9.5. You want a touch of room at the toe for the downhills",
    },
    {
      type: "msg",
      direction: "in",
      text: "Cool. Do you have them in the green?",
    },
    {
      type: "msg",
      direction: "out",
      text: "We do — the Forest Green is in stock in 9.5 right now",
    },
    {
      type: "msg",
      direction: "out",
      grouped: true,
      text: "They're $138 with free shipping, and free returns within 30 days if the fit isn't right. Want me to drop a link to checkout?",
    },
    { type: "msg", direction: "in", text: "Yeah go on" },
    {
      type: "msg",
      direction: "out",
      text: "Here you go: driftandco.example/trail-runner-green-95",
    },
    {
      type: "msg",
      direction: "out",
      grouped: true,
      text: "Your size and colour are pre-filled, so it's just a couple of taps",
    },
    { type: "msg", direction: "in", text: "Ordered, thanks!" },
    { type: "system", tone: "win", label: "Order placed · $138" },
    {
      type: "msg",
      direction: "out",
      text: "Amazing, order confirmed ✅ You'll get tracking by email within a day. Enjoy the trails! 🌲",
    },
    { type: "system", tone: "warn", label: "Chat window closed · no reply" },

    { type: "gap", label: "5 days later" },

    { type: "date", label: "Apr 7" },
    {
      type: "msg",
      direction: "in",
      text: "Hey, got the shoes and love them, but the left one's sole is already separating a little at the toe. Is that covered?",
    },
    {
      type: "msg",
      direction: "out",
      text: "Oh no — sorry to hear that, that's definitely not normal for a pair this new 😟",
    },
    {
      type: "msg",
      direction: "out",
      grouped: true,
      text: "That sounds like a warranty case, and those are handled by our support team so they can arrange a replacement or refund properly",
    },
    {
      type: "system",
      tone: "warn",
      label: "AI alerted a human · warranty outside scope",
    },
    { type: "system", tone: "ai", label: "Support agent took over" },
    {
      type: "msg",
      direction: "out",
      text: "Hi, this is Priya from Drift & Co. support — I can see your Trail Runner order and the chat above. A separating sole this early is covered under our 1-year warranty, no question",
    },
    {
      type: "msg",
      direction: "out",
      grouped: true,
      text: "Could you send a quick photo of the toe area? I'll get a replacement pair shipped out today and email you a prepaid return label for the faulty one",
    },
    {
      type: "msg",
      direction: "in",
      text: "Brilliant, sending now. Thank you!",
    },
    {
      type: "system",
      tone: "win",
      label: "Warranty case opened · replacement shipping",
    },
    {
      type: "win",
      headline: "Closed the sale. Knew when to hand off.",
      sub: "AI nailed the fit question and the checkout, then recognised a warranty claim needed a human and handed off with full context.",
    },
  ],
};

// ───────────────────────────────────────────────────────────────────────────
// Thread 4 - Local home-services quote → booked appointment. Lead messages a
// gutter-cleaning company on Messenger, AI scopes the job, gives a transparent
// quote range, books a visit and confirms. No human input.
// ───────────────────────────────────────────────────────────────────────────
const homeServiceThread: Thread = {
  id: "home-service",
  inbox: {
    redacted: true,
    name: "Lead · redacted",
    preview: "Booked Sat 09:00. Quote $140–$180.",
  },
  header: {
    name: "Lead",
    redactedBadge: true,
    channelTag: "Messenger",
    statusText: "AI handling · home services",
  },
  lead: {
    displayName: "Lead",
    redactedBadge: true,
    sub: "Messenger · ····· · suburb redacted",
    statusLabel: "Status",
    statusValue: "Visit booked",
    rows: [
      { label: "Business", value: "Clearline Gutter & Exterior" },
      { label: "Job", value: "Gutter clean · single-storey" },
      { label: "Quote", value: "$140 – $180" },
      { label: "Booked for", value: "Sat 09:00" },
    ],
    insight:
      "Messenger enquiry off a local ad. AI scoped the property, gave an honest quote range, checked the service area and booked a Saturday visit — turning a cold message into a confirmed job in minutes.",
  },
  events: [
    { type: "date", label: "May 6" },
    { type: "system", tone: "ai", label: "Incoming Messenger · tagged" },
    {
      type: "msg",
      direction: "in",
      text: "Hi do you do gutter cleaning? Mine are overflowing when it rains",
    },
    {
      type: "msg",
      direction: "out",
      text: "Hi there! Yes we do — overflowing gutters usually means they're packed with leaves, very common this time of year 🍂",
    },
    {
      type: "msg",
      direction: "out",
      grouped: true,
      text: "To give you an accurate quote, a few quick questions. Is your home single or double storey?",
    },
    { type: "msg", direction: "in", text: "Single storey, three-bed house" },
    {
      type: "msg",
      direction: "out",
      text: "Perfect. And roughly when were the gutters last cleaned — within the last year, or has it been a while?",
    },
    { type: "msg", direction: "in", text: "Honestly probably 2-3 years 😅" },
    { type: "system", tone: "ai", label: "AI scopes job" },
    {
      type: "msg",
      direction: "out",
      text: "No worries, that's a very typical job for us",
    },
    {
      type: "msg",
      direction: "out",
      grouped: true,
      text: "For a single-storey three-bed that hasn't been done in a couple of years, you're looking at roughly $140–$180. The range covers how much build-up we find — we'll confirm the exact figure on site before we start, no surprises",
    },
    {
      type: "msg",
      direction: "out",
      grouped: true,
      text: "That includes clearing all gutters and downpipes plus a quick flush test. What's your suburb? Just checking you're in our service area",
    },
    { type: "msg", direction: "in", text: "Riverton" },
    { type: "system", tone: "ai", label: "Service area confirmed" },
    {
      type: "msg",
      direction: "out",
      text: "You're right in our area 👍 We've got availability this week. I can offer Friday afternoon or Saturday 9:00 AM — which suits you?",
    },
    { type: "msg", direction: "in", text: "Saturday morning would be great" },
    {
      type: "msg",
      direction: "out",
      text: "Saturday 9:00 AM it is. Could I grab your name and the street address so the team knows where to go?",
    },
    {
      type: "msg",
      direction: "in",
      text: "[name redacted], [address redacted], Riverton",
    },
    {
      type: "system",
      tone: "ai",
      label: "Contact details captured · appointment created",
    },
    {
      type: "msg",
      direction: "out",
      text: "All booked ✅ Our team will arrive Saturday at 9:00 AM. They'll confirm the final price on site before starting — should land between $140 and $180",
    },
    {
      type: "msg",
      direction: "out",
      grouped: true,
      text: "I'll send a reminder the evening before. Anything else you'd like cleared while we're up there, like the roof valleys?",
    },
    {
      type: "msg",
      direction: "in",
      text: "No that's all for now, thanks heaps!",
    },
    {
      type: "msg",
      direction: "out",
      text: "You're very welcome — see you Saturday! 👋",
    },
    {
      type: "system",
      tone: "win",
      label: "Visit booked · Sat 09:00 · $140–$180",
    },
    {
      type: "win",
      headline: "Cold enquiry to booked job.",
      sub: "AI scoped the property, gave an honest quote range, confirmed the service area and locked in a Saturday visit. Zero humans involved.",
    },
  ],
};

export const THREADS: Thread[] = [
  spaThread,
  coachThread,
  shopThread,
  homeServiceThread,
];
