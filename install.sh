#!/bin/bash
# claude-code-fleet installer — one command: check deps, put the cc-* commands on PATH, write config.
#
#   ./install.sh [BIN_DIR]      # BIN_DIR defaults to ~/.local/bin
#
# This only DISTRIBUTES the scripts. The real runtime deps (bash, python3, tmux, git, the `claude`
# CLI — and macOS launchd for the always-on backbone) are NOT installed here; it just checks for them.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
BIN_DIR="${1:-$HOME/.local/bin}"

echo "claude-code-fleet installer"
echo "  install dir : $HERE"
echo "  link into   : $BIN_DIR"
echo

# 1. dependency check
miss=0
for dep in bash python3 tmux git claude; do
    if command -v "$dep" >/dev/null 2>&1; then
        echo "  ok       $dep"
    else
        echo "  MISSING  $dep"; miss=1
    fi
done
[ "$miss" = 0 ] || echo "  -> install the MISSING dep(s) above before running the fleet."
echo

# 2. symlink the cc-* commands + tmux helpers onto PATH (skip docs/templates/workflow files)
mkdir -p "$BIN_DIR"
linked=0
for f in "$HERE"/bin/*; do
    base="$(basename "$f")"
    case "$base" in
        *.prompt|*.sample|*.js) continue ;;   # not CLI commands
    esac
    [ -f "$f" ] || continue
    ln -sf "$f" "$BIN_DIR/$base"
    linked=$((linked + 1))
done
echo "  linked $linked commands -> $BIN_DIR"
case ":$PATH:" in
    *":$BIN_DIR:"*) : ;;
    *) echo "  NOTE: $BIN_DIR is not on your PATH — add:  export PATH=\"$BIN_DIR:\$PATH\"" ;;
esac
echo

# 3. config: create claude-code-fleet.env from the example if absent, and pin CC_HOME so
#    plugin/persona resolution is correct no matter how the commands are installed.
ENV_FILE="$HERE/claude-code-fleet.env"
if [ -f "$ENV_FILE" ]; then
    echo "  config exists: $ENV_FILE (left as-is)"
else
    cp "$HERE/claude-code-fleet.env.example" "$ENV_FILE"
    printf '\n# pinned by install.sh so the cc-* commands find plugins/ + personas/\nexport CC_HOME="%s"\n' "$HERE" >> "$ENV_FILE"
    echo "  created config: $ENV_FILE"
fi
echo

cat <<EOF
Next:
  1) edit  $ENV_FILE   (set CC_REPO + CC_EXPECT_ACCT)
  2) source $ENV_FILE
  3) ta worker1 && cc-add worker1            # start a worker + supervise it
  4) install the supervisor backbone (launchd) or Claude crons — see README "Install"
EOF
