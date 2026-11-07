'use client';
import { useState } from 'react';
import NookPostComposer from './NookPostComposer';
export default function ShareNews({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false),
    [done, setDone] = useState(false);
  return (
    <div className="my-6">
      <button
        className="nook-primary"
        onClick={() => {
          setDone(false);
          setOpen(true);
        }}
      >
        Compartilhar no feed
      </button>
      {done && (
        <p role="status" className="mt-3 text-sm text-pink-200">
          Matéria compartilhada no seu feed.
        </p>
      )}
      <NookPostComposer
        key={String(open)}
        open={open}
        initialNewsSlug={slug}
        onClose={() => setOpen(false)}
        onPublished={() => setDone(true)}
      />
    </div>
  );
}
