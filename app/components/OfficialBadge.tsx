export default function OfficialBadge({
  size = 'normal',
}: {
  size?: 'small' | 'normal' | 'large';
}) {
  const sizes = {
    small: 'h-4 w-4',
    normal: 'h-5 w-5',
    large: 'h-6 w-6',
  };

  return (
    <span
      className={`inline-flex ${sizes[size]} shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#8be8ff] to-[#85b8ff] text-[#10212a] shadow-[0_0_12px_rgba(139,232,255,0.3)]`}
      title="Conta oficial do Nooklie"
      aria-label="Conta oficial do Nooklie"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-[70%] w-[70%]"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="m12 2 2.55 5.17 5.7.83-4.13 4.02.98 5.68L12 15.02l-5.1 2.68.98-5.68L3.75 8l5.7-.83L12 2Z" />
      </svg>
    </span>
  );
}
