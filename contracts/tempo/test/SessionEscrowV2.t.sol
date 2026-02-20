// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import "../src/SessionEscrowV2.sol";

contract MockTip20V2 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "allowance");
        require(balanceOf[from] >= amount, "balance");

        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }

        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract SessionEscrowV2Test is Test {
    SessionEscrowV2 escrow;
    MockTip20V2 token;

    address oracle = makeAddr("oracle");
    address treasury = makeAddr("treasury");
    address host = makeAddr("host");
    address host2 = makeAddr("host2");
    address guest = makeAddr("guest");

    uint16 feeBps = 300;
    uint48 challengeWindow = 6 hours;
    uint256 challengeBond = 10_000_000;
    uint16 lateCancelPenaltyBps = 2000;
    uint48 noAttestBuffer = 24 hours;
    uint48 disputeTimeout = 7 days;

    uint256 constant PRICE = 25_000_000;

    function setUp() public {
        token = new MockTip20V2();

        escrow = new SessionEscrowV2(
            address(token),
            oracle,
            treasury,
            feeBps,
            challengeWindow,
            challengeBond,
            lateCancelPenaltyBps,
            noAttestBuffer,
            disputeTimeout
        );

        token.mint(guest, 1_000_000_000);
        token.mint(host, 100_000_000);
        token.mint(host2, 100_000_000);

        vm.prank(guest);
        token.approve(address(escrow), type(uint256).max);

        vm.prank(host);
        token.approve(address(escrow), type(uint256).max);

        vm.prank(host2);
        token.approve(address(escrow), type(uint256).max);

        vm.prank(host);
        escrow.setHostBasePrice(PRICE);
    }

    function _createWithPrice(address creator, uint48 startTime, uint256 price) internal returns (uint256 slotId) {
        vm.prank(creator);
        slotId = escrow.createSlotWithPrice(startTime, 30, 10, 25, 60, price);
    }

    function test_createSlotWithPrice_snapshotsExplicitPrice() public {
        uint48 start = uint48(block.timestamp + 3 hours);
        uint256 customPrice = 33_000_000;

        uint256 slotId = _createWithPrice(host, start, customPrice);
        SessionEscrowV2.SessionSlot memory s = escrow.getSlot(slotId);

        assertEq(s.price, customPrice);
        assertEq(s.host, host);
        assertEq(uint256(s.startTime), uint256(start));
    }

    function test_createSlotWithPrice_allowsDuplicateStarts() public {
        uint48 start = uint48(block.timestamp + 3 hours);
        uint256 firstId = _createWithPrice(host, start, 30_000_000);
        uint256 secondId = _createWithPrice(host, start, 31_000_000);
        SessionEscrowV2.SessionSlot memory s = escrow.getSlot(secondId);

        assertGt(secondId, firstId);
        assertEq(s.price, 31_000_000);
    }
}
