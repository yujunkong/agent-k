/**
 * Shared stroke icons for chat chrome (v2.1 Icons port + settings/composer extras).
 * Cursor-like 24 viewBox, default 14px.
 */
import type { JSX, ReactNode } from 'react';

export type IconProps = {
  size?: number;
  className?: string;
  title?: string;
};

function Svg({
  size = 14,
  className,
  title,
  children,
}: IconProps & { children: ReactNode }): JSX.Element {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export function IconEdit(p: IconProps): JSX.Element {
  return (
    <Svg {...p}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </Svg>
  );
}

export function IconCopy(p: IconProps): JSX.Element {
  return (
    <Svg {...p}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </Svg>
  );
}

export function IconTrash(p: IconProps): JSX.Element {
  return (
    <Svg {...p}>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </Svg>
  );
}

export function IconRefresh(p: IconProps): JSX.Element {
  return (
    <Svg {...p}>
      <path d="M21 12a9 9 0 1 1-2.6-6.4" />
      <path d="M21 3v6h-6" />
    </Svg>
  );
}

export function IconHistory(p: IconProps): JSX.Element {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Svg>
  );
}

export function IconPlus(p: IconProps): JSX.Element {
  return (
    <Svg {...p}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Svg>
  );
}

export function IconSettings(p: IconProps): JSX.Element {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </Svg>
  );
}

