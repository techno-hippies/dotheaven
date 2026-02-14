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
  _ domain: UnsafePointer<CChar>?
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
    ) { (network: String, rpcUrl: String, pkpPublicKey: String, authMethodType: Int, authMethodId: String, accessToken: String, domain: String) throws -> String in
      let authMethodTypeString = String(authMethodType)
      return try network.withCString { networkPtr in
        try rpcUrl.withCString { rpcUrlPtr in
          try pkpPublicKey.withCString { pkpPublicKeyPtr in
            try authMethodTypeString.withCString { authMethodTypePtr in
              try authMethodId.withCString { authMethodIdPtr in
                try accessToken.withCString { accessTokenPtr in
                  try domain.withCString { domainPtr in
                    guard let output = heaven_lit_rust_create_auth_context_from_passkey_callback(
                      networkPtr,
                      rpcUrlPtr,
                      pkpPublicKeyPtr,
                      authMethodTypePtr,
                      authMethodIdPtr,
                      accessTokenPtr,
                      domainPtr
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
