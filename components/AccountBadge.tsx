import OfficialBadge from '@/app/components/OfficialBadge';
import VerifiedBadge from '@/app/components/VerifiedBadge';

export type AccountBadgeFlags = {
  verified?: boolean | null;
  is_official?: boolean | null;
};

export default function AccountBadge({ account, size = 'small' }: {
  account?: AccountBadgeFlags | null;
  size?: 'small' | 'normal' | 'large';
}) {
  if (!account?.is_official && !account?.verified) return null;
  return (
    <span className="ml-1 inline-flex shrink-0 align-middle">
      {account.is_official ? <OfficialBadge size={size} /> : <VerifiedBadge size={size} />}
    </span>
  );
}
