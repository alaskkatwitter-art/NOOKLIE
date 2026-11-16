export default function SantaHat() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 32 24"
      className="pointer-events-none absolute -top-3 -right-2 h-5 w-6 rotate-12 overflow-visible"
    >
      <path d="M5 12 Q11 -2 21 4 Q27 7 27 13 L22 15 Q18 8 10 14 Z" fill="#e52542" stroke="#a50d28" strokeWidth="1" />
      <path d="M4 12 Q15 9 24 13 L24 18 Q14 15 4 17 Z" fill="#fff8f9" />
      <circle cx="27" cy="15" r="4" fill="#fff8f9" />
    </svg>
  );
}
