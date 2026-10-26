interface Props {
  color: string;
  size?: number;
  /** Si es falso, se dibuja solo el contorno (espacio vacío). */
  filled?: boolean;
}

export default function MushroomIcon({ color, size = 28, filled = true }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path
        d="M8 36C8 21 19 10 32 10s24 11 24 26z"
        fill={filled ? color : 'none'}
        stroke={filled ? 'rgba(0,0,0,.25)' : 'currentColor'}
        strokeWidth="3"
        strokeDasharray={filled ? undefined : '5 4'}
      />
      <path
        d="M25 36h14v15a7 7 0 0 1-14 0z"
        fill={filled ? '#f1e6d2' : 'none'}
        stroke={filled ? 'rgba(0,0,0,.2)' : 'currentColor'}
        strokeWidth="3"
        strokeDasharray={filled ? undefined : '5 4'}
      />
      {filled && (
        <>
          <circle cx="22" cy="26" r="3.2" fill="#fff8ea" />
          <circle cx="35" cy="20" r="2.6" fill="#fff8ea" />
          <circle cx="44" cy="30" r="2.2" fill="#fff8ea" />
        </>
      )}
    </svg>
  );
}
