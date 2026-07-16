'use client';
import { useNearWallet } from 'near-connect-hooks';
import { StakingConsole } from '@/components/staking-console';
import { NetworkId } from '@/config';

export default function Home() {
  const { signedAccountId, loading, signIn } = useNearWallet();

  if (loading) {
    return (
      <main className="wrap connector-loading" aria-busy="true">
        <section className="connector-loading-panel" aria-labelledby="connector-loading-title">
          <div className="connector-loading-signal" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p className="connector-loading-label">NEAR Stake</p>
          <h1 id="connector-loading-title">Welcome!</h1>
          <p className="connector-loading-copy" role="status">
            The page is loading...
          </p>
        </section>
      </main>
    );
  }

  return (
    <>
      <main className="wrap">
        {signedAccountId ? (
          <StakingConsole />
        ) : (
          <>
            <section className="hero">
              <div className="hero-copy">
                <span className="tag">NEAR Protocol · {NetworkId}</span>
                <h1>
                  Stake <em>NEAR</em>
                  <br />
                  earn rewards
                </h1>
                <p>
                  Delegate your tokens to a validator and earn staking rewards
                  every epoch. Non-custodial: your keys, your NEAR.
                </p>
                <button className="btn hero-cta" onClick={() => signIn()}>
                  Connect wallet
                </button>
              </div>
              <img
                className="hero-visual"
                src="https://picsum.photos/seed/near-stake-rack/800/1000?grayscale"
                alt="Validator server infrastructure"
                width={800}
                height={1000}
              />
            </section>

            <section className="steps">
              <h2>How it works</h2>
              <div className="step">
                <span className="num">01</span>
                <div>
                  <h3>Connect your wallet</h3>
                  <p>Sign in with any NEAR wallet. No account creation needed.</p>
                </div>
              </div>
              <div className="step">
                <span className="num">02</span>
                <div>
                  <h3>Choose a validator</h3>
                  <p>
                    Pick any NEAR validator, Meta Pool or LiNEAR. Tokens stay
                    under your control at all times.
                  </p>
                </div>
              </div>
              <div className="step">
                <span className="num">03</span>
                <div>
                  <h3>Earn every epoch</h3>
                  <p>
                    Rewards are distributed roughly every 12 hours and compound
                    into your stake.
                  </p>
                </div>
              </div>
            </section>
          </>
        )}
      </main>

      <footer className="footer">
        <div className="wrap footer-inner">
          <span>NEAR STAKE © 2026</span>
          <span>BUILT ON NEAR</span>
        </div>
      </footer>
    </>
  );
}
