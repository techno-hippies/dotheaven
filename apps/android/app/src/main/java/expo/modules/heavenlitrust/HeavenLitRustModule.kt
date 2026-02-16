package expo.modules.heavenlitrust

class HeavenLitRustModule {
  companion object {
    @Volatile
    private var loadError: String? = null

    init {
      try {
        System.loadLibrary("heaven_lit_rust")
      } catch (t: Throwable) {
        loadError = t.message ?: t.javaClass.simpleName
      }
    }
  }

  private fun ensureLoaded() {
    val err = loadError
    if (err != null) {
      throw IllegalStateException("Rust library was not loaded (heaven_lit_rust). Cause: $err")
    }
  }

  fun healthcheck(): String {
    ensureLoaded()
    return nativeHealthcheck()
  }

  fun createEthWalletAuthData(privateKeyHex: String, nonce: String): String {
    ensureLoaded()
    return nativeCreateEthWalletAuthData(privateKeyHex, nonce)
  }

  fun testConnect(network: String, rpcUrl: String): String {
    ensureLoaded()
    return nativeTestConnect(network, rpcUrl)
  }

  fun mintPkpAndCreateAuthContext(network: String, rpcUrl: String, privateKeyHex: String): String {
    ensureLoaded()
    return nativeMintPkpAndCreateAuthContext(network, rpcUrl, privateKeyHex)
  }

  fun createAuthContextFromPasskeyCallback(
    network: String,
    rpcUrl: String,
    pkpPublicKey: String,
    authMethodType: String,
    authMethodId: String,
    accessToken: String,
    authConfigJson: String,
  ): String {
    ensureLoaded()
    return nativeCreateAuthContextFromPasskeyCallback(
      network,
      rpcUrl,
      pkpPublicKey,
      authMethodType,
      authMethodId,
      accessToken,
      authConfigJson,
    )
  }

  fun clearAuthContext(): String {
    ensureLoaded()
    return nativeClearAuthContext()
  }

  fun viewPKPsByAuthData(
    network: String,
    rpcUrl: String,
    authMethodType: String,
    authMethodId: String,
    limit: String,
    offset: String,
  ): String {
    ensureLoaded()
    return nativeViewPKPsByAuthData(network, rpcUrl, authMethodType, authMethodId, limit, offset)
  }

  fun executeJs(
    network: String,
    rpcUrl: String,
    code: String,
    ipfsId: String,
    jsParamsJson: String,
    useSingleNode: String,
  ): String {
    ensureLoaded()
    return nativeExecuteJs(network, rpcUrl, code, ipfsId, jsParamsJson, useSingleNode)
  }

  fun signMessage(network: String, rpcUrl: String, message: String, publicKey: String): String {
    ensureLoaded()
    return nativeSignMessage(network, rpcUrl, message, publicKey)
  }

  fun loadUpload(
    network: String,
    rpcUrl: String,
    uploadUrl: String,
    uploadToken: String,
    gatewayUrlFallback: String,
    payload: ByteArray,
    filePath: String,
    contentType: String,
    tagsJson: String,
  ): String {
    ensureLoaded()
    return nativeLoadUpload(
      network,
      rpcUrl,
      uploadUrl,
      uploadToken,
      gatewayUrlFallback,
      payload,
      filePath,
      contentType,
      tagsJson,
    )
  }

  fun loadEncryptUpload(
    network: String,
    rpcUrl: String,
    uploadUrl: String,
    uploadToken: String,
    gatewayUrlFallback: String,
    payload: ByteArray,
    contentId: String,
    contentDecryptCid: String,
    filePath: String,
    contentType: String,
    tagsJson: String,
  ): String {
    ensureLoaded()
    return nativeLoadEncryptUpload(
      network,
      rpcUrl,
      uploadUrl,
      uploadToken,
      gatewayUrlFallback,
      payload,
      contentId,
      contentDecryptCid,
      filePath,
      contentType,
      tagsJson,
    )
  }

  fun fetchAndDecryptContent(network: String, rpcUrl: String, paramsJson: String): String {
    ensureLoaded()
    return nativeFetchAndDecryptContent(network, rpcUrl, paramsJson)
  }

  private external fun nativeHealthcheck(): String
  private external fun nativeCreateEthWalletAuthData(privateKeyHex: String, nonce: String): String
  private external fun nativeTestConnect(network: String, rpcUrl: String): String
  private external fun nativeMintPkpAndCreateAuthContext(network: String, rpcUrl: String, privateKeyHex: String): String
  private external fun nativeCreateAuthContextFromPasskeyCallback(
    network: String,
    rpcUrl: String,
    pkpPublicKey: String,
    authMethodType: String,
    authMethodId: String,
    accessToken: String,
    authConfigJson: String,
  ): String
  private external fun nativeClearAuthContext(): String
  private external fun nativeViewPKPsByAuthData(
    network: String,
    rpcUrl: String,
    authMethodType: String,
    authMethodId: String,
    limit: String,
    offset: String,
  ): String
  private external fun nativeExecuteJs(
    network: String,
    rpcUrl: String,
    code: String,
    ipfsId: String,
    jsParamsJson: String,
    useSingleNode: String,
  ): String
  private external fun nativeSignMessage(
    network: String,
    rpcUrl: String,
    message: String,
    publicKey: String,
  ): String

  private external fun nativeLoadUpload(
    network: String,
    rpcUrl: String,
    uploadUrl: String,
    uploadToken: String,
    gatewayUrlFallback: String,
    payload: ByteArray,
    filePath: String,
    contentType: String,
    tagsJson: String,
  ): String

  private external fun nativeLoadEncryptUpload(
    network: String,
    rpcUrl: String,
    uploadUrl: String,
    uploadToken: String,
    gatewayUrlFallback: String,
    payload: ByteArray,
    contentId: String,
    contentDecryptCid: String,
    filePath: String,
    contentType: String,
    tagsJson: String,
  ): String
  private external fun nativeFetchAndDecryptContent(
    network: String,
    rpcUrl: String,
    paramsJson: String,
  ): String
}
