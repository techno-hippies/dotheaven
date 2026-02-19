// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";
import {StudySetRegistryV1} from "../src/StudySetRegistryV1.sol";

contract MockTip20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
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

contract StudySetRegistryV1Test is Test {
    StudySetRegistryV1 reg;
    MockTip20 token;

    address deployer = address(0xA11CE);
    address operator = address(0xB0B);
    address user = address(0xC0FFEE);
    address treasury = address(0xFEE1);

    function setUp() public {
        token = new MockTip20();
        token.mint(user, 10_000_000);

        vm.prank(deployer);
        reg = new StudySetRegistryV1(operator, address(token), treasury);
    }

    function test_constructor() public view {
        assertEq(reg.owner(), deployer);
        assertTrue(reg.isOperator(operator));
        assertEq(address(reg.paymentToken()), address(token));
        assertEq(reg.treasury(), treasury);
        assertEq(reg.CREDIT_PRICE(), 100_000);
        assertEq(reg.CREDITS_PER_FULFILL(), 1);
    }

    function test_buyCredits_recordsBalanceAndTransfersFunds() public {
        uint256 creditsToBuy = 3;
        uint256 totalCost = creditsToBuy * reg.CREDIT_PRICE();

        vm.prank(user);
        token.approve(address(reg), totalCost);

        vm.prank(user);
        reg.buyCredits(creditsToBuy);

        assertEq(reg.credits(user), creditsToBuy);
        assertEq(token.balanceOf(user), 10_000_000 - totalCost);
        assertEq(token.balanceOf(treasury), totalCost);
    }

    function test_buyCredits_validation_reverts() public {
        vm.prank(user);
        vm.expectRevert("zero credits");
        reg.buyCredits(0);

        vm.prank(user);
        vm.expectRevert("allowance");
        reg.buyCredits(1);
    }

    function test_fulfillFromCredit_operator_firstWriteWins() public {
        uint256 totalCost = reg.CREDIT_PRICE() * 2;
        vm.prank(user);
        token.approve(address(reg), totalCost);
        vm.prank(user);
        reg.buyCredits(2);

        bytes32 trackId = keccak256("track-1");
        string memory lang = "en";
        uint8 version = 1;
        string memory studySetRef = "ar://study-set-data-item-id";
        bytes32 studySetHash = keccak256(bytes("{\"specVersion\":\"exercise-pack-v1\"}"));

        vm.prank(operator);
        bytes32 studySetKey = reg.fulfillFromCredit(user, trackId, lang, version, studySetRef, studySetHash);

        (string memory storedRef, bytes32 storedHash, address submitter, uint64 createdAt, bool exists) =
            reg.studySets(studySetKey);
        assertEq(storedRef, studySetRef);
        assertEq(storedHash, studySetHash);
        assertEq(submitter, operator);
        assertEq(reg.studySetPaidBy(studySetKey), user);
        assertEq(createdAt, uint64(block.timestamp));
        assertTrue(exists);
        assertEq(reg.credits(user), 1);

        vm.prank(operator);
        vm.expectRevert("study set already set");
        reg.fulfillFromCredit(user, trackId, lang, version, "ar://other", keccak256("other"));
        assertEq(reg.credits(user), 1);
        assertEq(reg.studySetPaidBy(studySetKey), user);
    }

    function test_fulfillFromCredit_notOperator_reverts() public {
        uint256 creditPrice = reg.CREDIT_PRICE();

        vm.prank(user);
        token.approve(address(reg), creditPrice);
        vm.prank(user);
        reg.buyCredits(1);

        vm.prank(user);
        vm.expectRevert(StudySetRegistryV1.Unauthorized.selector);
        reg.fulfillFromCredit(user, keccak256("track"), "en", 1, "ar://x", keccak256("h"));
    }

    function test_fulfillFromCredit_validation_reverts() public {
        uint256 creditPrice = reg.CREDIT_PRICE();

        vm.prank(user);
        token.approve(address(reg), creditPrice);
        vm.prank(user);
        reg.buyCredits(1);

        vm.prank(operator);
        vm.expectRevert("zero user");
        reg.fulfillFromCredit(address(0), keccak256("track"), "en", 1, "ar://x", keccak256("h"));

        vm.prank(operator);
        vm.expectRevert("zero trackId");
        reg.fulfillFromCredit(user, bytes32(0), "en", 1, "ar://x", keccak256("h"));

        vm.prank(operator);
        vm.expectRevert("empty lang");
        reg.fulfillFromCredit(user, keccak256("track"), "", 1, "ar://x", keccak256("h"));

        vm.prank(operator);
        vm.expectRevert("zero version");
        reg.fulfillFromCredit(user, keccak256("track"), "en", 0, "ar://x", keccak256("h"));

        vm.prank(operator);
        vm.expectRevert("empty ref");
        reg.fulfillFromCredit(user, keccak256("track"), "en", 1, "", keccak256("h"));

        vm.prank(operator);
        vm.expectRevert("zero hash");
        reg.fulfillFromCredit(user, keccak256("track"), "en", 1, "ar://x", bytes32(0));
    }

    function test_fulfillFromCredit_insufficientCredits_reverts() public {
        vm.prank(operator);
        vm.expectRevert("insufficient credits");
        reg.fulfillFromCredit(user, keccak256("track"), "en", 1, "ar://x", keccak256("h"));
    }

    function test_transferOwnership_and_setOperator() public {
        address newOwner = address(0xDEAD);
        address newOperator = address(0xBEEF);

        vm.prank(deployer);
        reg.transferOwnership(newOwner);
        assertEq(reg.owner(), newOwner);

        vm.prank(newOwner);
        reg.setOperator(newOperator, true);
        assertTrue(reg.isOperator(newOperator));
    }

    function test_onlyOwner_guards() public {
        vm.expectRevert(StudySetRegistryV1.Unauthorized.selector);
        reg.transferOwnership(user);

        vm.expectRevert(StudySetRegistryV1.Unauthorized.selector);
        reg.setOperator(user, true);
    }
}
