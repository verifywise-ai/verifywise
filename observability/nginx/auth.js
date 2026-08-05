// njs (nginx JavaScript) module — verifies the RS256 push token a VerifyWise
// deployment sends before letting the OTLP payload reach the collector.
//
// Contract:
//   * Deployments send `Authorization: Bearer <jwt>` on every OTLP push.
//   * The JWT is RS256 (RSASSA-PKCS1-v1_5 + SHA-256). The VerifyWise backend
//     (./Servers, holding OBSERVABILITY_PRIVATE_KEY) signs it when a super admin
//     clicks "Generate token". This ingress holds only the matching PUBLIC key,
//     so it can verify but can never mint a token.
//   * Any signature / format / algorithm / expiry failure → 401. On success we
//     hand the request off to the internal upstream (see nginx.conf).
//
// Why asymmetric: the internet-facing monitoring VM must never hold a key that
// can forge tokens. It gets only the public (verify-only) key; the private
// signing key stays on the VerifyWise backend. If this host is compromised, an
// attacker still cannot mint tokens.
//
// Revocation: give tokens an `exp` claim so they age out, and/or rotate the
// keypair + re-issue tokens. See observability/README.md.

import fs from "fs";

// Path to the PEM-encoded RSA public key (SPKI / "BEGIN PUBLIC KEY"). Mounted
// into the container by docker-compose.observability.yml.
var PUBLIC_KEY_PATH =
    process.env.OBSERVABILITY_PUBLIC_KEY_PATH ||
    "/etc/nginx/keys/observability-public.pem";

// Imported CryptoKey promise, memoised across requests (import once per worker).
var importedKey = null;

function b64urlToBuffer(input) {
    // JWT base64url → base64 → Buffer. njs' Buffer supports "base64".
    var pad = 4 - (input.length % 4);
    if (pad !== 4) input += "=".repeat(pad);
    return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function pemToDer(pem) {
    // Strip the PEM armour and decode the base64 body to DER bytes.
    var body = pem
        .replace(/-----BEGIN [^-]+-----/, "")
        .replace(/-----END [^-]+-----/, "")
        .replace(/\s+/g, "");
    return Buffer.from(body, "base64");
}

function getPublicKey() {
    if (importedKey) return importedKey;
    var pem = fs.readFileSync(PUBLIC_KEY_PATH); // throws if missing → 500 below
    importedKey = crypto.subtle.importKey(
        "spki",
        pemToDer(pem.toString("utf8")),
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
    );
    return importedKey;
}

async function verify(r) {
    var header = r.headersIn["Authorization"] || "";
    if (!header.startsWith("Bearer ")) {
        r.return(401, "missing bearer token\n");
        return;
    }
    var token = header.slice(7).trim();

    var parts = token.split(".");
    if (parts.length !== 3) {
        r.return(401, "malformed token\n");
        return;
    }

    // Reject anything that isn't RS256 — algorithm-confusion defence.
    var headerJson;
    try {
        headerJson = JSON.parse(b64urlToBuffer(parts[0]).toString("utf8"));
    } catch (e) {
        r.return(401, "malformed token header\n");
        return;
    }
    if (headerJson.alg !== "RS256" || headerJson.typ !== "JWT") {
        r.return(401, "unsupported token algorithm\n");
        return;
    }

    var key;
    try {
        key = await getPublicKey();
    } catch (e) {
        r.error("cannot load observability public key: " + e.message);
        r.return(500, "server misconfigured\n");
        return;
    }

    var signature;
    try {
        signature = b64urlToBuffer(parts[2]);
    } catch (e) {
        r.return(401, "malformed token signature\n");
        return;
    }

    var valid;
    try {
        valid = await crypto.subtle.verify(
            { name: "RSASSA-PKCS1-v1_5" },
            key,
            signature,
            Buffer.from(parts[0] + "." + parts[1]),
        );
    } catch (e) {
        r.error("token verify error: " + e.message);
        r.return(401, "invalid token signature\n");
        return;
    }
    if (!valid) {
        r.return(401, "invalid token signature\n");
        return;
    }

    // Signature is valid — enforce expiry if the token carries one.
    var payload;
    try {
        payload = JSON.parse(b64urlToBuffer(parts[1]).toString("utf8"));
    } catch (e) {
        r.return(401, "malformed token payload\n");
        return;
    }
    if (payload.exp !== undefined) {
        var now = Math.floor(Date.now() / 1000);
        if (now >= Number(payload.exp)) {
            r.return(401, "token expired\n");
            return;
        }
    }

    // Forward to the internal collector without re-issuing the request externally.
    r.internalRedirect("@collector");
}

export default { verify };
