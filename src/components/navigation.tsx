import Image from 'next/image';
import Link from 'next/link';
import { useNearWallet } from 'near-connect-hooks';

import NearLogo from '../../public/near-logo.svg';

export const Navigation = () => {
  const { signedAccountId, loading, signIn, signOut } = useNearWallet();

  const label = loading
    ? 'Loading…'
    : signedAccountId
    ? `Logout ${signedAccountId}`
    : 'Connect wallet';

  return (
    <nav className="nav">
      <div className="wrap nav-inner">
        <Link href="/" className="brand">
          <Image priority src={NearLogo} alt="NEAR" width={26} height={26} />
          Stakingaitor
        </Link>
        <button
          className={signedAccountId ? 'btn btn-ghost' : 'btn'}
          onClick={() => (signedAccountId ? signOut() : signIn())}
        >
          {label}
        </button>
      </div>
    </nav>
  );
};
