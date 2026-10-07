#!/data/data/com.termux/files/usr/bin/sh
# D3 — أوامر curl للقراءة فقط (لا كتابة). الاستخدام:
#   export API_URL=https://<render-host>/api/v1
#   export TOKEN=<access token من تسجيل الدخول>
#   sh scripts/e2e-curl-readonly.sh            # كل الفحوص
#   sh scripts/e2e-curl-readonly.sh fax <id>   # وجهات فاكس واحد
: "${API_URL:?عيّن API_URL}"
: "${TOKEN:?عيّن TOKEN}"
H="Authorization: Bearer $TOKEN"
g() { echo; echo "── GET $1"; curl -sS -H "$H" "$API_URL$1"; echo; }

if [ "$1" = "fax" ] && [ -n "$2" ]; then
  g "/faxes/$2"
  g "/faxes/$2/destinations"
  exit 0
fi

g /faxes/operations-center
g /deliveries/available-trips
g /deliveries/pending-assignment
g /faxes/traders/list
g /faxes/warehouses/list
g /accounting/integrity-check
