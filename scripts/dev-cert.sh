#!/usr/bin/env bash
# Generate a locally-trusted certificate for the dev server, so the app runs over HTTPS on the LAN.
#
# Why: navigator.geolocation only works in a secure context. Browsers exempt localhost, but NOT a LAN
# hostname or IP over plain http — so the GPS button in the location dialog cannot be tested on a phone
# without this. Everything else in the app works fine over http.
#
# Creates its own tiny CA and signs a server certificate with it. The CA is what you install on the
# phone (once); the server cert is what Vite serves. Nothing is added to the system keychain.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.cert"
HOST="$(scutil --get LocalHostName 2>/dev/null || hostname -s).local"
IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
DAYS=825 # the longest a leaf certificate may be valid and still be accepted by Apple platforms

mkdir -p "$DIR"
cd "$DIR"

# --- the CA: this is the file you install on the phone -------------------------------------------
if [ ! -f rootCA-key.pem ]; then
	openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes \
		-keyout rootCA-key.pem -out rootCA.pem \
		-subj "/CN=eclipse-2026 dev CA" \
		-addext "basicConstraints=critical,CA:TRUE" \
		-addext "keyUsage=critical,keyCertSign,cRLSign" 2>/dev/null
	echo "created a new dev CA"
fi

# --- the server certificate, valid for every name the dev server answers to ----------------------
ALT="DNS:${HOST},DNS:localhost,IP:127.0.0.1,IP:::1"
[ -n "$IP" ] && ALT="${ALT},IP:${IP}"

openssl req -newkey rsa:2048 -sha256 -nodes -keyout dev-key.pem -out dev.csr \
	-subj "/CN=${HOST}" 2>/dev/null
openssl x509 -req -in dev.csr -CA rootCA.pem -CAkey rootCA-key.pem -CAcreateserial \
	-out dev.pem -days "$DAYS" -sha256 \
	-extfile <(printf "subjectAltName=%s\nextendedKeyUsage=serverAuth\n" "$ALT") 2>/dev/null
rm -f dev.csr

echo "certificate covers: ${ALT}"
echo
echo "next: install .cert/rootCA.pem on the phone, then run  npm run dev:https"
