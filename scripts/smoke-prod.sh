#!/usr/bin/env bash
# Smoke test для production deploy (school-management-mu-one.vercel.app)
# Авторизуется через NextAuth v5 credentials и прогоняет ключевые API.
set -uo pipefail

BASE="https://school-management-mu-one.vercel.app"
EMAIL="admin@school.kz"
PASS="admin123"
JAR="$(mktemp /tmp/smoke-cookies.XXXXXX)"
trap 'rm -f "$JAR"' EXIT

echo "=== 1. Health checks (анонимно) ==="
for path in "/" "/login" "/services" "/students" "/groups" "/schedule"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  echo "  $path → $code"
done

echo ""
echo "=== 2. NextAuth login ==="
CSRF_RAW=$(curl -s -c "$JAR" "$BASE/api/auth/csrf")
CSRF_TOKEN=$(echo "$CSRF_RAW" | sed -n 's/.*"csrfToken":"\([^"]*\)".*/\1/p')
echo "  csrf: ${CSRF_TOKEN:0:20}..."

LOGIN_RESP=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -c "$JAR" -L \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "csrfToken=$CSRF_TOKEN" \
  --data-urlencode "email=$EMAIL" \
  --data-urlencode "password=$PASS" \
  --data-urlencode "callbackUrl=$BASE/" \
  --data-urlencode "redirect=false" \
  "$BASE/api/auth/callback/credentials")
echo "  login HTTP: $LOGIN_RESP"

if ! grep -q "authjs.session-token\|next-auth.session-token" "$JAR"; then
  echo "  ❌ session cookie не получен — авторизация не прошла"
  cat "$JAR"
  exit 1
fi
echo "  ✓ session cookie получен"

echo ""
echo "=== 3. API: /api/services ==="
SVC_JSON=$(curl -s -b "$JAR" "$BASE/api/services")
SVC_COUNT=$(echo "$SVC_JSON" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "ERR")
echo "  кол-во ServiceType: $SVC_COUNT"
echo "$SVC_JSON" | python3 -c "import sys,json; [print(f'   - {s[\"code\"]}: {s[\"name\"]} ({s[\"kind\"]})') for s in json.load(sys.stdin)]" 2>/dev/null || echo "$SVC_JSON" | head -c 200

echo ""
echo "=== 4. API: /api/students (первые 3) ==="
STU_JSON=$(curl -s -b "$JAR" "$BASE/api/students")
STU_COUNT=$(echo "$STU_JSON" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "ERR")
echo "  всего учеников: $STU_COUNT"
echo "$STU_JSON" | python3 -c "
import sys,json
data = json.load(sys.stdin)
for s in data[:3]:
    print(f'   #{s.get(\"studentNumber\")} {s[\"lastName\"]} {s[\"firstName\"]} (hourlyRate={s[\"hourlyRate\"]})')
" 2>/dev/null

echo ""
echo "=== 5. API: /api/students/<first>/prices ==="
FIRST_ID=$(echo "$STU_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
PRICES_JSON=$(curl -s -b "$JAR" "$BASE/api/students/$FIRST_ID/prices")
echo "$PRICES_JSON" | python3 -c "
import sys,json
data = json.load(sys.stdin)
print(f'   кол-во цен у ученика: {len(data)}')
for p in data:
    print(f'   - {p[\"serviceType\"][\"name\"]}: {p[\"price\"]} ₸')
" 2>/dev/null

echo ""
echo "=== 6. API: /api/groups (распределение по типам) ==="
GRP_JSON=$(curl -s -b "$JAR" "$BASE/api/groups")
echo "$GRP_JSON" | python3 -c "
import sys,json
from collections import Counter
data = json.load(sys.stdin)
c = Counter(g.get('groupType','?') for g in data)
for k,v in c.items(): print(f'   {k}: {v}')
pairs = [g for g in data if g.get('groupType')=='PAIR']
if pairs:
    print(f'   первая пара: {pairs[0].get(\"displayName\") or pairs[0].get(\"name\") or \"—\"}')
" 2>/dev/null

echo ""
echo "=== 7. API: /api/reports/billing (текущая неделя) ==="
WEEK=$(python3 -c "
from datetime import date, timedelta
d = date.today()
d -= timedelta(days=d.weekday())
print(d.isoformat())
")
BILL_JSON=$(curl -s -b "$JAR" "$BASE/api/reports/billing?weekStart=$WEEK")
echo "$BILL_JSON" | python3 -c "
import sys,json
data = json.load(sys.stdin)
print(f'   weekStart={\"'$WEEK'\"}, entries={len(data)}')
if data:
    e = data[0]
    print(f'   образец: #{e.get(\"studentNumber\")} {e[\"studentName\"]} часов={e[\"totalHours\"]} сумма={e[\"totalAmount\"]} ₸')
    if e.get('byService'):
        for b in e['byService']:
            print(f'     · {b[\"serviceName\"]}: {b[\"hours\"]} ч = {b[\"amount\"]} ₸')
" 2>/dev/null

echo ""
echo "=== 8. API: /api/reports/salary (текущая неделя) ==="
SAL_JSON=$(curl -s -b "$JAR" "$BASE/api/reports/salary?weekStart=$WEEK")
echo "$SAL_JSON" | python3 -c "
import sys,json
data = json.load(sys.stdin)
print(f'   учителей с ЗП: {len(data)}')
if data:
    e = data[0]
    print(f'   образец: {e[\"teacherName\"]} инд={e[\"individualHours\"]}ч пары={e.get(\"pairHours\",0)}ч груп={e[\"groupHours\"]}ч → {e[\"total\"]} ₸')
" 2>/dev/null

echo ""
echo "=== ✓ smoke test ✓ ==="
