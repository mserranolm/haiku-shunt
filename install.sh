#!/usr/bin/env bash
# One-line install for Claude Code + Cursor:
#   curl -fsSL https://raw.githubusercontent.com/mserranolm/haiku-shunt/main/install.sh | bash
set -euo pipefail

REPO_URL="${HAIKU_SHUNT_REPO:-https://github.com/mserranolm/haiku-shunt.git}"
INSTALL_DIR="${HAIKU_SHUNT_HOME:-$HOME/.haiku-shunt}"
BRANCH="${HAIKU_SHUNT_BRANCH:-main}"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "error: '$1' is required" >&2
    exit 1
  }
}

need git
need node

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "error: Node.js >= 18 required (found $(node -v))" >&2
  exit 1
fi

echo "==> Installing haiku-shunt into $INSTALL_DIR"

if [ -d "$INSTALL_DIR/.git" ]; then
  git -C "$INSTALL_DIR" fetch --depth 1 origin "$BRANCH"
  git -C "$INSTALL_DIR" checkout "$BRANCH"
  git -C "$INSTALL_DIR" pull --ff-only origin "$BRANCH" || true
else
  rm -rf "$INSTALL_DIR"
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi

node "$INSTALL_DIR/plugins/haiku-shunt/bin/haiku-shunt.js" install --all

# PATH hint
case ":$PATH:" in
  *":$HOME/.local/bin:"*) ;;
  *)
    echo ""
    echo "Add to your shell profile:"
    echo '  export PATH="$HOME/.local/bin:$PATH"'
    ;;
esac

echo ""
echo "Done. Next:"
echo "  haiku-shunt doctor     # uses your Claude Code login; export ANTHROPIC_API_KEY only to force the API"
echo ""
echo "Claude Code (marketplace plugin):"
echo "  claude plugin marketplace add mserranolm/haiku-shunt"
echo "  claude plugin install haiku-shunt@haiku-shunt"
echo ""
echo "Cursor: Developer: Reload Window → Customize → Plugins → confirm haiku-shunt"
