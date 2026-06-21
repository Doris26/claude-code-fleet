# Sandbox for the claude-code-fleet demo GIF. Sourced by demo/demo.tape; run from the repo root.
# (1) spins up a few stand-in worker sessions on an ISOLATED tmux socket (-L fleet) so the demo
#     never touches your real tmux; (2) builds a throwaway repo under /tmp with a worker commit that
#     CITES a fabricated backtest result. All setup output is suppressed so the recording is clean.
{
  # (1) a fleet of worker sessions (placeholders for `claude` panes — isolated socket, no quota used)
  tmux -L fleet kill-server 2>/dev/null
  for w in dag-momentum dag-meanrev dag-carry; do
    tmux -L fleet new-session -d -s "$w" 'sleep 99999'
  done
  # (2) a worker's repo + a commit that cites a (fabricated) backtest result
  rm -rf /tmp/ccf-demo /tmp/ccf-bin
  mkdir -p /tmp/ccf-demo/strategies/btc-momo /tmp/ccf-bin
  cp plugins/generic/verify-claim /tmp/ccf-bin/ && chmod +x /tmp/ccf-bin/verify-claim
  (
    cd /tmp/ccf-demo &&
    git init -q &&
    git config user.name fleet-worker &&
    git config user.email worker@example.com &&
    git config commit.gpgsign false &&
    printf '# BTC-momo -- performance\n\n| window | Sharpe | proof |\n|---|---|---|\n| 3yr OOS | 2.10 | backtest 9f253fc485d7579cb6d256acf9eb1584 |\n' > strategies/btc-momo/PERF_CARD.md &&
    git add -A &&
    git commit -q -m 'feat(btc-momo): 3yr OOS Sharpe 2.10 (backtest 9f253fc485d7579cb6d256acf9eb1584)'
  )
} >/dev/null 2>&1
cd /tmp/ccf-demo
export PATH="/tmp/ccf-bin:$PATH"
export CC_REPO=/tmp/ccf-demo
export PS1='claude-code-fleet:demo$ '
clear
