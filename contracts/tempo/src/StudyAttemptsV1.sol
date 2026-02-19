// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title StudyAttemptsV1
/// @notice Event-only attempt provenance for learning sessions.
/// @dev FSRS scheduling state is intentionally kept off-chain in V1.
contract StudyAttemptsV1 {
    // ── Auth ─────────────────────────────────────────────────────────────

    address public owner;

    error Unauthorized();
    error ZeroAddress();
    error NotUserSender();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyUser(address user) {
        if (user == address(0)) revert ZeroAddress();
        if (msg.sender != user) revert NotUserSender();
        _;
    }

    event OwnerUpdated(address indexed newOwner);
 
    constructor() {
        owner = msg.sender;
        emit OwnerUpdated(msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        owner = newOwner;
        emit OwnerUpdated(newOwner);
    }

    // ── Attempts ─────────────────────────────────────────────────────────

    uint256 public constant MAX_ATTEMPTS = 200;

    event AttemptSubmitted(
        address indexed user,
        bytes32 indexed studySetKey,
        bytes32 indexed questionId,
        uint8 rating,
        uint16 score,
        uint64 timestamp
    );

    /// @notice Submit a batch of attempts.
    /// @dev rating is FSRS-style: 1=Again, 2=Hard, 3=Good, 4=Easy.
    function submitAttempts(
        address user,
        bytes32[] calldata studySetKeys,
        bytes32[] calldata questionIds,
        uint8[] calldata ratings,
        uint16[] calldata scores,
        uint64[] calldata timestamps
    ) external onlyUser(user) {
        uint256 len = studySetKeys.length;
        require(
            len == questionIds.length &&
            len == ratings.length &&
            len == scores.length &&
            len == timestamps.length,
            "length mismatch"
        );
        require(len <= MAX_ATTEMPTS, "batch too large");

        for (uint256 i; i < len; ) {
            require(studySetKeys[i] != bytes32(0), "zero studySetKey");
            require(questionIds[i] != bytes32(0), "zero questionId");

            uint8 rating = ratings[i];
            require(rating >= 1 && rating <= 4, "bad rating");

            uint16 score = scores[i];
            require(score <= 10000, "bad score");

            emit AttemptSubmitted(user, studySetKeys[i], questionIds[i], rating, score, timestamps[i]);

            unchecked {
                ++i;
            }
        }
    }
}
