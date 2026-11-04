export default function VerifiedBadge({
  size = 'normal',
}: {
  size?: 'small' | 'normal' | 'large';
}) {
  const sizes = {
    small: {
      wrapper: 'h-4 w-4',
      icon: 10,
    },
    normal: {
      wrapper: 'h-5 w-5',
      icon: 12,
    },
    large: {
      wrapper: 'h-6 w-6',
      icon: 14,
    },
  };

  const current = sizes[size];

  return (
    <span
      role="img"
      className={`inline-flex ${current.wrapper} shrink-0 items-center justify-center rounded-full bg-[#ff78b9] shadow-[0_0_12px_rgba(255,120,185,0.25)]`}
      title="Conta verificada"
      aria-label="Conta verificada"
    >
      <svg
        width={current.icon}
        height={current.icon}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M5 12.5L9.2 16.5L19 7"
          stroke="#180d15"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
