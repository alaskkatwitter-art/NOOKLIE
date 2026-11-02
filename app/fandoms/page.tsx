import FandomManager from '@/components/FandomManager';
import { Suspense } from 'react';
import FandomsContent from './FandomsContent';

export default function FandomsPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#100b12] text-white">
          <div className="mx-auto flex min-h-screen max-w-7xl items-center justify-center px-5">
            <p className="text-sm text-white/40">Carregando fandoms...</p>
          </div>
        </main>
      }
    >
      <><FandomManager/><FandomsContent /></>
    </Suspense>
  );
}
