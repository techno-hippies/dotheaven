// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ProfileV1.sol";

contract ProfileV1Test is Test {
    OnchainProfilesV1 profile;

    uint256 userPk = 0xA11CE;
    address user;

    function setUp() public {
        profile = new OnchainProfilesV1();
        user = vm.addr(userPk);
    }

    function _defaultInput() internal pure returns (OnchainProfilesV1.ProfileInput memory in_) {
        in_.profileVersion = 1;
        in_.displayName = "Alice";
        in_.age = 25;
        in_.nativeLanguage = bytes2("EN");
        in_.gender = OnchainProfilesV1.Gender.Woman;
    }

    // ── Direct upsertProfile ──

    function test_upsertProfile_direct() public {
        OnchainProfilesV1.ProfileInput memory in_ = _defaultInput();

        vm.prank(user);
        profile.upsertProfile(in_);

        OnchainProfilesV1.Profile memory p = profile.getProfile(user);
        assertTrue(p.exists);
        assertEq(p.age, 25);
        assertEq(p.displayName, "Alice");
        assertEq(p.nativeLanguage, bytes2("EN"));
    }

    // ── Sponsored upsertProfileFor ──

    function test_upsertProfileFor_validSig() public {
        OnchainProfilesV1.ProfileInput memory in_ = _defaultInput();
        uint256 currentNonce = profile.nonces(user);

        // Compute profileHash the same way the contract does
        bytes32 profileHash = keccak256(abi.encode(in_));

        // Build the EIP-191 message
        string memory message = string.concat(
            "heaven:profile:",
            _toHexString(user),
            ":",
            _toHexString(profileHash),
            ":",
            _uintToString(currentNonce)
        );

        // Sign with EIP-191 prefix
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n",
                _uintToString(bytes(message).length),
                message
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userPk, digest);
        bytes memory signature = abi.encodePacked(r, s, v);

        // Anyone can submit
        profile.upsertProfileFor(user, in_, signature);

        // Verify profile written
        OnchainProfilesV1.Profile memory p = profile.getProfile(user);
        assertTrue(p.exists);
        assertEq(p.age, 25);
        assertEq(p.displayName, "Alice");

        // Verify nonce incremented
        assertEq(profile.nonces(user), 1);
    }

    function test_upsertProfileFor_wrongSigner() public {
        OnchainProfilesV1.ProfileInput memory in_ = _defaultInput();
        uint256 currentNonce = profile.nonces(user);
        bytes32 profileHash = keccak256(abi.encode(in_));

        string memory message = string.concat(
            "heaven:profile:",
            _toHexString(user),
            ":",
            _toHexString(profileHash),
            ":",
            _uintToString(currentNonce)
        );

        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n",
                _uintToString(bytes(message).length),
                message
            )
        );

        // Sign with WRONG key
        uint256 wrongPk = 0xBAD;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(wrongPk, digest);
        bytes memory signature = abi.encodePacked(r, s, v);

        vm.expectRevert("Invalid signature");
        profile.upsertProfileFor(user, in_, signature);
    }

    function test_upsertProfileFor_replayBlocked() public {
        OnchainProfilesV1.ProfileInput memory in_ = _defaultInput();
        bytes32 profileHash = keccak256(abi.encode(in_));

        // Sign for nonce 0
        string memory message = string.concat(
            "heaven:profile:",
            _toHexString(user),
            ":",
            _toHexString(profileHash),
            ":",
            _uintToString(0)
        );
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n",
                _uintToString(bytes(message).length),
                message
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userPk, digest);
        bytes memory signature = abi.encodePacked(r, s, v);

        // First call succeeds
        profile.upsertProfileFor(user, in_, signature);
        assertEq(profile.nonces(user), 1);

        // Replay with same signature fails (nonce is now 1)
        vm.expectRevert("Invalid signature");
        profile.upsertProfileFor(user, in_, signature);
    }

    // ── Helpers (mirror contract logic) ──

    function _toHexString(address a) internal pure returns (string memory) {
        bytes memory s = new bytes(42);
        s[0] = "0";
        s[1] = "x";
        bytes memory hexChars = "0123456789abcdef";
        uint160 v = uint160(a);
        for (uint256 i = 41; i > 1; i--) {
            s[i] = hexChars[v & 0xf];
            v >>= 4;
        }
        return string(s);
    }

    function _toHexString(bytes32 b) internal pure returns (string memory) {
        bytes memory s = new bytes(66);
        s[0] = "0";
        s[1] = "x";
        bytes memory hexChars = "0123456789abcdef";
        uint256 v = uint256(b);
        for (uint256 i = 65; i > 1; i--) {
            s[i] = hexChars[v & 0xf];
            v >>= 4;
        }
        return string(s);
    }

    function _uintToString(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 temp = v;
        uint256 digits;
        while (temp != 0) { digits++; temp /= 10; }
        bytes memory buf = new bytes(digits);
        while (v != 0) {
            digits--;
            buf[digits] = bytes1(uint8(48 + v % 10));
            v /= 10;
        }
        return string(buf);
    }
}
