export default function LogoMark({
  size = 32,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="tb-violet" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8B7BFF" />
          <stop offset="1" stopColor="#5B46FF" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#tb-violet)" />
      <line x1="18" y1="33" x2="18" y2="47" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity="0.92" />
      <rect x="14" y="36" width="8" height="8" rx="2" fill="#fff" opacity="0.92" />
      <line x1="32" y1="24" x2="32" y2="47" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity="0.92" />
      <rect x="28" y="27" width="8" height="17" rx="2" fill="#fff" opacity="0.92" />
      <line x1="46" y1="14" x2="46" y2="47" stroke="#22D39A" strokeWidth="2" strokeLinecap="round" />
      <rect x="42" y="17" width="8" height="27" rx="2" fill="#22D39A" />
    </svg>
  );
}
