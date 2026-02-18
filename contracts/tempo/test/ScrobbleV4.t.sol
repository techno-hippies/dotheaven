// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";
import {ScrobbleV4} from "../src/ScrobbleV4.sol";

contract ScrobbleV4Test is Test {
    ScrobbleV4 sc;

    address deployer = address(0xA11CE);
    address operator = address(0xB0B);
    address user = address(0xC0FFEE);

    function setUp() public {
        vm.prank(deployer);
        sc = new ScrobbleV4(operator);
    }

    // ── Auth ─────────────────────────────────────────────────────────────

    function test_constructor() public view {
        assertEq(sc.owner(), deployer);
        assertTrue(sc.isOperator(operator));
    }

    function test_transferOwnership() public {
        address newOwner = address(0xDEAD);
        vm.prank(deployer);
        sc.transferOwnership(newOwner);
        assertEq(sc.owner(), newOwner);
    }

    function test_transferOwnership_notOwner_reverts() public {
        vm.expectRevert(ScrobbleV4.Unauthorized.selector);
        sc.transferOwnership(address(0xDEAD));
    }

    function test_transferOwnership_zeroAddress_reverts() public {
        vm.prank(deployer);
        vm.expectRevert(ScrobbleV4.ZeroAddress.selector);
        sc.transferOwnership(address(0));
    }

    function test_setOperator() public {
        address newOp = address(0xBEEF);
        vm.prank(deployer);
        sc.setOperator(newOp, true);
        assertTrue(sc.isOperator(newOp));

        vm.prank(deployer);
        sc.setOperator(newOp, false);
        assertFalse(sc.isOperator(newOp));
    }

    function test_setOperator_notOwner_reverts() public {
        vm.expectRevert(ScrobbleV4.Unauthorized.selector);
        sc.setOperator(address(0xBEEF), true);
    }

    // ── User authorization (msg.sender == user) ─────────────────────────

    function test_scrobble_fromUser() public {
        bytes32 trackId = _registerMetaTrack("Song", "Artist", "Album", 150);

        vm.prank(user);
        sc.scrobbleBatch(user, _b32(trackId), _u64(1000));
    }

    function test_scrobble_fromWrongSender_reverts() public {
        bytes32 trackId = _registerMetaTrack("Song", "Artist", "Album", 150);

        vm.prank(address(0xBAD));
        vm.expectRevert(ScrobbleV4.NotUserSender.selector);
        sc.scrobbleBatch(user, _b32(trackId), _u64(1000));
    }

    function test_scrobble_operatorCannotScrobbleAsUser() public {
        bytes32 trackId = _registerMetaTrack("Song", "Artist", "Album", 150);

        vm.prank(operator);
        vm.expectRevert(ScrobbleV4.NotUserSender.selector);
        sc.scrobbleBatch(user, _b32(trackId), _u64(1000));
    }

    // ── Track Registration (operator-only) ──────────────────────────────

    function test_registerTrack_operator() public {
        bytes32 payload = keccak256(abi.encode("song", "artist", "album"));
        bytes32 trackId = keccak256(abi.encode(uint8(3), payload));

        vm.prank(operator);
        sc.registerTracksBatch(
            _u8(3), _b32(payload),
            _str("Song"), _str("Artist"), _str("Album"),
            _u32(180)
        );

        assertTrue(sc.isRegistered(trackId));
        (, , , , , , , uint32 duration) = sc.getTrack(trackId);
        assertEq(duration, 180);
    }

    function test_registerTrack_notOperator_reverts() public {
        bytes32 payload = keccak256(abi.encode("s", "a", "b"));

        vm.expectRevert(ScrobbleV4.Unauthorized.selector);
        sc.registerTracksBatch(_u8(3), _b32(payload), _str("S"), _str("A"), _str("B"), _u32(0));
    }

    // ── registerAndScrobbleBatch (user-auth) ────────────────────────────

    function test_registerAndScrobble_fromUser() public {
        bytes32 payload = keccak256(abi.encode("new", "track", "here"));
        bytes32 trackId = keccak256(abi.encode(uint8(3), payload));

        vm.prank(user);
        sc.registerAndScrobbleBatch(
            user,
            _u8(3), _b32(payload),
            _str("New"), _str("Track"), _str("Here"),
            _u32(210),
            _b32(trackId), _u64(2000)
        );

        assertTrue(sc.isRegistered(trackId));
        (, , , , , , , uint32 duration) = sc.getTrack(trackId);
        assertEq(duration, 210);
    }

    function test_registerAndScrobble_fromWrongSender_reverts() public {
        bytes32 payload = keccak256(abi.encode("new", "track", "here"));
        bytes32 trackId = keccak256(abi.encode(uint8(3), payload));

        vm.prank(address(0xBAD));
        vm.expectRevert(ScrobbleV4.NotUserSender.selector);
        sc.registerAndScrobbleBatch(
            user,
            _u8(3), _b32(payload),
            _str("New"), _str("Track"), _str("Here"),
            _u32(0),
            _b32(trackId), _u64(2000)
        );
    }

    function test_registerAndScrobble_noNewTracks() public {
        bytes32 trackId = _registerMetaTrack("Song", "Artist", "Album", 150);

        uint8[] memory emptyU8 = new uint8[](0);
        bytes32[] memory empty32 = new bytes32[](0);
        string[] memory emptyStr = new string[](0);
        uint32[] memory emptyU32 = new uint32[](0);

        vm.prank(user);
        sc.registerAndScrobbleBatch(
            user,
            emptyU8, empty32, emptyStr, emptyStr, emptyStr, emptyU32,
            _b32(trackId), _u64(4000)
        );
    }

    // ── Track update (operator-only) ────────────────────────────────────

    function test_updateTrack_operator() public {
        bytes32 trackId = _registerMetaTrack("Typo", "Artis", "Albm", 120);

        vm.prank(operator);
        sc.updateTrack(trackId, "Title", "Artist", "Album");

        (string memory title, string memory artist, string memory album, , , , , uint32 duration) = sc.getTrack(trackId);
        assertEq(title, "Title");
        assertEq(artist, "Artist");
        assertEq(album, "Album");
        assertEq(duration, 120);
    }

    function test_updateTrack_notOperator_reverts() public {
        bytes32 trackId = _registerMetaTrack("Song", "Artist", "Album", 100);

        vm.expectRevert(ScrobbleV4.Unauthorized.selector);
        sc.updateTrack(trackId, "S", "A", "B");
    }

    // ── Track cover (operator-only) ─────────────────────────────────────

    function test_setTrackCover_operator() public {
        bytes32 trackId = _registerMetaTrack("Song", "Artist", "Album", 200);

        vm.prank(operator);
        sc.setTrackCover(trackId, "QmExampleCid123");

        (, , , , , , string memory coverCid, ) = sc.getTrack(trackId);
        assertEq(coverCid, "QmExampleCid123");
    }

    function test_setTrackCover_notOperator_reverts() public {
        bytes32 trackId = _registerMetaTrack("Song", "Artist", "Album", 200);

        vm.expectRevert(ScrobbleV4.Unauthorized.selector);
        sc.setTrackCover(trackId, "QmCid");
    }

    function test_setTrackCoverFor_user() public {
        bytes32 trackId = _registerMetaTrack("Song", "Artist", "Album", 200);

        vm.prank(user);
        sc.setTrackCoverFor(user, trackId, "ar://cover-ref");

        (, , , , , , string memory coverCid, ) = sc.getTrack(trackId);
        assertEq(coverCid, "ar://cover-ref");
    }

    function test_setTrackCoverFor_wrongSender_reverts() public {
        bytes32 trackId = _registerMetaTrack("Song", "Artist", "Album", 200);

        vm.prank(address(0xBAD));
        vm.expectRevert(ScrobbleV4.NotUserSender.selector);
        sc.setTrackCoverFor(user, trackId, "ar://cover-ref");
    }

    function test_setTrackCoverFor_coverAlreadySet_reverts() public {
        bytes32 trackId = _registerMetaTrack("Song", "Artist", "Album", 200);

        vm.prank(user);
        sc.setTrackCoverFor(user, trackId, "ar://cover-ref");

        vm.prank(user);
        vm.expectRevert("cover already set");
        sc.setTrackCoverFor(user, trackId, "ar://new-cover-ref");
    }

    function test_setTrackCoverBatch() public {
        bytes32 t1 = _registerMetaTrack("Song1", "Artist1", "Album1", 100);
        bytes32 t2 = _registerMetaTrack("Song2", "Artist2", "Album2", 200);

        bytes32[] memory ids = new bytes32[](2);
        string[] memory cids = new string[](2);
        ids[0] = t1; cids[0] = "QmCover1";
        ids[1] = t2; cids[1] = "QmCover2";

        vm.prank(operator);
        sc.setTrackCoverBatch(ids, cids);

        (, , , , , , string memory c1, ) = sc.getTrack(t1);
        (, , , , , , string memory c2, ) = sc.getTrack(t2);
        assertEq(c1, "QmCover1");
        assertEq(c2, "QmCover2");
    }

    function test_overwriteTrackCover_operator() public {
        bytes32 trackId = _registerMetaTrack("Song", "Artist", "Album", 200);

        vm.prank(user);
        sc.setTrackCoverFor(user, trackId, "ar://old-cover");

        vm.prank(operator);
        sc.overwriteTrackCover(trackId, "ar://new-cover");

        (, , , , , , string memory coverCid, ) = sc.getTrack(trackId);
        assertEq(coverCid, "ar://new-cover");
    }

    function test_overwriteTrackCover_notOperator_reverts() public {
        bytes32 trackId = _registerMetaTrack("Song", "Artist", "Album", 200);

        vm.prank(user);
        sc.setTrackCoverFor(user, trackId, "ar://old-cover");

        vm.expectRevert(ScrobbleV4.Unauthorized.selector);
        sc.overwriteTrackCover(trackId, "ar://new-cover");
    }

    function test_overwriteTrackCover_coverNotSet_reverts() public {
        bytes32 trackId = _registerMetaTrack("Song", "Artist", "Album", 200);

        vm.prank(operator);
        vm.expectRevert("cover not set");
        sc.overwriteTrackCover(trackId, "ar://new-cover");
    }

    // ── Track lyrics (user + operator moderation) ───────────────────────

    function test_setTrackLyricsFor_user() public {
        bytes32 trackId = _registerMetaTrack("Song", "Artist", "Album", 200);

        vm.prank(user);
        sc.setTrackLyricsFor(user, trackId, "ar://lyrics-ref");

        assertEq(sc.getTrackLyrics(trackId), "ar://lyrics-ref");
    }

    function test_setTrackLyricsFor_wrongSender_reverts() public {
        bytes32 trackId = _registerMetaTrack("Song", "Artist", "Album", 200);

        vm.prank(address(0xBAD));
        vm.expectRevert(ScrobbleV4.NotUserSender.selector);
        sc.setTrackLyricsFor(user, trackId, "ar://lyrics-ref");
    }

    function test_setTrackLyricsFor_lyricsAlreadySet_reverts() public {
        bytes32 trackId = _registerMetaTrack("Song", "Artist", "Album", 200);

        vm.prank(user);
        sc.setTrackLyricsFor(user, trackId, "ar://lyrics-ref");

        vm.prank(user);
        vm.expectRevert("lyrics already set");
        sc.setTrackLyricsFor(user, trackId, "ar://new-lyrics-ref");
    }

    function test_overwriteTrackLyrics_operator() public {
        bytes32 trackId = _registerMetaTrack("Song", "Artist", "Album", 200);

        vm.prank(user);
        sc.setTrackLyricsFor(user, trackId, "ar://old-lyrics");

        vm.prank(operator);
        sc.overwriteTrackLyrics(trackId, "ar://new-lyrics");

        assertEq(sc.getTrackLyrics(trackId), "ar://new-lyrics");
    }

    function test_overwriteTrackLyrics_notOperator_reverts() public {
        bytes32 trackId = _registerMetaTrack("Song", "Artist", "Album", 200);

        vm.prank(user);
        sc.setTrackLyricsFor(user, trackId, "ar://old-lyrics");

        vm.expectRevert(ScrobbleV4.Unauthorized.selector);
        sc.overwriteTrackLyrics(trackId, "ar://new-lyrics");
    }

    function test_overwriteTrackLyrics_lyricsNotSet_reverts() public {
        bytes32 trackId = _registerMetaTrack("Song", "Artist", "Album", 200);

        vm.prank(operator);
        vm.expectRevert("lyrics not set");
        sc.overwriteTrackLyrics(trackId, "ar://new-lyrics");
    }

    // ── Scrobble events emit user ───────────────────────────────────────

    function test_scrobble_emitsUserAddress() public {
        bytes32 trackId = _registerMetaTrack("Song", "Artist", "Album", 150);

        vm.expectEmit(true, true, false, true);
        emit ScrobbleV4.Scrobbled(user, trackId, 1000);

        vm.prank(user);
        sc.scrobbleBatch(user, _b32(trackId), _u64(1000));
    }

    // ── Edge cases ──────────────────────────────────────────────────────

    function test_scrobble_zeroUser_reverts() public {
        bytes32 trackId = _registerMetaTrack("Song", "Artist", "Album", 150);

        vm.prank(user);
        vm.expectRevert(ScrobbleV4.ZeroAddress.selector);
        sc.scrobbleBatch(address(0), _b32(trackId), _u64(1000));
    }

    function test_scrobble_unknownTrack_reverts() public {
        bytes32 unknown = keccak256("nonexistent");

        vm.prank(user);
        vm.expectRevert("unknown track");
        sc.scrobbleBatch(user, _b32(unknown), _u64(1000));
    }

    function test_registerTrack_duplicate_reverts() public {
        bytes32 payload = keccak256(abi.encode("s", "a", "b"));

        vm.prank(operator);
        sc.registerTracksBatch(_u8(3), _b32(payload), _str("S"), _str("A"), _str("B"), _u32(90));

        vm.prank(operator);
        vm.expectRevert("already registered");
        sc.registerTracksBatch(_u8(3), _b32(payload), _str("S"), _str("A"), _str("B"), _u32(90));
    }

    function test_registerTrack_zeroPayload_reverts() public {
        vm.prank(operator);
        vm.expectRevert("zero payload");
        sc.registerTracksBatch(_u8(3), _b32(bytes32(0)), _str("S"), _str("A"), _str("B"), _u32(0));
    }

    function test_registerTrack_invalidKind_reverts() public {
        vm.prank(operator);
        vm.expectRevert("invalid kind");
        sc.registerTracksBatch(_u8(0), _b32(keccak256("x")), _str("S"), _str("A"), _str("B"), _u32(0));
    }

    function test_multipleOperators() public {
        address op2 = address(0xBEEF);

        vm.prank(deployer);
        sc.setOperator(op2, true);

        bytes32 p1 = keccak256(abi.encode("s1", "a1", "b1"));
        vm.prank(operator);
        sc.registerTracksBatch(_u8(3), _b32(p1), _str("S1"), _str("A1"), _str("B1"), _u32(100));

        bytes32 p2 = keccak256(abi.encode("s2", "a2", "b2"));
        vm.prank(op2);
        sc.registerTracksBatch(_u8(3), _b32(p2), _str("S2"), _str("A2"), _str("B2"), _u32(200));

        vm.prank(deployer);
        sc.setOperator(op2, false);

        bytes32 p3 = keccak256(abi.encode("s3", "a3", "b3"));
        vm.prank(op2);
        vm.expectRevert(ScrobbleV4.Unauthorized.selector);
        sc.registerTracksBatch(_u8(3), _b32(p3), _str("S3"), _str("A3"), _str("B3"), _u32(300));
    }

    // ── Canonical payload checks ────────────────────────────────────────

    function test_registerTrack_mbid() public {
        bytes16 mbid = bytes16(keccak256("plastic-love-mbid"));
        bytes32 payload = bytes32(mbid);
        bytes32 trackId = keccak256(abi.encode(uint8(1), payload));

        vm.prank(operator);
        sc.registerTracksBatch(
            _u8(1), _b32(payload),
            _str("Plastic Love"), _str("Mariya Takeuchi"), _str("Variety"),
            _u32(259)
        );

        assertTrue(sc.isRegistered(trackId));
        (, , , uint8 kind, bytes32 storedPayload, , , uint32 duration) = sc.getTrack(trackId);
        assertEq(kind, 1);
        assertEq(storedPayload, payload);
        assertEq(duration, 259);
    }

    function test_registerTrack_ipId() public {
        address ipId = 0x1234567890AbcdEF1234567890aBcdef12345678;
        bytes32 payload = bytes32(uint256(uint160(ipId)));

        vm.prank(operator);
        sc.registerTracksBatch(
            _u8(2), _b32(payload),
            _str("Song"), _str("Artist"), _str("Album"),
            _u32(180)
        );

        bytes32 trackId = keccak256(abi.encode(uint8(2), payload));
        assertTrue(sc.isRegistered(trackId));
    }

    function test_registerTrack_mbid_badPayload_reverts() public {
        bytes32 badPayload = bytes32(uint256(1));
        vm.prank(operator);
        vm.expectRevert("bad mbid payload");
        sc.registerTracksBatch(_u8(1), _b32(badPayload), _str("S"), _str("A"), _str("B"), _u32(0));
    }

    function test_registerTrack_ipId_badPayload_reverts() public {
        bytes32 badPayload = bytes32(uint256(type(uint256).max));
        vm.prank(operator);
        vm.expectRevert("bad ipid payload");
        sc.registerTracksBatch(_u8(2), _b32(badPayload), _str("S"), _str("A"), _str("B"), _u32(0));
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    function _registerMetaTrack(string memory title, string memory artist, string memory album, uint32 durationSec)
        internal
        returns (bytes32 trackId)
    {
        bytes32 payload = keccak256(abi.encode(title, artist, album));
        trackId = keccak256(abi.encode(uint8(3), payload));
        vm.prank(operator);
        sc.registerTracksBatch(_u8(3), _b32(payload), _str(title), _str(artist), _str(album), _u32(durationSec));
    }

    function _b32(bytes32 v) internal pure returns (bytes32[] memory arr) {
        arr = new bytes32[](1);
        arr[0] = v;
    }

    function _u8(uint8 v) internal pure returns (uint8[] memory arr) {
        arr = new uint8[](1);
        arr[0] = v;
    }

    function _u64(uint64 v) internal pure returns (uint64[] memory arr) {
        arr = new uint64[](1);
        arr[0] = v;
    }

    function _u32(uint32 v) internal pure returns (uint32[] memory arr) {
        arr = new uint32[](1);
        arr[0] = v;
    }

    function _str(string memory v) internal pure returns (string[] memory arr) {
        arr = new string[](1);
        arr[0] = v;
    }
}
