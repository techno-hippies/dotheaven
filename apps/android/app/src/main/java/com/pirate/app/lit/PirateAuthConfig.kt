package com.pirate.app.lit

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.temporal.ChronoUnit

object PirateAuthConfig {
  const val DEFAULT_AUTH_SERVICE_BASE_URL = "https://naga-dev-auth-service.getlit.dev"
  const val DEFAULT_PASSKEY_RP_ID = "dotheaven.org"
  const val DEFAULT_LIT_NETWORK = "naga-dev"
  const val DEFAULT_LIT_RPC_URL = "https://yellowstone-rpc.litprotocol.com"

  fun defaultAuthConfigJson(passkeyRpId: String): String {
    val expiration = Instant.now().plus(24, ChronoUnit.HOURS).toString()
    val resources = JSONArray()
      .put(JSONArray().put("lit-action-execution").put("*"))
      .put(JSONArray().put("pkp-signing").put("*"))
      .put(JSONArray().put("access-control-condition-decryption").put("*"))

    return JSONObject()
      .put("resources", resources)
      .put("expiration", expiration)
      .put("statement", "Execute Lit Actions and sign messages")
      .put("domain", passkeyRpId.trim().lowercase())
      .toString()
  }
}

