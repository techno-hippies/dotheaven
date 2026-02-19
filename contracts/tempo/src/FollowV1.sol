// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title FollowV1 — On-chain social follow graph (Tempo)
/// @notice User-authorized follow/unfollow with on-chain counts.
/// @dev Tempo fee sponsorship pays gas, but msg.sender remains the user account.
contract FollowV1 {
    // ── Errors ───────────────────────────────────────────────────────────

    error Unauthorized();
    error ZeroAddress();
    error BadBatchSize();

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

    /// @notice Follow `followee` as msg.sender.
    function follow(address followee) external {
        _follow(msg.sender, followee);
    }

    /// @notice Unfollow `followee` as msg.sender.
    function unfollow(address followee) external {
        _unfollow(msg.sender, followee);
    }

    /// @notice Follow on behalf of `follower`, only when caller is that same account.
    function followFor(address follower, address followee) external {
        if (msg.sender != follower) revert Unauthorized();
        _follow(follower, followee);
    }

    /// @notice Unfollow on behalf of `follower`, only when caller is that same account.
    function unfollowFor(address follower, address followee) external {
        if (msg.sender != follower) revert Unauthorized();
        _unfollow(follower, followee);
    }

    /// @notice Batch follow as msg.sender.
    function followBatch(address[] calldata followees) external {
        _followBatch(msg.sender, followees);
    }

    /// @notice Batch follow on behalf of `follower`, only when caller is that same account.
    function followBatchFor(address follower, address[] calldata followees) external {
        if (msg.sender != follower) revert Unauthorized();
        _followBatch(follower, followees);
    }

    function _follow(address follower, address followee) internal {
        if (follower == address(0) || followee == address(0)) revert ZeroAddress();
        if (follower == followee || follows[follower][followee]) return;

        follows[follower][followee] = true;
        unchecked {
            ++followerCount[followee];
            ++followingCount[follower];
        }

        emit Followed(follower, followee);
    }

    function _unfollow(address follower, address followee) internal {
        if (follower == address(0) || followee == address(0)) revert ZeroAddress();
        if (!follows[follower][followee]) return;

        follows[follower][followee] = false;
        unchecked {
            --followerCount[followee];
            --followingCount[follower];
        }

        emit Unfollowed(follower, followee);
    }

    function _followBatch(address follower, address[] calldata followees) internal {
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
            unchecked {
                ++i;
            }
        }
    }

    // ── Views ────────────────────────────────────────────────────────────

    function getFollowCounts(address user) external view returns (uint256 followers, uint256 following) {
        return (followerCount[user], followingCount[user]);
    }
}
