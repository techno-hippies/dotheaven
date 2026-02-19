// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";
import {StudyAttemptsV1} from "../src/StudyAttemptsV1.sol";

contract StudyAttemptsV1Test is Test {
    StudyAttemptsV1 att;

    address deployer = address(0xA11CE);
    address user = address(0xC0FFEE);

    function setUp() public {
        vm.prank(deployer);
        att = new StudyAttemptsV1();
    }

    function test_constructor() public view {
        assertEq(att.owner(), deployer);
    }

    function test_submitAttempts_fromUser() public {
        bytes32[] memory studySetKeys = new bytes32[](2);
        bytes32[] memory questionIds = new bytes32[](2);
        uint8[] memory ratings = new uint8[](2);
        uint16[] memory scores = new uint16[](2);
        uint64[] memory timestamps = new uint64[](2);

        studySetKeys[0] = keccak256("set-1");
        studySetKeys[1] = keccak256("set-2");
        questionIds[0] = keccak256("q-1");
        questionIds[1] = keccak256("q-2");
        ratings[0] = 3;
        ratings[1] = 4;
        scores[0] = 10000;
        scores[1] = 8000;
        timestamps[0] = 1_700_000_001;
        timestamps[1] = 1_700_000_002;

        vm.prank(user);
        att.submitAttempts(user, studySetKeys, questionIds, ratings, scores, timestamps);
    }

    function test_submitAttempts_wrongSender_reverts() public {
        bytes32[] memory studySetKeys = new bytes32[](1);
        bytes32[] memory questionIds = new bytes32[](1);
        uint8[] memory ratings = new uint8[](1);
        uint16[] memory scores = new uint16[](1);
        uint64[] memory timestamps = new uint64[](1);

        studySetKeys[0] = keccak256("set");
        questionIds[0] = keccak256("q");
        ratings[0] = 3;
        scores[0] = 10000;
        timestamps[0] = 1_700_000_001;

        vm.prank(address(0xBAD));
        vm.expectRevert(StudyAttemptsV1.NotUserSender.selector);
        att.submitAttempts(user, studySetKeys, questionIds, ratings, scores, timestamps);
    }

    function test_submitAttempts_validation_reverts() public {
        bytes32[] memory studySetKeys = new bytes32[](1);
        bytes32[] memory questionIds = new bytes32[](1);
        uint8[] memory ratings = new uint8[](1);
        uint16[] memory scores = new uint16[](1);
        uint64[] memory timestamps = new uint64[](1);

        studySetKeys[0] = keccak256("set");
        questionIds[0] = keccak256("q");
        ratings[0] = 3;
        scores[0] = 10000;
        timestamps[0] = 1_700_000_001;

        // length mismatch
        bytes32[] memory emptyQ = new bytes32[](0);
        vm.prank(user);
        vm.expectRevert("length mismatch");
        att.submitAttempts(user, studySetKeys, emptyQ, ratings, scores, timestamps);

        // bad rating
        ratings[0] = 0;
        vm.prank(user);
        vm.expectRevert("bad rating");
        att.submitAttempts(user, studySetKeys, questionIds, ratings, scores, timestamps);
        ratings[0] = 3;

        // bad score
        scores[0] = 10001;
        vm.prank(user);
        vm.expectRevert("bad score");
        att.submitAttempts(user, studySetKeys, questionIds, ratings, scores, timestamps);
    }

    function test_submitAttempts_batchTooLarge_reverts() public {
        uint256 len = att.MAX_ATTEMPTS() + 1;
        bytes32[] memory studySetKeys = new bytes32[](len);
        bytes32[] memory questionIds = new bytes32[](len);
        uint8[] memory ratings = new uint8[](len);
        uint16[] memory scores = new uint16[](len);
        uint64[] memory timestamps = new uint64[](len);

        for (uint256 i; i < len; ) {
            studySetKeys[i] = keccak256(abi.encode("set", i));
            questionIds[i] = keccak256(abi.encode("q", i));
            ratings[i] = 3;
            scores[i] = 9000;
            timestamps[i] = uint64(1_700_000_000 + i);
            unchecked {
                ++i;
            }
        }

        vm.prank(user);
        vm.expectRevert("batch too large");
        att.submitAttempts(user, studySetKeys, questionIds, ratings, scores, timestamps);
    }

    function test_transferOwnership() public {
        address newOwner = address(0xDEAD);

        vm.prank(deployer);
        att.transferOwnership(newOwner);
        assertEq(att.owner(), newOwner);
    }
}
