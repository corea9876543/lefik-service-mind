#!/usr/bin/env bash
# 글래스 앱(glasses/app.js)의 CONFIG.backend 를 주어진 백엔드 URL로 설정.
# 사용:  ./set-backend.sh https://xxxx.trycloudflare.com
set -euo pipefail
cd "$(dirname "$0")"

url="${1:-}"
[ -z "$url" ] && { echo "usage: ./set-backend.sh <backend-url>"; exit 1; }
url="${url%/}"   # 끝 슬래시 제거

python3 - "$url" <<'PY'
import re, sys
url = sys.argv[1]
p = 'glasses/app.js'
s = open(p).read()
s2, n = re.subn(r"(backend:\s*)'[^']*'", lambda m: m.group(1) + "'" + url + "'", s, count=1)
if n == 0:
    sys.exit("CONFIG.backend 라인을 못 찾았어요 (app.js 수동 확인 필요)")
open(p, 'w').write(s2)
print("✅ CONFIG.backend =", url)
PY

echo "이제 저(Claude)에게 '머지해줘' 라고 하면 라이브 사이트에 반영됩니다."
