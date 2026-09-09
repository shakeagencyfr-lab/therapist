// Types et pictogrammes partagés par les conversations de démonstration.
// Extraits ici pour que les versions française et anglaise puissent les
// importer sans créer d'import circulaire.
//
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

export const PaymentIcon = () => (
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

