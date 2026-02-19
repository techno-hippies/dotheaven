// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ScrobbleV3.sol";

contract ScrobbleV3Test is Test {
    ScrobbleV3 sc;

    address owner = address(0xA11CE);
    address sponsor = address(0xB0B);
    address user = address(0xC0FFEE);

    function setUp() public {
        vm.prank(owner);
        sc = new ScrobbleV3(sponsor);
    }

    // ── Auth ─────────────────────────────────────────────────────────────

    function test_constructor() public view {
        assertEq(sc.owner(), owner);
        assertEq(sc.sponsor(), sponsor);
    }

    function test_transferOwnership() public {
        address newOwner = address(0xDEAD);
        vm.prank(owner);
        sc.transferOwnership(newOwner);
        assertEq(sc.owner(), newOwner);
    }

    function test_transferOwnership_notOwner_reverts() public {
        vm.expectRevert("not owner");
        sc.transferOwnership(address(0xDEAD));
    }

    function test_setSponsor() public {
        address newSponsor = address(0xBEEF);
        vm.prank(owner);
        sc.setSponsor(newSponsor);
        assertEq(sc.sponsor(), newSponsor);
    }

    // ── Track Registration ───────────────────────────────────────────────

    function test_registerTrack_mbid() public {
        bytes16 mbid = bytes16(keccak256("plastic-love-mbid"));
        bytes32 payload = bytes32(mbid); // left-aligned, low 16 zero
        bytes32 trackId = keccak256(abi.encode(uint8(1), payload));

        vm.prank(sponsor);
        sc.registerTracksBatch(
            _u8(1), _b32(payload),
            _str("Plastic Love"), _str("Mariya Takeuchi"), _str("Variety")
        );

        assertTrue(sc.isRegistered(trackId));

        (string memory title, string memory artist, string memory album, uint8 kind, bytes32 storedPayload, uint64 registeredAt, string memory coverCid) = sc.getTrack(trackId);
        assertEq(title, "Plastic Love");
        assertEq(artist, "Mariya Takeuchi");
        assertEq(album, "Variety");
        assertEq(kind, 1);
        assertEq(storedPayload, payload);
        assertGt(registeredAt, 0);
        assertEq(bytes(coverCid).length, 0);
    }

    function test_registerTrack_ipId() public {
        address ipId = 0x1234567890AbcdEF1234567890aBcdef12345678;
        bytes32 payload = bytes32(uint256(uint160(ipId)));
        bytes32 trackId = keccak256(abi.encode(uint8(2), payload));

        vm.prank(sponsor);
        sc.registerTracksBatch(
            _u8(2), _b32(payload),
            _str("Song"), _str("Artist"), _str("Album")
        );

        assertTrue(sc.isRegistered(trackId));

        (, , , uint8 kind, bytes32 storedPayload, ,) = sc.getTrack(trackId);
        assertEq(kind, 2);
        assertEq(storedPayload, payload);
    }

    function test_registerTrack_meta() public {
        bytes32 payload = keccak256(abi.encode("song", "artist", "album")); // normalized
        bytes32 trackId = keccak256(abi.encode(uint8(3), payload));

        vm.prank(sponsor);
        sc.registerTracksBatch(
            _u8(3), _b32(payload),
            _str("Song"), _str("Artist"), _str("Album") // pretty display
        );

        assertTrue(sc.isRegistered(trackId));

        (string memory title, , , uint8 kind, bytes32 storedPayload, ,) = sc.getTrack(trackId);
        assertEq(title, "Song");
        assertEq(kind, 3);
        assertEq(storedPayload, payload);
    }

    function test_registerTrack_emitsEvent() public {
        bytes32 payload = keccak256(abi.encode("song", "artist", "album"));
        bytes32 trackId = keccak256(abi.encode(uint8(3), payload));
        bytes32 metaHash = keccak256(abi.encode("Song", "Artist", "Album"));

        vm.expectEmit(true, true, true, true);
        emit ScrobbleV3.TrackRegistered(trackId, 3, payload, metaHash, uint64(block.timestamp));

        vm.prank(sponsor);
        sc.registerTracksBatch(
            _u8(3), _b32(payload),
            _str("Song"), _str("Artist"), _str("Album")
        );
    }

    // ── Canonical payload checks ─────────────────────────────────────────

    function test_registerTrack_mbid_badPayload_reverts() public {
        // Non-zero low 16 bytes → not a valid bytes16 left-aligned payload
        bytes32 badPayload = bytes32(uint256(1)); // low byte set
        vm.prank(sponsor);
        vm.expectRevert("bad mbid payload");
        sc.registerTracksBatch(_u8(1), _b32(badPayload), _str("S"), _str("A"), _str("B"));
    }

    function test_registerTrack_ipId_badPayload_reverts() public {
        // High 12 bytes non-zero → not a valid address right-aligned payload
        bytes32 badPayload = bytes32(uint256(type(uint256).max)); // all bits set
        vm.prank(sponsor);
        vm.expectRevert("bad ipid payload");
        sc.registerTracksBatch(_u8(2), _b32(badPayload), _str("S"), _str("A"), _str("B"));
    }

    function test_registerTrack_mbid_validPayload() public {
        // Valid: high 16 bytes set, low 16 zero
        bytes16 mbid = bytes16(hex"b1a9c02eb35c4f189f040e4d0e3409c3");
        bytes32 payload = bytes32(mbid);
        // Verify low 16 bytes are zero
        assertEq(uint128(uint256(payload)), 0);

        vm.prank(sponsor);
        sc.registerTracksBatch(_u8(1), _b32(payload), _str("S"), _str("A"), _str("B"));

        bytes32 trackId = keccak256(abi.encode(uint8(1), payload));
        assertTrue(sc.isRegistered(trackId));
    }

    function test_registerTrack_ipId_validPayload() public {
        // Valid: high 12 bytes zero, address in low 20
        address addr = 0x1234567890AbcdEF1234567890aBcdef12345678;
        bytes32 payload = bytes32(uint256(uint160(addr)));
        // Verify high 12 bytes are zero
        assertEq(uint256(payload) >> 160, 0);

        vm.prank(sponsor);
        sc.registerTracksBatch(_u8(2), _b32(payload), _str("S"), _str("A"), _str("B"));

        bytes32 trackId = keccak256(abi.encode(uint8(2), payload));
        assertTrue(sc.isRegistered(trackId));
    }

    // ── Registration edge cases ──────────────────────────────────────────

    function test_registerTrack_duplicate_reverts() public {
        bytes32 payload = keccak256(abi.encode("s", "a", "b"));

        vm.prank(sponsor);
        sc.registerTracksBatch(_u8(3), _b32(payload), _str("S"), _str("A"), _str("B"));

        vm.prank(sponsor);
        vm.expectRevert("already registered");
        sc.registerTracksBatch(_u8(3), _b32(payload), _str("S"), _str("A"), _str("B"));
    }

    function test_registerTrack_notSponsor_reverts() public {
        bytes32 payload = keccak256(abi.encode("s", "a", "b"));

        vm.expectRevert("unauthorized");
        sc.registerTracksBatch(_u8(3), _b32(payload), _str("S"), _str("A"), _str("B"));
    }

    function test_registerTrack_zeroPayload_reverts() public {
        vm.prank(sponsor);
        vm.expectRevert("zero payload");
        sc.registerTracksBatch(_u8(3), _b32(bytes32(0)), _str("S"), _str("A"), _str("B"));
    }

    function test_registerTrack_invalidKind_reverts() public {
        vm.prank(sponsor);
        vm.expectRevert("invalid kind");
        sc.registerTracksBatch(_u8(0), _b32(keccak256("x")), _str("S"), _str("A"), _str("B"));
    }

    function test_registerTrack_titleTooLong_reverts() public {
        bytes16 mbid = bytes16(keccak256("x"));
        string memory longStr = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaX";

        vm.prank(sponsor);
        vm.expectRevert("title too long");
        sc.registerTracksBatch(_u8(1), _b32(bytes32(mbid)), _str(longStr), _str("A"), _str("B"));
    }

    // ── Track update ─────────────────────────────────────────────────────

    function test_updateTrack() public {
        bytes32 trackId = _registerMetaTrack("Song", "Artis", "Albm"); // typos

        vm.prank(sponsor);
        sc.updateTrack(trackId, "Song", "Artist", "Album"); // fixed

        (string memory title, string memory artist, string memory album, , , ,) = sc.getTrack(trackId);
        assertEq(title, "Song");
        assertEq(artist, "Artist");
        assertEq(album, "Album");
    }

    function test_updateTrack_emitsEvent() public {
        bytes32 trackId = _registerMetaTrack("Song", "Artist", "Album");

        vm.expectEmit(true, true, false, false);
        emit ScrobbleV3.TrackUpdated(trackId, keccak256(abi.encode("Song!", "Artist!", "Album!")));

        vm.prank(sponsor);
        sc.updateTrack(trackId, "Song!", "Artist!", "Album!");
    }

    function test_updateTrack_notRegistered_reverts() public {
        vm.prank(sponsor);
        vm.expectRevert("not registered");
        sc.updateTrack(keccak256("fake"), "S", "A", "B");
    }

    function test_updateTrack_notSponsor_reverts() public {
        bytes32 trackId = _registerMetaTrack("Song", "Artist", "Album");

        vm.expectRevert("unauthorized");
        sc.updateTrack(trackId, "S", "A", "B");
    }

    function test_updateTrack_preservesKindAndPayload() public {
        bytes32 payload = keccak256(abi.encode("song", "artist", "album"));
        bytes32 trackId = keccak256(abi.encode(uint8(3), payload));

        vm.prank(sponsor);
        sc.registerTracksBatch(_u8(3), _b32(payload), _str("Song"), _str("Artist"), _str("Album"));

        vm.prank(sponsor);
        sc.updateTrack(trackId, "SONG", "ARTIST", "ALBUM");

        (, , , uint8 kind, bytes32 storedPayload, ,) = sc.getTrack(trackId);
        assertEq(kind, 3);
        assertEq(storedPayload, payload); // unchanged
    }

    // ── Scrobbling ───────────────────────────────────────────────────────

    function test_scrobble() public {
        bytes32 trackId = _registerMetaTrack("Justice", "Genesis", unicode"†");

        vm.expectEmit(true, true, false, true);
        emit ScrobbleV3.Scrobbled(user, trackId, 1000);

        vm.prank(sponsor);
        sc.scrobbleBatch(user, _b32(trackId), _u64(1000));
    }

    function test_scrobble_multipleRepeats() public {
        bytes32 trackId = _registerMetaTrack("Justice", "Genesis", unicode"†");

        bytes32[] memory ids = new bytes32[](3);
        uint64[] memory ts = new uint64[](3);
        ids[0] = trackId; ts[0] = 1000;
        ids[1] = trackId; ts[1] = 1300;
        ids[2] = trackId; ts[2] = 1600;

        vm.prank(sponsor);
        sc.scrobbleBatch(user, ids, ts);
    }

    function test_scrobble_unknownTrack_reverts() public {
        bytes32 unknown = keccak256("nonexistent");

        vm.prank(sponsor);
        vm.expectRevert("unknown track");
        sc.scrobbleBatch(user, _b32(unknown), _u64(1000));
    }

    function test_scrobble_zeroUser_reverts() public {
        bytes32 trackId = _registerMetaTrack("Song", "Artist", "Album");

        vm.prank(sponsor);
        vm.expectRevert("zero user");
        sc.scrobbleBatch(address(0), _b32(trackId), _u64(1000));
    }

    function test_scrobble_notSponsor_reverts() public {
        bytes32 trackId = _registerMetaTrack("Song", "Artist", "Album");

        vm.expectRevert("unauthorized");
        sc.scrobbleBatch(user, _b32(trackId), _u64(1000));
    }

    // ── Combined registerAndScrobble ─────────────────────────────────────

    function test_registerAndScrobble_singleTx() public {
        bytes32 payload = keccak256(abi.encode("new song", "new artist", "new album"));
        bytes32 trackId = keccak256(abi.encode(uint8(3), payload));

        vm.prank(sponsor);
        sc.registerAndScrobbleBatch(
            user,
            _u8(3), _b32(payload),
            _str("New Song"), _str("New Artist"), _str("New Album"),
            _b32(trackId), _u64(2000)
        );

        assertTrue(sc.isRegistered(trackId));
    }

    function test_registerAndScrobble_mixedNewAndExisting() public {
        bytes32 existing = _registerMetaTrack("Existing", "Artist", "Album");

        bytes32 newPayload = keccak256(abi.encode("brand new", "fresh artist", "debut"));
        bytes32 newTrackId = keccak256(abi.encode(uint8(3), newPayload));

        bytes32[] memory scrobbleIds = new bytes32[](2);
        uint64[] memory ts = new uint64[](2);
        scrobbleIds[0] = newTrackId; ts[0] = 3000;
        scrobbleIds[1] = existing; ts[1] = 3100;

        vm.prank(sponsor);
        sc.registerAndScrobbleBatch(
            user,
            _u8(3), _b32(newPayload),
            _str("Brand New"), _str("Fresh Artist"), _str("Debut"),
            scrobbleIds, ts
        );

        assertTrue(sc.isRegistered(newTrackId));
        assertTrue(sc.isRegistered(existing));
    }

    function test_registerAndScrobble_noNewTracks() public {
        bytes32 trackId = _registerMetaTrack("Song", "Artist", "Album");

        uint8[] memory emptyU8 = new uint8[](0);
        bytes32[] memory empty32 = new bytes32[](0);
        string[] memory emptyStr = new string[](0);

        vm.prank(sponsor);
        sc.registerAndScrobbleBatch(
            user,
            emptyU8, empty32, emptyStr, emptyStr, emptyStr,
            _b32(trackId), _u64(4000)
        );
    }

    // ── trackId derivation ───────────────────────────────────────────────

    function test_trackId_deterministic() public {
        bytes32 payload = keccak256(abi.encode("a", "b", "c"));
        bytes32 expected = keccak256(abi.encode(uint8(3), payload));

        vm.prank(sponsor);
        sc.registerTracksBatch(_u8(3), _b32(payload), _str("A"), _str("B"), _str("C"));

        assertTrue(sc.isRegistered(expected));
    }

    function test_trackId_no_cross_kind_collision() public pure {
        // Same payload, different kind → different trackId
        bytes32 payload = bytes32(uint256(1) << 128); // valid for kind 1 (low 16 zero)
        bytes32 kind1Id = keccak256(abi.encode(uint8(1), payload));
        bytes32 kind3Id = keccak256(abi.encode(uint8(3), payload));
        assertTrue(kind1Id != kind3Id);
    }

    function test_trackId_meta_normalized_vs_pretty() public {
        bytes32 normPayload = keccak256(abi.encode("justice", "genesis", unicode"†"));
        bytes32 trackId = keccak256(abi.encode(uint8(3), normPayload));

        vm.prank(sponsor);
        sc.registerTracksBatch(
            _u8(3), _b32(normPayload),
            _str("Justice"), _str("Genesis"), _str(unicode"†")
        );

        (string memory title, string memory artist, , , , ,) = sc.getTrack(trackId);
        assertEq(title, "Justice");
        assertEq(artist, "Genesis");
    }

    // ── Track cover ────────────────────────────────────────────────────

    function test_setTrackCover() public {
        bytes32 trackId = _registerMetaTrack("Song", "Artist", "Album");

        vm.prank(sponsor);
        sc.setTrackCover(trackId, "QmExampleCid123");

        (, , , , , , string memory coverCid) = sc.getTrack(trackId);
        assertEq(coverCid, "QmExampleCid123");
    }

    function test_setTrackCover_emitsEvent() public {
        bytes32 trackId = _registerMetaTrack("Song", "Artist", "Album");

        vm.expectEmit(true, false, false, true);
        emit ScrobbleV3.TrackCoverSet(trackId, "QmExampleCid123");

        vm.prank(sponsor);
        sc.setTrackCover(trackId, "QmExampleCid123");
    }

    function test_setTrackCover_alreadySet_reverts() public {
        bytes32 trackId = _registerMetaTrack("Song", "Artist", "Album");

        vm.prank(sponsor);
        sc.setTrackCover(trackId, "QmFirst");

        vm.prank(sponsor);
        vm.expectRevert("cover already set");
        sc.setTrackCover(trackId, "QmSecond");
    }

    function test_setTrackCover_emptyCid_reverts() public {
        bytes32 trackId = _registerMetaTrack("Song", "Artist", "Album");

        vm.prank(sponsor);
        vm.expectRevert("empty cid");
        sc.setTrackCover(trackId, "");
    }

    function test_setTrackCover_notRegistered_reverts() public {
        vm.prank(sponsor);
        vm.expectRevert("not registered");
        sc.setTrackCover(keccak256("fake"), "QmCid");
    }

    function test_setTrackCover_notSponsor_reverts() public {
        bytes32 trackId = _registerMetaTrack("Song", "Artist", "Album");

        vm.expectRevert("unauthorized");
        sc.setTrackCover(trackId, "QmCid");
    }

    function test_setTrackCoverBatch() public {
        bytes32 t1 = _registerMetaTrack("Song1", "Artist1", "Album1");
        bytes32 t2 = _registerMetaTrack("Song2", "Artist2", "Album2");

        bytes32[] memory ids = new bytes32[](2);
        string[] memory cids = new string[](2);
        ids[0] = t1; cids[0] = "QmCover1";
        ids[1] = t2; cids[1] = "QmCover2";

        vm.prank(sponsor);
        sc.setTrackCoverBatch(ids, cids);

        (, , , , , , string memory c1) = sc.getTrack(t1);
        (, , , , , , string memory c2) = sc.getTrack(t2);
        assertEq(c1, "QmCover1");
        assertEq(c2, "QmCover2");
    }

    function test_setTrackCoverBatch_skipsAlreadySet() public {
        bytes32 t1 = _registerMetaTrack("Song1", "Artist1", "Album1");
        bytes32 t2 = _registerMetaTrack("Song2", "Artist2", "Album2");

        // Set cover on t1 first
        vm.prank(sponsor);
        sc.setTrackCover(t1, "QmOriginal");

        bytes32[] memory ids = new bytes32[](2);
        string[] memory cids = new string[](2);
        ids[0] = t1; cids[0] = "QmShouldNotOverwrite";
        ids[1] = t2; cids[1] = "QmCover2";

        vm.prank(sponsor);
        sc.setTrackCoverBatch(ids, cids);

        (, , , , , , string memory c1) = sc.getTrack(t1);
        (, , , , , , string memory c2) = sc.getTrack(t2);
        assertEq(c1, "QmOriginal"); // not overwritten
        assertEq(c2, "QmCover2");
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    function _registerMetaTrack(string memory title, string memory artist, string memory album)
        internal
        returns (bytes32 trackId)
    {
        bytes32 payload = keccak256(abi.encode(title, artist, album));
        trackId = keccak256(abi.encode(uint8(3), payload));
        vm.prank(sponsor);
        sc.registerTracksBatch(_u8(3), _b32(payload), _str(title), _str(artist), _str(album));
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

    function _str(string memory v) internal pure returns (string[] memory arr) {
        arr = new string[](1);
        arr[0] = v;
    }
}
