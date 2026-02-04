// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ProfileV2.sol";

contract ProfileV2Test is Test {
    OnchainProfilesV2 profile;

    uint256 userPk = 0xA11CE;
    address user;

    function setUp() public {
        profile = new OnchainProfilesV2();
        user = vm.addr(userPk);
    }

    function _defaultInput() internal pure returns (OnchainProfilesV2.ProfileInput memory in_) {
        in_.profileVersion = 2;
        in_.displayName = "Alice";
        in_.age = 25;
        in_.gender = OnchainProfilesV2.Gender.Woman;
        // English (0x454E) Native (7) + Spanish (0x4553) B1 (3)
        // Entry[0] = (0x454E << 16) | (7 << 8) = 0x454E0700
        // Entry[1] = (0x4553 << 16) | (3 << 8) = 0x45530300
        // packed = Entry[0] << 224 | Entry[1] << 192
        in_.languagesPacked =
            (uint256(0x454E0700) << 224) |
            (uint256(0x45530300) << 192);
    }

    // ── Direct upsertProfile ──

    function test_upsertProfile_direct() public {
        OnchainProfilesV2.ProfileInput memory in_ = _defaultInput();

        vm.prank(user);
        profile.upsertProfile(in_);

        OnchainProfilesV2.Profile memory p = profile.getProfile(user);
        assertTrue(p.exists);
        assertEq(p.age, 25);
        assertEq(p.displayName, "Alice");
        assertEq(p.languagesPacked, in_.languagesPacked);

        // Verify unpacking
        (bytes2[8] memory langs, uint8[8] memory profs) = profile.unpackLanguages(p.languagesPacked);
        assertEq(langs[0], bytes2("EN"));
        assertEq(profs[0], 7); // Native
        assertEq(langs[1], bytes2("ES"));
        assertEq(profs[1], 3); // B1
        assertEq(uint16(langs[2]), 0); // empty
    }

    // ── Sponsored upsertProfileFor ──

    function test_upsertProfileFor_validSig() public {
        OnchainProfilesV2.ProfileInput memory in_ = _defaultInput();
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
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userPk, digest);
        bytes memory signature = abi.encodePacked(r, s, v);

        profile.upsertProfileFor(user, in_, signature);

        OnchainProfilesV2.Profile memory p = profile.getProfile(user);
        assertTrue(p.exists);
        assertEq(p.age, 25);
        assertEq(p.displayName, "Alice");
        assertEq(p.languagesPacked, in_.languagesPacked);
        assertEq(profile.nonces(user), 1);
    }

    function test_upsertProfileFor_wrongSigner() public {
        OnchainProfilesV2.ProfileInput memory in_ = _defaultInput();
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

        uint256 wrongPk = 0xBAD;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(wrongPk, digest);
        bytes memory signature = abi.encodePacked(r, s, v);

        vm.expectRevert("Invalid signature");
        profile.upsertProfileFor(user, in_, signature);
    }

    function test_upsertProfileFor_replayBlocked() public {
        OnchainProfilesV2.ProfileInput memory in_ = _defaultInput();
        bytes32 profileHash = keccak256(abi.encode(in_));

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

        profile.upsertProfileFor(user, in_, signature);
        assertEq(profile.nonces(user), 1);

        vm.expectRevert("Invalid signature");
        profile.upsertProfileFor(user, in_, signature);
    }

    // ── Language packing tests ──

    function test_languagePacking_roundtrip() public view {
        bytes2[8] memory langs = [
            bytes2("EN"), bytes2("ES"), bytes2("FR"), bytes2("DE"),
            bytes2("JA"), bytes2("KO"), bytes2("ZH"), bytes2("AR")
        ];
        uint8[8] memory profs = [uint8(7), 3, 5, 2, 1, 4, 6, 7];

        // Pack manually
        uint256 packed = 0;
        for (uint256 i = 0; i < 8; i++) {
            uint256 slot = (uint256(uint16(langs[i])) << 16) | (uint256(profs[i]) << 8);
            packed |= (slot << ((7 - i) * 32));
        }

        // Unpack via contract helper
        (bytes2[8] memory outLangs, uint8[8] memory outProfs) = profile.unpackLanguages(packed);

        for (uint256 i = 0; i < 8; i++) {
            assertEq(outLangs[i], langs[i]);
            assertEq(outProfs[i], profs[i]);
        }
    }

    function test_languagePacking_singleNative() public view {
        // Only English Native in slot 0
        uint256 packed = uint256(0x454E0700) << 224;

        (bytes2[8] memory langs, uint8[8] memory profs) = profile.unpackLanguages(packed);
        assertEq(langs[0], bytes2("EN"));
        assertEq(profs[0], 7);

        // All other slots empty
        for (uint256 i = 1; i < 8; i++) {
            assertEq(uint16(langs[i]), 0);
            assertEq(profs[i], 0);
        }
    }

    function test_languagePacking_emptySlots() public view {
        uint256 packed = 0;

        (bytes2[8] memory langs, uint8[8] memory profs) = profile.unpackLanguages(packed);
        for (uint256 i = 0; i < 8; i++) {
            assertEq(uint16(langs[i]), 0);
            assertEq(profs[i], 0);
        }
    }

    function test_packLanguageSlot() public view {
        uint32 slot = profile.packLanguageSlot(bytes2("EN"), 7);
        assertEq(slot, 0x454E0700);

        (bytes2 lang, uint8 prof) = profile.unpackLanguageSlot(slot);
        assertEq(lang, bytes2("EN"));
        assertEq(prof, 7);
    }

    function test_getLanguages() public {
        OnchainProfilesV2.ProfileInput memory in_ = _defaultInput();

        vm.prank(user);
        profile.upsertProfile(in_);

        (bytes2[8] memory langs, uint8[8] memory profs) = profile.getLanguages(user);
        assertEq(langs[0], bytes2("EN"));
        assertEq(profs[0], 7);
        assertEq(langs[1], bytes2("ES"));
        assertEq(profs[1], 3);
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
