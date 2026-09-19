const S = ({ size = 17, sw = 1.8, children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const Icon = {
  search: (p) => <S size={16} sw={2} {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></S>,
  home: (p) => <S {...p}><path d="M3 10l9-7 9 7v10a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z" /></S>,
  users: (p) => <S {...p}><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /><path d="M17 11a3 3 0 100-6" /><path d="M18.5 20c0-2.4-1-4-2.5-4.9" /></S>,
  user: (p) => <S {...p}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" /></S>,
  file: (p) => <S {...p}><path d="M14 3H7a1 1 0 00-1 1v16a1 1 0 001 1h10a1 1 0 001-1V7z" /><path d="M14 3v4h4" /></S>,
  cal: (p) => <S {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></S>,
  check: (p) => <S sw={1.9} {...p}><path d="M20 6L9 17l-5-5" /></S>,
  award: (p) => <S {...p}><circle cx="12" cy="9" r="5.5" /><path d="M8.5 14L7 22l5-2.6L17 22l-1.5-8" /></S>,
  chart: (p) => <S {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></S>,
  cog: (p) => <S {...p}><circle cx="12" cy="12" r="3.2" /><path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-2.7 1.1v.2a2 2 0 11-4 0v-.1a1.6 1.6 0 00-2.8-1.1l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.6 1.6 0 004.6 15a2 2 0 01-2-2 2 2 0 012-2 1.6 1.6 0 001.1-2.7l-.1-.1a2 2 0 112.8-2.8l.1.1A1.6 1.6 0 0011 4.6 2 2 0 0113 2.6a2 2 0 012 2 1.6 1.6 0 002.7 1.1l.1-.1a2 2 0 112.8 2.8l-.1.1A1.6 1.6 0 0021.4 11a2 2 0 012 2 2 2 0 01-2 2z" /></S>,
  list: (p) => <S {...p}><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></S>,
  bell: (p) => <S size={18} sw={1.7} {...p}><path d="M18 8a6 6 0 10-12 0c0 6-2 7-2 7h16s-2-1-2-7" /><path d="M13.7 20a2 2 0 01-3.4 0" /></S>,
  moon: (p) => <S sw={1.7} {...p}><path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z" /></S>,
  sun: (p) => <S sw={1.7} {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></S>,
  menu: (p) => <S size={18} sw={2} {...p}><path d="M4 7h16M4 12h16M4 17h16" /></S>,
  edit: (p) => <S size={14} sw={1.9} {...p}><path d="M4 20h4L20 8l-4-4L4 16z" /></S>,
  eye: (p) => <S size={14} sw={1.9} {...p}><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z" /><circle cx="12" cy="12" r="2.5" /></S>,
  plus: (p) => <S size={15} sw={2} {...p}><path d="M12 5v14M5 12h14" /></S>,
  download: (p) => <S size={15} {...p}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></S>,
  print: (p) => <S size={15} {...p}><path d="M6 9V3h12v6M6 18H4v-7h16v7h-2" /><rect x="6" y="14" width="12" height="7" /></S>,
  qr: (p) => <S size={15} {...p}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><path d="M14 14h3v3M21 14v7h-4M14 21h.01" /></S>,
  logout: (p) => <S size={15} {...p}><path d="M15 4h4a1 1 0 011 1v14a1 1 0 01-1 1h-4M10 17l-5-5 5-5M5 12h11" /></S>,
  whatsapp: (p) => <S size={15} {...p}><path d="M4 20l1.3-4A8 8 0 1112 20a8 8 0 01-4-1z" /><path d="M9 9.5c.3 2 2.5 4.2 4.5 4.5l1-1.2 1.8.9c-.2 1-1 1.8-2.1 1.8C11 15.5 8.5 13 8.5 9.8 8.5 8.7 9.3 8 10.3 7.8l.9 1.8z" /></S>,
};
