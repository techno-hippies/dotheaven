import ExpoModulesCore
import Foundation

@_silgen_name("heaven_lit_rust_healthcheck")
private func heaven_lit_rust_healthcheck() -> UnsafeMutablePointer<CChar>?

@_silgen_name("heaven_lit_rust_create_eth_wallet_auth_data")
private func heaven_lit_rust_create_eth_wallet_auth_data(
  _ privateKeyHex: UnsafePointer<CChar>?,
  _ nonce: UnsafePointer<CChar>?
) -> UnsafeMutablePointer<CChar>?

@_silgen_name("heaven_lit_rust_test_connect")
private func heaven_lit_rust_test_connect(
  _ network: UnsafePointer<CChar>?,
  _ rpcUrl: UnsafePointer<CChar>?
) -> UnsafeMutablePointer<CChar>?

@_silgen_name("heaven_lit_rust_mint_pkp_and_create_auth_context")
private func heaven_lit_rust_mint_pkp_and_create_auth_context(
  _ network: UnsafePointer<CChar>?,
  _ rpcUrl: UnsafePointer<CChar>?,
  _ privateKeyHex: UnsafePointer<CChar>?
) -> UnsafeMutablePointer<CChar>?

@_silgen_name("heaven_lit_rust_create_auth_context_from_passkey_callback")
private func heaven_lit_rust_create_auth_context_from_passkey_callback(
  _ network: UnsafePointer<CChar>?,
  _ rpcUrl: UnsafePointer<CChar>?,
  _ pkpPublicKey: UnsafePointer<CChar>?,
  _ authMethodType: UnsafePointer<CChar>?,
  _ authMethodId: UnsafePointer<CChar>?,
  _ accessToken: UnsafePointer<CChar>?,
  _ authConfigJson: UnsafePointer<CChar>?
) -> UnsafeMutablePointer<CChar>?

@_silgen_name("heaven_lit_rust_clear_auth_context")
private func heaven_lit_rust_clear_auth_context() -> UnsafeMutablePointer<CChar>?

@_silgen_name("heaven_lit_rust_view_pkps_by_auth_data")
private func heaven_lit_rust_view_pkps_by_auth_data(
  _ network: UnsafePointer<CChar>?,
  _ rpcUrl: UnsafePointer<CChar>?,
  _ authMethodType: UnsafePointer<CChar>?,
  _ authMethodId: UnsafePointer<CChar>?,
  _ limit: UnsafePointer<CChar>?,
  _ offset: UnsafePointer<CChar>?
) -> UnsafeMutablePointer<CChar>?

@_silgen_name("heaven_lit_rust_execute_js")
private func heaven_lit_rust_execute_js(
  _ network: UnsafePointer<CChar>?,
  _ rpcUrl: UnsafePointer<CChar>?,
  _ code: UnsafePointer<CChar>?,
  _ ipfsId: UnsafePointer<CChar>?,
  _ jsParamsJson: UnsafePointer<CChar>?,
  _ useSingleNode: UnsafePointer<CChar>?
) -> UnsafeMutablePointer<CChar>?

@_silgen_name("heaven_lit_rust_sign_message")
private func heaven_lit_rust_sign_message(
  _ network: UnsafePointer<CChar>?,
  _ rpcUrl: UnsafePointer<CChar>?,
  _ message: UnsafePointer<CChar>?,
  _ publicKey: UnsafePointer<CChar>?
) -> UnsafeMutablePointer<CChar>?

@_silgen_name("heaven_lit_rust_fetch_and_decrypt_content")
private func heaven_lit_rust_fetch_and_decrypt_content(
  _ network: UnsafePointer<CChar>?,
  _ rpcUrl: UnsafePointer<CChar>?,
  _ paramsJson: UnsafePointer<CChar>?
) -> UnsafeMutablePointer<CChar>?

@_silgen_name("heaven_lit_rust_free_string")
private func heaven_lit_rust_free_string(_ ptr: UnsafeMutablePointer<CChar>?)

