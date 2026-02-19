// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title FollowV1 — On-chain social follow graph
/// @notice Sponsor-gated follow/unfollow with on-chain counts.
contract FollowV1 {
    // ── Errors ───────────────────────────────────────────────────────────

    error Unauthorized();
    error ZeroAddress();
    error BadBatchSize();

    // ── Auth ─────────────────────────────────────────────────────────────

    address public owner;
    mapping(address => bool) public isSponsor;

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlySponsor() {
        if (!isSponsor[msg.sender]) revert Unauthorized();
        _;
    }

    event OwnerUpdated(address indexed newOwner);
    event SponsorUpdated(address indexed sponsor, bool active);

    constructor(address _sponsor) {
        if (_sponsor == address(0)) revert ZeroAddress();

        owner = msg.sender;
        isSponsor[msg.sender] = true;
        isSponsor[_sponsor] = true;

        emit OwnerUpdated(msg.sender);
        emit SponsorUpdated(msg.sender, true);
        emit SponsorUpdated(_sponsor, true);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        owner = newOwner;
        emit OwnerUpdated(newOwner);
    }

    function setSponsor(address sponsor, bool active) external onlyOwner {
        if (sponsor == address(0)) revert ZeroAddress();
        isSponsor[sponsor] = active;
        emit SponsorUpdated(sponsor, active);
    }

    // ── Limits ───────────────────────────────────────────────────────────

    uint256 public constant MAX_BATCH = 50;

    // ── State ────────────────────────────────────────────────────────────

    mapping(address => mapping(address => bool)) public follows;
    mapping(address => uint256) public followerCount;
    mapping(address => uint256) public followingCount;

    // ── Events ───────────────────────────────────────────────────────────

    event Followed(address indexed follower, address indexed followee);
    event Unfollowed(address indexed follower, address indexed followee);

    // ── Follow ───────────────────────────────────────────────────────────

    function followFor(address follower, address followee) external onlySponsor {
        if (follower == address(0) || followee == address(0)) revert ZeroAddress();
        if (follower == followee || follows[follower][followee]) return;

        follows[follower][followee] = true;
        unchecked {
            ++followerCount[followee];
            ++followingCount[follower];
        }

        emit Followed(follower, followee);
    }

    function unfollowFor(address follower, address followee) external onlySponsor {
        if (follower == address(0) || followee == address(0)) revert ZeroAddress();
        if (!follows[follower][followee]) return;

        follows[follower][followee] = false;
        unchecked {
            --followerCount[followee];
            --followingCount[follower];
        }

        emit Unfollowed(follower, followee);
    }

    function followBatchFor(address follower, address[] calldata followees) external onlySponsor {
        if (follower == address(0)) revert ZeroAddress();
        uint256 n = followees.length;
        if (n == 0 || n > MAX_BATCH) revert BadBatchSize();
        for (uint256 i; i < n; ) {
            address followee = followees[i];
            if (followee == address(0)) revert ZeroAddress();
            if (follower != followee && !follows[follower][followee]) {
                follows[follower][followee] = true;
                unchecked {
                    ++followerCount[followee];
                    ++followingCount[follower];
                }
                emit Followed(follower, followee);
            }
            unchecked { ++i; }
        }
    }

    // ── Views ────────────────────────────────────────────────────────────

    function getFollowCounts(address user) external view returns (uint256 followers, uint256 following) {
        return (followerCount[user], followingCount[user]);
    }
}
