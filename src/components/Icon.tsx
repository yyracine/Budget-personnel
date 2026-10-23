import type { ReactNode } from 'react';

export type IconName =
  | 'briefcase'
  | 'laptop'
  | 'store'
  | 'award'
  | 'home'
  | 'trending-up'
  | 'plus-circle'
  | 'basket'
  | 'car'
  | 'heart'
  | 'graduation'
  | 'zap'
  | 'wifi'
  | 'users'
  | 'gamepad'
  | 'shirt'
  | 'repeat'
  | 'piggy-bank'
  | 'receipt'
  | 'more'
  | 'wallet'
  | 'tag'
  | 'dashboard'
  | 'list'
  | 'categories'
  | 'target'
  | 'calendar'
  | 'chart'
  | 'upload'
  | 'download'
  | 'settings'
  | 'plus'
  | 'edit'
  | 'trash'
  | 'x'
  | 'check'
  | 'alert'
  | 'info'
  | 'chevron-left'
  | 'chevron-right'
  | 'menu'
  | 'sun'
  | 'moon'
  | 'monitor'
  | 'search'
  | 'filter'
  | 'refresh'
  | 'file-spreadsheet'
  | 'file-text'
  | 'database'
  | 'shield'
  | 'arrow-up-right'
  | 'arrow-down-right'
  | 'arrow-up'
  | 'arrow-down'
  | 'power'
  | 'scale'
  | 'sparkle';