public class HeavenLitRustModule: Module {
  public func definition() -> ModuleDefinition {
    Name("HeavenLitRust")

    AsyncFunction("healthcheck") { () throws -> String in
      return try self.callNoArg(heaven_lit_rust_healthcheck)
    }

    AsyncFunction("createEthWalletAuthData") { (privateKeyHex: String, nonce: String) throws -> String in
      return try privateKeyHex.withCString { privateKeyPtr in
        try nonce.withCString { noncePtr in
          try self.callTwoArgs(
            heaven_lit_rust_create_eth_wallet_auth_data,
            arg1: privateKeyPtr,
            arg2: noncePtr
          )
        }
      }
    }

    AsyncFunction("testConnect") { (network: String, rpcUrl: String) throws -> String in
      return try network.withCString { networkPtr in
        try rpcUrl.withCString { rpcUrlPtr in
          try self.callTwoArgs(
            heaven_lit_rust_test_connect,
            arg1: networkPtr,
            arg2: rpcUrlPtr
          )
        }
      }
    }

    AsyncFunction("mintPkpAndCreateAuthContext") { (network: String, rpcUrl: String, privateKeyHex: String) throws -> String in
      return try network.withCString { networkPtr in
        try rpcUrl.withCString { rpcUrlPtr in
          try privateKeyHex.withCString { privateKeyPtr in
            guard let output = heaven_lit_rust_mint_pkp_and_create_auth_context(
              networkPtr,
              rpcUrlPtr,
              privateKeyPtr
            ) else {
              throw GenericException("Rust bridge returned a null response")
            }
            defer { heaven_lit_rust_free_string(output) }
            return String(cString: output)
          }
        }
      }
    }

    AsyncFunction(
      "createAuthContextFromPasskeyCallback",
    ) { (network: String, rpcUrl: String, pkpPublicKey: String, authMethodType: Int, authMethodId: String, accessToken: String, authConfigJson: String) throws -> String in
      let authMethodTypeString = String(authMethodType)
      return try network.withCString { networkPtr in
        try rpcUrl.withCString { rpcUrlPtr in
          try pkpPublicKey.withCString { pkpPublicKeyPtr in
            try authMethodTypeString.withCString { authMethodTypePtr in
              try authMethodId.withCString { authMethodIdPtr in
                try accessToken.withCString { accessTokenPtr in
                  try authConfigJson.withCString { authConfigPtr in
                    guard let output = heaven_lit_rust_create_auth_context_from_passkey_callback(
                      networkPtr,
                      rpcUrlPtr,
                      pkpPublicKeyPtr,
                      authMethodTypePtr,
                      authMethodIdPtr,
                      accessTokenPtr,
                      authConfigPtr
                    ) else {
                      throw GenericException("Rust bridge returned a null response")
                    }
                    defer { heaven_lit_rust_free_string(output) }
                    return String(cString: output)
                  }
                }
              }
            }
          }
        }
      }
    }

    AsyncFunction("clearAuthContext") { () throws -> String in
      return try self.callNoArg(heaven_lit_rust_clear_auth_context)
    }

    AsyncFunction("viewPKPsByAuthData") { (network: String, rpcUrl: String, authMethodType: Int, authMethodId: String, limit: Int, offset: Int) throws -> String in
      let authMethodTypeString = String(authMethodType)
      let limitString = String(limit)
      let offsetString = String(offset)
      return try network.withCString { networkPtr in
        try rpcUrl.withCString { rpcUrlPtr in
          try authMethodTypeString.withCString { authMethodTypePtr in
            try authMethodId.withCString { authMethodIdPtr in
              try limitString.withCString { limitPtr in
                try offsetString.withCString { offsetPtr in
                  guard let output = heaven_lit_rust_view_pkps_by_auth_data(
                    networkPtr,
                    rpcUrlPtr,
                    authMethodTypePtr,
                    authMethodIdPtr,
                    limitPtr,
                    offsetPtr
                  ) else {
                    throw GenericException("Rust bridge returned a null response")
                  }
                  defer { heaven_lit_rust_free_string(output) }
                  return String(cString: output)
                }
              }
            }
          }
        }
      }
    }

    AsyncFunction("executeJs") { (network: String, rpcUrl: String, code: String, ipfsId: String, jsParamsJson: String, useSingleNode: Bool) throws -> String in
      let useSingleNodeString = useSingleNode ? "1" : "0"
      return try network.withCString { networkPtr in
        try rpcUrl.withCString { rpcUrlPtr in
          try code.withCString { codePtr in
            try ipfsId.withCString { ipfsIdPtr in
              try jsParamsJson.withCString { jsParamsPtr in
                try useSingleNodeString.withCString { useSinglePtr in
                  guard let output = heaven_lit_rust_execute_js(
                    networkPtr,
                    rpcUrlPtr,
                    codePtr,
                    ipfsIdPtr,
                    jsParamsPtr,
                    useSinglePtr
                  ) else {
                    throw GenericException("Rust bridge returned a null response")
                  }
                  defer { heaven_lit_rust_free_string(output) }
                  return String(cString: output)
                }
              }
            }
          }
        }
      }
    }

    AsyncFunction("signMessage") { (network: String, rpcUrl: String, message: String, publicKey: String) throws -> String in
      return try network.withCString { networkPtr in
        try rpcUrl.withCString { rpcUrlPtr in
          try message.withCString { messagePtr in
            try publicKey.withCString { publicKeyPtr in
              guard let output = heaven_lit_rust_sign_message(networkPtr, rpcUrlPtr, messagePtr, publicKeyPtr) else {
                throw GenericException("Rust bridge returned a null response")
              }
              defer { heaven_lit_rust_free_string(output) }
              return String(cString: output)
            }
          }
        }
      }
    }

    AsyncFunction("fetchAndDecryptContent") { (network: String, rpcUrl: String, paramsJson: String) throws -> String in
      return try network.withCString { networkPtr in
        try rpcUrl.withCString { rpcUrlPtr in
          try paramsJson.withCString { paramsPtr in
            guard let output = heaven_lit_rust_fetch_and_decrypt_content(networkPtr, rpcUrlPtr, paramsPtr) else {
              throw GenericException("Rust bridge returned a null response")
            }
            defer { heaven_lit_rust_free_string(output) }
            return String(cString: output)
          }
        }
      }
    }

    AsyncFunction("nativeCreatePasskey") { (_ optionsJson: String) throws -> String in
      throw GenericException("nativeCreatePasskey is currently implemented on Android only in this PoC")
    }

    AsyncFunction("nativeGetPasskey") { (_ optionsJson: String) throws -> String in
      throw GenericException("nativeGetPasskey is currently implemented on Android only in this PoC")
    }
  }

  private func callNoArg(_ function: () -> UnsafeMutablePointer<CChar>?) throws -> String {
    guard let output = function() else {
      throw GenericException("Rust bridge returned a null response")
    }
    defer { heaven_lit_rust_free_string(output) }
    return String(cString: output)
  }

  private func callTwoArgs(
    _ function: (UnsafePointer<CChar>?, UnsafePointer<CChar>?) -> UnsafeMutablePointer<CChar>?,
    arg1: UnsafePointer<CChar>?,
    arg2: UnsafePointer<CChar>?
  ) throws -> String {
    guard let output = function(arg1, arg2) else {
      throw GenericException("Rust bridge returned a null response")
    }
    defer { heaven_lit_rust_free_string(output) }
    return String(cString: output)
  }
}
