interface Props {
  size?: number;
  className?: string;
}

export function BeamLogo({ size = 20, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Top beam — full width, curved left start */}
      <path
        d="M1.5 5 C3 2.5 5.5 3.5 6.5 5 L18.5 5"
        stroke="#78E64B"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      {/* Middle beam — shorter, slightly inset */}
      <path
        d="M4.5 10 C6 7.5 8.5 8.5 9.5 10 L15.5 10"
        stroke="#78E64B"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      {/* Bottom beam — full width, curved left start */}
      <path
        d="M1.5 15 C3 17.5 5.5 16.5 6.5 15 L18.5 15"
        stroke="#78E64B"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
