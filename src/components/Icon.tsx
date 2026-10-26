const PATHS = {
  home: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  book: 'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H7a2 2 0 0 0-2 2V4.5zM5 20a2 2 0 0 0 2 1h12',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z',
  list: 'M9 6h12M9 12h12M9 18h12M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  cube: 'M12 2.5 20.5 7v10L12 21.5 3.5 17V7zM12 12l8.5-5M12 12 3.5 7M12 12v9.5',
  vr: 'M3 8.5A1.5 1.5 0 0 1 4.5 7h15A1.5 1.5 0 0 1 21 8.5v6a2 2 0 0 1-2 2h-3.2a1.5 1.5 0 0 1-1.3-.75L13.2 14h-2.4l-1.3 1.75a1.5 1.5 0 0 1-1.3.75H5a2 2 0 0 1-2-2z',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2.5v2.5H14zM19 14h1v1M14 19h2v1M18.5 18.5H20V20h-1.5z',
  volume: 'M4 9.5v5h3.5L12 18.5v-13L7.5 9.5zM15.5 9a4 4 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11',
  mute: 'M4 9.5v5h3.5L12 18.5v-13L7.5 9.5zM16 9.5l5 5M21 9.5l-5 5',
  close: 'M6 6l12 12M18 6 6 18',
  check: 'M5 12.5 10 17.5 19 7.5',
  leaf: 'M5 19c0-8 5-13 14-14 0 9-5 14-13 14M5 19c2-4 4-6 8-8',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
} as const;

export type IconName = keyof typeof PATHS;

export default function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}