const PATHS: Record<IconName, ReactNode> = {
  briefcase: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M3 12h18" />
      <path d="M10 12v2h4v-2" />
    </>
  ),
  laptop: (
    <>
      <rect x="4" y="5" width="16" height="11" rx="2" />
      <path d="M2 19h20" />
      <path d="M9 19h6" />
    </>
  ),
  store: (
    <>
      <path d="M3 9l1.5-5h15L21 9" />
      <path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" />
      <path d="M5 12v8h14v-8" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  award: (
    <>
      <circle cx="12" cy="9" r="6" />
      <path d="M8.5 14.5L7 22l5-3 5 3-1.5-7.5" />
    </>
  ),
  home: (
    <>
      <path d="M3 10.5L12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9.5 21v-6h5v6" />
    </>
  ),
  'trending-up': (
    <>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </>
  ),
  'plus-circle': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  basket: (
    <>
      <path d="M4 10h16l-1.5 10h-13L4 10z" />
      <path d="M8 10L10 3M16 10L14 3" />
      <path d="M9.5 14v2.5M14.5 14v2.5" />
    </>
  ),
  car: (
    <>
      <path d="M5 17h14" />
      <path d="M6.5 17v2M17.5 17v2" />
      <path d="M4 13l1.8-5.2A2 2 0 0 1 7.7 6.5h8.6a2 2 0 0 1 1.9 1.3L20 13" />
      <path d="M4 13h16v4H4z" />
      <path d="M7 15h.01M17 15h.01" />
    </>
  ),
  heart: <path d="M20.8 5.6a5.5 5.5 0 0 0-7.8 0L12 6.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l8.8 8.8 8.8-8.8a5.5 5.5 0 0 0 0-7.8z" />,
  graduation: (
    <>
      <path d="M2 9l10-5 10 5-10 5L2 9z" />
      <path d="M6 11.5V17c0 1.5 2.7 3 6 3s6-1.5 6-3v-5.5" />
      <path d="M22 9v6" />
    </>
  ),
  zap: <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" />,
  wifi: (
    <>
      <path d="M2.5 8.5a15 15 0 0 1 19 0" />
      <path d="M5.5 12a11 11 0 0 1 13 0" />
      <path d="M8.5 15.5a7 7 0 0 1 7 0" />
      <path d="M12 19h.01" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 5a3.5 3.5 0 0 1 0 7" />
      <path d="M18 14.5a6 6 0 0 1 3.5 5.5" />
    </>
  ),
  gamepad: (
    <>
      <path d="M7 8h10a4 4 0 0 1 3.8 5.2l-1.2 4a2.4 2.4 0 0 1-4.1 1l-1.8-2H10.3l-1.8 2a2.4 2.4 0 0 1-4.1-1l-1.2-4A4 4 0 0 1 7 8z" />
      <path d="M8 11v3M6.5 12.5h3M15.5 11.5h.01M17.5 13.5h.01" />
    </>
  ),
  shirt: (
    <>
      <path d="M8 3l4 2 4-2 5 3-2.5 4-2.5-1v11H8V9L5.5 10 3 6l5-3z" />
    </>
  ),
  repeat: (
    <>
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11V9a3 3 0 0 1 3-3h15" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v2a3 3 0 0 1-3 3H3" />
    </>
  ),
  'piggy-bank': (
    <>
      <path d="M4 12a6 6 0 0 1 6-6h5a6 6 0 0 1 5 6v3h-2l-1 4h-3l-1-2H9l-1 2H5l-1-4H2v-3h2z" />
      <path d="M5 7l1-2h4M16 10h.01" />
      <path d="M8 19v2M18 19v2" />
    </>
  ),
  receipt: (
    <>
      <path d="M5 3h14v18l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21V3z" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="19" cy="12" r="1.4" />
    </>
  ),
  wallet: (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1" />
      <path d="M3 7v11a2 2 0 0 0 2 2h15V7H5a2 2 0 0 1-2-2v2z" />
      <path d="M16 13h3" />
    </>
  ),
  tag: (
    <>
      <path d="M20 12l-8 8-9-9V3h8l9 9z" />
      <circle cx="7.5" cy="7.5" r="1.4" />
    </>
  ),
  dashboard: (
    <>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="5" rx="1.5" />
      <rect x="13" y="10" width="8" height="11" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
    </>
  ),
  list: (
    <>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
    </>
  ),
  categories: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.4" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V3" />
      <path d="M7 8l5-5 5 5" />
      <path d="M3 15v5h18v-5" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v13" />
      <path d="M7 11l5 5 5-5" />
      <path d="M3 19v2h18v-2" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h16M4 17h16" />
      <circle cx="9" cy="7" r="2.4" />
      <circle cx="15" cy="17" r="2.4" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  edit: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18M8 6V3h8v3M19 6l-1 15H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  x: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M20 6L9 17l-5-5" />,
  alert: (
    <>
      <path d="M10.3 3.9L2.5 17.2A2 2 0 0 0 4.2 20h15.6a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  'chevron-left': <path d="M15 18l-6-6 6-6" />,
  'chevron-right': <path d="M9 6l6 6-6 6" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </>
  ),
  filter: <path d="M3 5h18l-7 8v6l-4 2v-8L3 5z" />,
  refresh: (
    <>
      <path d="M21 12a9 9 0 1 1-2.6-6.4" />
      <path d="M21 4v5h-5" />
    </>
  ),
  'file-spreadsheet': (
    <>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z" />
      <path d="M14 3v6h6" />
      <path d="M8 13h8M8 17h8M11 13v4" />
    </>
  ),
  'file-text': (
    <>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z" />
      <path d="M14 3v6h6" />
      <path d="M8 13h8M8 17h6" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
      <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l8 3v6c0 5-3.4 8.3-8 9-4.6-.7-8-4-8-9V6l8-3z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  'arrow-up-right': (
    <>
      <path d="M7 17L17 7" />
      <path d="M8 7h9v9" />
    </>
  ),
  'arrow-down-right': (
    <>
      <path d="M7 7l10 10" />
      <path d="M17 8v9H8" />
    </>
  ),
  'arrow-up': <path d="M12 20V4M5 11l7-7 7 7" />,
  'arrow-down': <path d="M12 4v16M5 13l7 7 7-7" />,
  power: (
    <>
      <path d="M12 3v9" />
      <path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
    </>
  ),
  scale: (
    <>
      <path d="M12 3v18M7 21h10" />
      <path d="M4 7l3-3 3 3M14 7l3-3 3 3" />
      <path d="M4 7l-2 5a3 3 0 0 0 6 0L6 7M14 7l-2 5a3 3 0 0 0 6 0l-2-5" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
      <path d="M19 16l.9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9L19 16z" />
    </>
  ),
};

export interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function Icon({ name, size = 20, strokeWidth = 1.8, className }: IconProps) {
  const content = Object.prototype.hasOwnProperty.call(PATHS, name) ? PATHS[name] : PATHS.tag;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {content}
    </svg>
  );
}

export function isIconName(value: string): value is IconName {
  return Object.prototype.hasOwnProperty.call(PATHS, value);
}
