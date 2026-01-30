// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ScrobbleV2.sol";

/// @title ScrobbleV2 Gas Analysis
/// @notice Gas cost measurements for on-chain scrobble storage (MBID/ipId + metadata fallback)
contract ScrobbleV2GasTest is Test {
    ScrobbleV2 public scrobble;
    address public sponsorAddr = address(0xBEEF);
    address public user = address(0x1234);

    // Example MBID (UUID as bytes16)
    bytes16 constant SAMPLE_MBID = bytes16(hex"a1b2c3d4e5f6a7b8a1b2c3d4e5f6a7b8");

    function setUp() public {
        vm.warp(1_700_000_000);
        scrobble = new ScrobbleV2(sponsorAddr);
    }

    // ── MBID Batch ───────────────────────────────────────────────────────

    function testGas_Batch10_MBID() public { _testBatchMBID(10); }
    function testGas_Batch50_MBID() public { _testBatchMBID(50); }
    function testGas_Batch100_MBID() public { _testBatchMBID(100); }
    function testGas_Batch200_MBID() public { _testBatchMBID(200); }

    function _testBatchMBID(uint256 count) internal {
        bytes16[] memory mbids = new bytes16[](count);
        uint64[] memory timestamps = new uint64[](count);
        for (uint256 i = 0; i < count; i++) {
            mbids[i] = SAMPLE_MBID;
            timestamps[i] = uint64(block.timestamp - i * 180);
        }
        console.log("=== BATCH MBID ===");
        console.log("Count:", count);
        vm.prank(sponsorAddr);
        scrobble.submitBatchMBID(user, mbids, timestamps);
    }

    // ── ipId Batch ───────────────────────────────────────────────────────

    function testGas_Batch50_IPID() public {
        address[] memory ipIds = new address[](50);
        uint64[] memory timestamps = new uint64[](50);
        for (uint256 i = 0; i < 50; i++) {
            ipIds[i] = address(uint160(0xABCD0001 + i));
            timestamps[i] = uint64(block.timestamp - i * 180);
        }
        console.log("=== BATCH IPID (50) ===");
        vm.prank(sponsorAddr);
        scrobble.submitBatchIPId(user, ipIds, timestamps);
    }

    // ── Metadata Batch ───────────────────────────────────────────────────

    function testGas_Batch10_Metadata() public { _testBatchMetadata(10); }
    function testGas_Batch50_Metadata() public { _testBatchMetadata(50); }

    function _testBatchMetadata(uint256 count) internal {
        string[] memory titles = new string[](count);
        string[] memory artists = new string[](count);
        string[] memory albums = new string[](count);
        uint64[] memory timestamps = new uint64[](count);
        for (uint256 i = 0; i < count; i++) {
            titles[i] = string(abi.encodePacked("Track ", vm.toString(i + 1)));
            artists[i] = string(abi.encodePacked("Artist ", vm.toString(i % 10)));
            albums[i] = string(abi.encodePacked("Album ", vm.toString(i % 5)));
            timestamps[i] = uint64(block.timestamp - i * 180);
        }
        console.log("=== BATCH METADATA ===");
        console.log("Count:", count);
        vm.prank(sponsorAddr);
        scrobble.submitBatchMeta(user, titles, artists, albums, timestamps);
    }

    // ── Realistic Day ────────────────────────────────────────────────────

    function testGas_RealisticDay() public {
        console.log("=== REALISTIC DAY: 35 MBID + 15 metadata ===");

        bytes16[] memory mbids = new bytes16[](35);
        uint64[] memory mbidTs = new uint64[](35);
        for (uint256 i = 0; i < 35; i++) {
            mbids[i] = SAMPLE_MBID;
            mbidTs[i] = uint64(block.timestamp - i * 180);
        }
        vm.prank(sponsorAddr);
        scrobble.submitBatchMBID(user, mbids, mbidTs);

        string[] memory titles = new string[](15);
        string[] memory artists = new string[](15);
        string[] memory albums = new string[](15);
        uint64[] memory metaTs = new uint64[](15);
        for (uint256 i = 0; i < 15; i++) {
            titles[i] = "Local Track Mix";
            artists[i] = "Unknown";
            albums[i] = "2023";
            metaTs[i] = uint64(block.timestamp - (35 + i) * 180);
        }
        vm.prank(sponsorAddr);
        scrobble.submitBatchMeta(user, titles, artists, albums, metaTs);
    }

    // ── Auth Tests ───────────────────────────────────────────────────────

    function testRevert_UnauthorizedMBID() public {
        bytes16[] memory mbids = new bytes16[](1);
        uint64[] memory timestamps = new uint64[](1);
        mbids[0] = SAMPLE_MBID;
        timestamps[0] = uint64(block.timestamp);

        vm.expectRevert("unauthorized");
        scrobble.submitBatchMBID(user, mbids, timestamps);
    }

    function testRevert_UnauthorizedIPId() public {
        address[] memory ipIds = new address[](1);
        uint64[] memory timestamps = new uint64[](1);
        ipIds[0] = address(0x1);
        timestamps[0] = uint64(block.timestamp);

        vm.expectRevert("unauthorized");
        scrobble.submitBatchIPId(user, ipIds, timestamps);
    }

    function testRevert_BatchTooLarge_MBID() public {
        bytes16[] memory mbids = new bytes16[](201);
        uint64[] memory timestamps = new uint64[](201);

        vm.expectRevert("batch too large");
        vm.prank(sponsorAddr);
        scrobble.submitBatchMBID(user, mbids, timestamps);
    }

    function testRevert_BatchTooLarge_Meta() public {
        string[] memory t = new string[](51);
        string[] memory a = new string[](51);
        string[] memory al = new string[](51);
        uint64[] memory ts = new uint64[](51);

        vm.expectRevert("batch too large");
        vm.prank(sponsorAddr);
        scrobble.submitBatchMeta(user, t, a, al, ts);
    }

    function testRevert_TitleTooLong() public {
        string[] memory titles = new string[](1);
        string[] memory artists = new string[](1);
        string[] memory albums = new string[](1);
        uint64[] memory ts = new uint64[](1);

        titles[0] = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
        artists[0] = "X";
        albums[0] = "Y";
        ts[0] = uint64(block.timestamp);

        vm.expectRevert("title too long");
        vm.prank(sponsorAddr);
        scrobble.submitBatchMeta(user, titles, artists, albums, ts);
    }

    function testRevert_ZeroSponsor() public {
        vm.expectRevert("zero sponsor");
        new ScrobbleV2(address(0));
    }

    function testRevert_SetZeroSponsor() public {
        vm.expectRevert("zero sponsor");
        scrobble.setSponsor(address(0));
    }

    function testRevert_ZeroMBID() public {
        bytes16[] memory mbids = new bytes16[](1);
        uint64[] memory ts = new uint64[](1);
        mbids[0] = bytes16(0);
        ts[0] = uint64(block.timestamp);

        vm.expectRevert("zero mbid");
        vm.prank(sponsorAddr);
        scrobble.submitBatchMBID(user, mbids, ts);
    }

    function testRevert_ZeroIPId() public {
        address[] memory ipIds = new address[](1);
        uint64[] memory ts = new uint64[](1);
        ipIds[0] = address(0);
        ts[0] = uint64(block.timestamp);

        vm.expectRevert("zero ipId");
        vm.prank(sponsorAddr);
        scrobble.submitBatchIPId(user, ipIds, ts);
    }

    function testRevert_ZeroUser_MBID() public {
        bytes16[] memory mbids = new bytes16[](1);
        uint64[] memory ts = new uint64[](1);
        mbids[0] = SAMPLE_MBID;
        ts[0] = uint64(block.timestamp);

        vm.expectRevert("zero user");
        vm.prank(sponsorAddr);
        scrobble.submitBatchMBID(address(0), mbids, ts);
    }

    // ── Packing Helpers ──────────────────────────────────────────────────

    function testPackingHelpers() public view {
        bytes16 mbid = bytes16(hex"a1b2c3d4e5f6a7b8a1b2c3d4e5f6a7b8");
        bytes20 packed = scrobble.packMBID(mbid);
        assertEq(scrobble.unpackMBID(packed), mbid);

        address ipId = address(0x1234567890AbcdEF1234567890aBcdef12345678);
        bytes20 packedIp = scrobble.packIPId(ipId);
        assertEq(scrobble.unpackIPId(packedIp), ipId);
    }

    // ── Query Tests ──────────────────────────────────────────────────────

    function testQuery_MBIDScrobbles() public {
        bytes16[] memory mbids = new bytes16[](3);
        uint64[] memory timestamps = new uint64[](3);
        for (uint256 i = 0; i < 3; i++) {
            mbids[i] = SAMPLE_MBID;
            timestamps[i] = uint64(block.timestamp - i * 180);
        }
        vm.prank(sponsorAddr);
        scrobble.submitBatchMBID(user, mbids, timestamps);

        assertEq(scrobble.idScrobbleCount(user), 3);
        ScrobbleV2.IdScrobble[] memory result = scrobble.getIdScrobbles(user, 0, 10);
        assertEq(result.length, 3);
        assertEq(result[0].kind, scrobble.KIND_MBID());
        assertEq(result[0].id, bytes20(SAMPLE_MBID));
    }

    function testQuery_MixedIdScrobbles() public {
        // Submit 2 MBIDs then 2 ipIds — both go into idScrobbles
        bytes16[] memory mbids = new bytes16[](2);
        uint64[] memory mbidTs = new uint64[](2);
        mbids[0] = SAMPLE_MBID;
        mbids[1] = bytes16(hex"11223344556677889900aabbccddeeff");
        mbidTs[0] = uint64(block.timestamp);
        mbidTs[1] = uint64(block.timestamp - 180);

        vm.prank(sponsorAddr);
        scrobble.submitBatchMBID(user, mbids, mbidTs);

        address[] memory ipIds = new address[](2);
        uint64[] memory ipTs = new uint64[](2);
        ipIds[0] = address(0xdead);
        ipIds[1] = address(0xbeef);
        ipTs[0] = uint64(block.timestamp - 360);
        ipTs[1] = uint64(block.timestamp - 540);

        vm.prank(sponsorAddr);
        scrobble.submitBatchIPId(user, ipIds, ipTs);

        assertEq(scrobble.idScrobbleCount(user), 4);
        ScrobbleV2.IdScrobble[] memory all = scrobble.getIdScrobbles(user, 0, 10);
        assertEq(all[0].kind, scrobble.KIND_MBID());
        assertEq(all[2].kind, scrobble.KIND_IPID());
    }

    function testQuery_Pagination() public {
        bytes16[] memory mbids = new bytes16[](5);
        uint64[] memory timestamps = new uint64[](5);
        for (uint256 i = 0; i < 5; i++) {
            mbids[i] = SAMPLE_MBID;
            timestamps[i] = uint64(block.timestamp - i * 180);
        }
        vm.prank(sponsorAddr);
        scrobble.submitBatchMBID(user, mbids, timestamps);

        assertEq(scrobble.getIdScrobbles(user, 0, 2).length, 2);
        assertEq(scrobble.getIdScrobbles(user, 2, 2).length, 2);
        assertEq(scrobble.getIdScrobbles(user, 4, 10).length, 1);
        assertEq(scrobble.getIdScrobbles(user, 100, 10).length, 0);
    }

    function testSponsorUpdate() public {
        address newSponsor = address(0xDEAD);
        scrobble.setSponsor(newSponsor);
        assertEq(scrobble.sponsor(), newSponsor);

        bytes16[] memory mbids = new bytes16[](1);
        uint64[] memory ts = new uint64[](1);
        mbids[0] = SAMPLE_MBID;
        ts[0] = uint64(block.timestamp);

        vm.expectRevert("unauthorized");
        vm.prank(sponsorAddr);
        scrobble.submitBatchMBID(user, mbids, ts);

        vm.prank(newSponsor);
        scrobble.submitBatchMBID(user, mbids, ts);
        assertEq(scrobble.idScrobbleCount(user), 1);
    }
}
