'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

function IconMap({ active }: { active: boolean }) {
  const color = active ? '#FFFFFF' : '#8B8B9A';
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" fill={active ? 'rgba(255,255,255,0.15)' : 'none'} />
      <line x1="9" y1="3" x2="9" y2="18" />
      <line x1="15" y1="6" x2="15" y2="21" />
    </svg>
  );
}

function IconGrid({ active }: { active: boolean }) {
  const color = active ? '#FFFFFF' : '#8B8B9A';
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" fill={active ? '#FFFFFF' : 'none'} />
      <rect x="14" y="3" width="7" height="7" rx="1.5" fill={active ? '#FFFFFF' : 'none'} />
      <rect x="3" y="14" width="7" height="7" rx="1.5" fill={active ? '#FFFFFF' : 'none'} />
      <rect x="14" y="14" width="7" height="7" rx="1.5" fill={active ? '#FFFFFF' : 'none'} />
    </svg>
  );
}

function IconBookmark({ active }: { active: boolean }) {
  const color = active ? '#FFFFFF' : '#8B8B9A';
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"
        fill={active ? '#FFFFFF' : 'none'} />
    </svg>
  );
}

const NAV_ITEMS = [
  { href: '/trend',      label: '트렌드', Icon: IconMap },
  { href: '/',           label: '피드',   Icon: IconGrid },
  { href: '/collection', label: '컬렉션', Icon: IconBookmark },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav" aria-label="하단 내비게이션">
      {NAV_ITEMS.map(({ href, label, Icon }) => {
        const isActive =
          href === '/'
            ? pathname === '/' || pathname.startsWith('/feed/')
            : pathname.startsWith(href);

        return (
          <Link
            key={href}
            href={href}
            className={`bottom-nav-item${isActive ? ' active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textDecoration: 'none',
              gap: '4px',
            }}
          >
            <Icon active={isActive} />
            <span style={{
              fontSize: '10px',
              fontWeight: isActive ? 600 : 400,
              color: isActive ? '#FFFFFF' : '#8B8B9A',
              transition: 'color 0.2s ease',
              whiteSpace: 'nowrap',
            }}>
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
