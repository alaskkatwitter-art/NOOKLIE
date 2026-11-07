'use client';

import { useEffect, useId, useRef, useState } from 'react';
import FormattedSynopsis from './FormattedSynopsis';

export default function StorySynopsis({ text }: { text: string }) {
  const id = useId();
  const preview = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [clipped, setClipped] = useState(false);

  useEffect(() => {
    const frame = preview.current;
    const body = content.current;
    if (!frame || !body || expanded) return;

    function measure() {
      if (frame) setClipped(frame.scrollHeight > frame.clientHeight);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    observer.observe(body);
    measure();
    return () => observer.disconnect();
  }, [expanded]);

  return (
    <>
      <div
        id={id}
        ref={preview}
        className={`relative max-w-prose text-sm leading-7 text-white/80 sm:text-base ${expanded ? '' : 'max-h-42 overflow-hidden sm:max-h-49'}`}
      >
        <div ref={content}>
          <FormattedSynopsis text={text} />
        </div>
        {clipped && !expanded && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#1c111f] to-transparent" />
        )}
      </div>
      {(clipped || expanded) && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={id}
          className="mt-1 min-h-10 text-sm font-semibold text-pink-200 underline-offset-4 hover:underline"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Mostrar menos' : 'Ler mais'}
        </button>
      )}
    </>
  );
}
