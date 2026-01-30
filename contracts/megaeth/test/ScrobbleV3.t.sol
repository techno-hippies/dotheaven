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
        bytes32 trackId = _mbidTrackId(bytes16(keccak256("plastic-love-mbid")));

        vm.prank(sponsor);
        sc.registerTracksBatch(
            _b32(trackId),
            _u8(1),
            _str("Plastic Love"),
            _str("Mariya Takeuchi"),
            _str("Variety")
        );

        assertTrue(sc.isRegistered(trackId));

        (string memory title, string memory artist, string memory album, uint64 registeredAt) = sc.getTrack(trackId);
        assertEq(title, "Plastic Love");
        assertEq(artist, "Mariya Takeuchi");
        assertEq(album, "Variety");
        assertGt(registeredAt, 0);
    }

    function test_registerTrack_meta_emitsEvent() public {
        bytes32 trackId = _metaTrackId("Song", "Artist", "Album");
        bytes32 metaHash = keccak256(abi.encode("Song", "Artist", "Album"));

        vm.expectEmit(true, true, false, true);
        emit ScrobbleV3.TrackRegistered(trackId, metaHash, uint64(block.timestamp));

        vm.prank(sponsor);
        sc.registerTracksBatch(
            _b32(trackId),
            _u8(3),
            _str("Song"),
            _str("Artist"),
            _str("Album")
        );
    }

    function test_registerTrack_meta_badTrackId_reverts() public {
        // Correct meta trackId for ("Song", "Artist", "Album") but we pass wrong metadata
        bytes32 trackId = _metaTrackId("Song", "Artist", "Album");

        vm.prank(sponsor);
        vm.expectRevert("bad meta trackId");
        sc.registerTracksBatch(
            _b32(trackId),
            _u8(3),
            _str("Wrong Title"),
            _str("Artist"),
            _str("Album")
        );
    }

    function test_registerTrack_meta_fakeTrackId_reverts() public {
        // Pass a random trackId with kind=3 — should fail integrity check
        bytes32 fakeId = keccak256("random");

        vm.prank(sponsor);
        vm.expectRevert("bad meta trackId");
        sc.registerTracksBatch(
            _b32(fakeId),
            _u8(3),
            _str("Song"),
            _str("Artist"),
            _str("Album")
        );
    }

    function test_registerTrack_invalidKind_reverts() public {
        bytes32 trackId = keccak256("whatever");

        vm.prank(sponsor);
        vm.expectRevert("invalid kind");
        sc.registerTracksBatch(
            _b32(trackId),
            _u8(0),
            _str("Song"),
            _str("Artist"),
            _str("Album")
        );
    }

    function test_registerTrack_duplicate_reverts() public {
        bytes32 trackId = _metaTrackId("Song", "Artist", "Album");

        vm.prank(sponsor);
        sc.registerTracksBatch(_b32(trackId), _u8(3), _str("Song"), _str("Artist"), _str("Album"));

        vm.prank(sponsor);
        vm.expectRevert("already registered");
        sc.registerTracksBatch(_b32(trackId), _u8(3), _str("Song"), _str("Artist"), _str("Album"));
    }

    function test_registerTrack_notSponsor_reverts() public {
        bytes32 trackId = _metaTrackId("Song", "Artist", "Album");

        vm.expectRevert("unauthorized");
        sc.registerTracksBatch(_b32(trackId), _u8(3), _str("Song"), _str("Artist"), _str("Album"));
    }

    function test_registerTrack_zeroId_reverts() public {
        vm.prank(sponsor);
        vm.expectRevert("zero trackId");
        sc.registerTracksBatch(_b32(bytes32(0)), _u8(3), _str("Song"), _str("Artist"), _str("Album"));
    }

    function test_registerTrack_titleTooLong_reverts() public {
        bytes32 trackId = _mbidTrackId(bytes16(keccak256("x")));
        // 129 bytes > MAX_STR (128)
        string memory longStr = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaX";

        vm.prank(sponsor);
        vm.expectRevert("title too long");
        sc.registerTracksBatch(_b32(trackId), _u8(1), _str(longStr), _str("Artist"), _str("Album"));
    }

    // ── Scrobbling ───────────────────────────────────────────────────────

    function test_scrobble() public {
        bytes32 trackId = _registerTestTrack("Justice", "Genesis", unicode"†");

        vm.expectEmit(true, true, false, true);
        emit ScrobbleV3.Scrobbled(user, trackId, 1000);

        vm.prank(sponsor);
        sc.scrobbleBatch(user, _b32(trackId), _u64(1000));
    }

    function test_scrobble_multipleRepeats() public {
        bytes32 trackId = _registerTestTrack("Justice", "Genesis", unicode"†");

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
        bytes32 trackId = _registerTestTrack("Song", "Artist", "Album");

        vm.prank(sponsor);
        vm.expectRevert("zero user");
        sc.scrobbleBatch(address(0), _b32(trackId), _u64(1000));
    }

    function test_scrobble_notSponsor_reverts() public {
        bytes32 trackId = _registerTestTrack("Song", "Artist", "Album");

        vm.expectRevert("unauthorized");
        sc.scrobbleBatch(user, _b32(trackId), _u64(1000));
    }

    // ── Combined registerAndScrobble ─────────────────────────────────────

    function test_registerAndScrobble_singleTx() public {
        bytes32 trackId = _metaTrackId("New Song", "New Artist", "New Album");

        vm.prank(sponsor);
        sc.registerAndScrobbleBatch(
            user,
            _b32(trackId),
            _u8(3),
            _str("New Song"),
            _str("New Artist"),
            _str("New Album"),
            _b32(trackId),
            _u64(2000)
        );

        assertTrue(sc.isRegistered(trackId));
    }

    function test_registerAndScrobble_mixedNewAndExisting() public {
        bytes32 existing = _registerTestTrack("Existing", "Artist", "Album");

        bytes32 newTrack = _metaTrackId("Brand New", "Fresh Artist", "Debut");

        bytes32[] memory scrobbleIds = new bytes32[](2);
        uint64[] memory ts = new uint64[](2);
        scrobbleIds[0] = newTrack; ts[0] = 3000;
        scrobbleIds[1] = existing; ts[1] = 3100;

        vm.prank(sponsor);
        sc.registerAndScrobbleBatch(
            user,
            _b32(newTrack),
            _u8(3),
            _str("Brand New"),
            _str("Fresh Artist"),
            _str("Debut"),
            scrobbleIds,
            ts
        );

        assertTrue(sc.isRegistered(newTrack));
        assertTrue(sc.isRegistered(existing));
    }

    function test_registerAndScrobble_noNewTracks() public {
        bytes32 trackId = _registerTestTrack("Song", "Artist", "Album");

        bytes32[] memory empty32 = new bytes32[](0);
        uint8[] memory emptyU8 = new uint8[](0);
        string[] memory emptyStr = new string[](0);

        vm.prank(sponsor);
        sc.registerAndScrobbleBatch(
            user,
            empty32, emptyU8, emptyStr, emptyStr, emptyStr,
            _b32(trackId),
            _u64(4000)
        );
    }

    // ── trackId derivation ───────────────────────────────────────────────

    function test_trackId_mbid_derivation() public pure {
        bytes16 mbid = bytes16(hex"b1a9c02eb35c4f189f040e4d0e3409c3");
        bytes32 trackId = keccak256(abi.encode(uint8(1), mbid));
        assertTrue(trackId != bytes32(0));
    }

    function test_trackId_ipId_derivation() public pure {
        address ipId = 0x1234567890AbcdEF1234567890aBcdef12345678;
        bytes32 trackId = keccak256(abi.encode(uint8(2), ipId));
        assertTrue(trackId != bytes32(0));
    }

    function test_trackId_meta_derivation() public pure {
        bytes32 innerHash = keccak256(abi.encode("justice", "genesis", unicode"†"));
        bytes32 trackId = keccak256(abi.encode(uint8(3), innerHash));
        assertTrue(trackId != bytes32(0));
    }

    function test_trackId_no_cross_kind_collision() public pure {
        bytes16 val = bytes16(hex"00000000000000000000000000000001");
        bytes32 mbidId = keccak256(abi.encode(uint8(1), val));
        bytes32 ipIdId = keccak256(abi.encode(uint8(2), address(uint160(uint128(val)))));
        assertTrue(mbidId != ipIdId);
    }

    // ── MBID kind=1 not integrity checked (trusted sponsor) ─────────────

    function test_registerTrack_mbid_noIntegrityCheck() public {
        // For kind=1 (MBID), the contract trusts the sponsor's trackId
        // (can't derive from metadata alone — needs the external MBID)
        bytes32 trackId = _mbidTrackId(bytes16(keccak256("some-mbid")));

        vm.prank(sponsor);
        sc.registerTracksBatch(
            _b32(trackId),
            _u8(1),
            _str("Song"),
            _str("Artist"),
            _str("Album")
        );

        assertTrue(sc.isRegistered(trackId));
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    function _registerTestTrack(string memory title, string memory artist, string memory album)
        internal
        returns (bytes32 trackId)
    {
        trackId = _metaTrackId(title, artist, album);
        vm.prank(sponsor);
        sc.registerTracksBatch(_b32(trackId), _u8(3), _str(title), _str(artist), _str(album));
    }

    function _mbidTrackId(bytes16 mbid) internal pure returns (bytes32) {
        return keccak256(abi.encode(uint8(1), mbid));
    }

    function _metaTrackId(string memory title, string memory artist, string memory album)
        internal pure returns (bytes32)
    {
        bytes32 innerHash = keccak256(abi.encode(title, artist, album));
        return keccak256(abi.encode(uint8(3), innerHash));
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
