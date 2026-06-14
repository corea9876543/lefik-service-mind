#!/usr/bin/env bash
# 한 방에: 백엔드 실행 + cloudflared 공개 터널 + 다음 단계 출력.
# 작업하는 본인 컴퓨터에서 실행하세요(여기 sandbox 말고).
#
# 사전 준비(둘 다 한 번만):
#   export ANTHROPIC_API_KEY=sk-ant-...           # 질문 기능용 (모니터링만이면 아무 값이나)
#   cloudflared 설치:  mac) brew install cloudflared
#
# 실행:  cd backend && ./start-local.sh
set -euo pipefail
cd "$(dirname "$0")"

if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "❌ ANTHROPIC_API_KEY 없음.  먼저:  export ANTHROPIC_API_KEY=sk-ant-..."
  echo "   (모니터링만 쓸 거면 아무 문자열이나 넣어도 됩니다. 질문 기능엔 진짜 키 필요)"
  exit 1
fi
if ! command -v cloudflared >/dev/null 2>&1; then
  echo "❌ cloudflared 없음. 설치:"
  echo "   mac:   brew install cloudflared"
  echo "   기타:  https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
  exit 1
fi

WRITE_KEY="${STATUS_WRITE_KEY:-$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')}"

[ -d node_modules ] || { echo "📦 npm install..."; npm install; }

echo "🚀 백엔드 시작 (:8787)..."
ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" STATUS_WRITE_KEY="$WRITE_KEY" node ask-server.mjs &
SRV=$!
TUN_LOG="$(mktemp)"
cleanup() { kill "$SRV" "${TUN:-}" 2>/dev/null || true; }
trap cleanup EXIT
sleep 1

echo "⏳ cloudflared 터널 여는 중..."
cloudflared tunnel --url http://localhost:8787 >"$TUN_LOG" 2>&1 &
TUN=$!

URL=""
for _ in $(seq 1 30); do
  URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUN_LOG" | head -1 || true)"
  [ -n "$URL" ] && break
  sleep 1
done
[ -z "$URL" ] && { echo "터널 URL을 못 찾았어요. 로그:"; cat "$TUN_LOG"; exit 1; }

cat <<EOF

────────────────────────────────────────────────────────
✅ 백엔드 라이브:  $URL
────────────────────────────────────────────────────────

다음 2가지만 하면 안경 실시간 모니터 ON:

1) 글래스 앱에 백엔드 연결 (레포 루트에서, 다른 터미널):
     ./set-backend.sh "$URL"
   → 그리고 저(Claude)에게 "머지해줘" 라고 하면 자동 재배포

2) 실제 작업하는 Claude Code 셸에서 (이 창 말고):
     export STATUS_ENDPOINT="$URL/status"
     export STATUS_WRITE_KEY="$WRITE_KEY"
   → 이제 그 세션의 진행상황이 매 턴 안경에 뜸

⚠️ 이 창은 켜둔 채로 두세요. 닫으면 터널·백엔드 종료됩니다. (종료: Ctrl+C)
EOF

wait