export function IconMore(p: IconProps): JSX.Element {
  return (
    <Svg {...p}>
      <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconSidebar(p: IconProps): JSX.Element {
  return (
    <Svg {...p}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M15 3v18" />
    </Svg>
  );
}

export function IconPlay(p: IconProps): JSX.Element {
  return (
    <Svg {...p}>
      <path d="M8 5v14l11-7Z" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconQueue(p: IconProps): JSX.Element {
  return (
    <Svg {...p}>
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M3 6h.01" />
      <path d="M3 12h.01" />
      <path d="M3 18h.01" />
    </Svg>
  );
}

export function IconClose(p: IconProps): JSX.Element {
  return (
    <Svg {...p}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </Svg>
  );
}

export function IconCheck(p: IconProps): JSX.Element {
  return (
    <Svg {...p}>
      <path d="M20 6 9 17l-5-5" />
    </Svg>
  );
}

export function IconFork(p: IconProps): JSX.Element {
  return (
    <Svg {...p}>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M8.5 7.5 15.5 7.5" />
      <path d="M6 8.5v7a2 2 0 0 0 2 2h7.5" />
    </Svg>
  );
}

export function IconChevronDown(p: IconProps): JSX.Element {
  return (
    <Svg {...p}>
      <path d="m6 9 6 6 6-6" />
    </Svg>
  );
}

export function IconChevronRight(p: IconProps): JSX.Element {
  return (
    <Svg {...p}>
      <path d="m9 18 6-6-6-6" />
    </Svg>
  );
}

export function IconChevronUp(p: IconProps): JSX.Element {
  return (
    <Svg {...p}>
      <path d="m18 15-6-6-6 6" />
    </Svg>
  );
}

/** Agent mode — infinity */
export function IconInfinity(p: IconProps): JSX.Element {
  return (
    <Svg {...p}>
      <path d="M18.178 8c5.096 0 5.096 8 0 8-5.095 0-7.133-8-12.739-8-4.585 0-4.585 8 0 8 5.606 0 7.644-8 12.74-8z" />
    </Svg>
  );
}

/** Plan mode — bulleted list */
export function IconList(p: IconProps): JSX.Element {
  return (
    <Svg {...p}>
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <circle cx="4" cy="6" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="4" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="4" cy="18" r="1.2" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Debug mode — bug */
export function IconBug(p: IconProps): JSX.Element {
  return (
    <Svg {...p}>
      <path d="M8 8.5V7a4 4 0 0 1 8 0v1.5" />
      <rect x="7" y="8.5" width="10" height="10" rx="4" />
      <path d="M12 12v4" />
      <path d="M9 14h6" />
      <path d="m5 10-2-1" />
      <path d="m19 10 2-1" />
      <path d="m5 16-2 1" />
      <path d="m19 16 2 1" />
      <path d="M5 13H3" />
      <path d="M21 13h-2" />
    </Svg>
  );
}

/** Ask mode — speech bubble */
export function IconMessage(p: IconProps): JSX.Element {
  return (
    <Svg {...p}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </Svg>
  );
}

/** Auto mode — spark */
export function IconSpark(p: IconProps): JSX.Element {
  return (
    <Svg {...p}>
      <path d="M12 3v4" />
      <path d="M12 17v4" />
      <path d="M3 12h4" />
      <path d="M17 12h4" />
      <path d="m6 6 2.5 2.5" />
      <path d="m15.5 15.5 2.5 2.5" />
      <path d="m18 6-2.5 2.5" />
      <path d="m8.5 15.5-2.5 2.5" />
    </Svg>
  );
}

export function IconSearch(p: IconProps): JSX.Element {
  return (
    <Svg {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </Svg>
  );
}

/** Composer send (arrow up) */
export function IconSend(p: IconProps): JSX.Element {
  return (
    <Svg {...p}>
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </Svg>
  );
}

export function IconStop(p: IconProps): JSX.Element {
  return (
    <Svg {...p}>
      <rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconAttach(p: IconProps): JSX.Element {
  return (
    <Svg {...p}>
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </Svg>
  );
}

export function IconAt(p: IconProps): JSX.Element {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
    </Svg>
  );
}

export function IconTerminal(p: IconProps): JSX.Element {
  return (
    <Svg {...p}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="m7 9 3 3-3 3" />
      <path d="M13 15h4" />
    </Svg>
  );
}

export function IconShield(p: IconProps): JSX.Element {
  return (
    <Svg {...p}>
      <path d="M12 3 4 7v5c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V7l-8-4Z" />
    </Svg>
  );
}

export function IconPrivacy(p: IconProps): JSX.Element {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v18" />
      <path d="M12 3a9 9 0 0 1 0 18" fill="currentColor" stroke="none" opacity="0.35" />
    </Svg>
  );
}

export function IconBraces(p: IconProps): JSX.Element {
  return (
    <Svg {...p}>
      <path d="M8 4H6a2 2 0 0 0-2 2v3a2 2 0 0 1-2 2 2 2 0 0 1 2 2v3a2 2 0 0 0 2 2h2" />
      <path d="M16 4h2a2 2 0 0 1 2 2v3a2 2 0 0 0 2 2 2 2 0 0 0-2 2v3a2 2 0 0 1-2 2h-2" />
    </Svg>
  );
}

export function IconHexagon(p: IconProps): JSX.Element {
  return (
    <Svg {...p}>
      <path d="M12 2 20 7v10l-8 5-8-5V7l8-5Z" />
    </Svg>
  );
}

export function IconDiamond(p: IconProps): JSX.Element {
  return (
    <Svg {...p}>
      <path d="M12 3 21 12 12 21 3 12 12 3Z" />
    </Svg>
  );
}

export function IconTarget(p: IconProps): JSX.Element {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconGrid(p: IconProps): JSX.Element {
  return (
    <Svg {...p}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </Svg>
  );
}

export function IconLayers(p: IconProps): JSX.Element {
  return (
    <Svg {...p}>
      <path d="m12 2 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 17 9 5 9-5" />
    </Svg>
  );
}

export function IconPlug(p: IconProps): JSX.Element {
  return (
    <Svg {...p}>
      <path d="M12 22v-5" />
      <path d="M9 8V2" />
      <path d="M15 8V2" />
      <path d="M18 8v5a6 6 0 0 1-12 0V8Z" />
    </Svg>
  );
}

export function IconScroll(p: IconProps): JSX.Element {
  return (
    <Svg {...p}>
      <path d="M8 4h9a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8" />
      <path d="M8 4a2 2 0 0 0-2 2v1a2 2 0 0 1-2 2 2 2 0 0 0 0 4 2 2 0 0 1 2 2v1a2 2 0 0 0 2 2" />
      <path d="M12 10h4" />
      <path d="M12 14h4" />
    </Svg>
  );
}

/* ── Aliases used by ModeSelector / older imports ───────── */
export {
  IconChevronDown as IconChevronDownAlias,
  IconInfinity as IconInfinityAlias,
  IconBug as IconBugAlias,
  IconSpark as IconSparkAlias,
  IconFork as IconBranch,
  IconSend as IconArrowUp,
};

/** ModeSelector-compatible names (v2.1 export style). */
export const IconChevronDownCompat = IconChevronDown;
export const IconInfinityCompat = IconInfinity;
export const IconBugCompat = IconBug;
export const IconSparkCompat = IconSpark;

// Re-export under the exact identifiers ModeSelector imports.
export {
  IconChevronDown as IconChevronDownNamed,
};
