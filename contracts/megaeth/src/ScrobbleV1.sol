// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ScrobbleV1
/// @notice Minimal on-chain scrobble log on MegaETH.
///   Sponsor PKP calls `submitBatch` on behalf of users.
///   No storage — just events for subgraph indexing.
///   Gas is ~free on MegaETH so no access control needed
///   (spam costs the spammer gas, events are self-authenticating via signature check in Lit Action).
contract ScrobbleV1 {
    /// @notice Emitted when a scrobble batch is submitted.
    /// @param user      The user's wallet address (indexed for subgraph filtering)
    /// @param startTs   Unix timestamp of earliest track in batch
    /// @param endTs     Unix timestamp of latest track in batch
    /// @param count     Number of tracks in the batch
    /// @param cid       IPFS CID of the full batch JSON (pinned to Filebase)
    /// @param batchHash SHA-256 hash of the batch JSON (for integrity verification)
    event ScrobbleBatch(
        address indexed user,
        uint64  startTs,
        uint64  endTs,
        uint32  count,
        string  cid,
        bytes32 batchHash
    );

    /// @notice Submit a scrobble batch. Called by sponsor PKP after verifying user signature.
    /// @param user      The user's wallet address
    /// @param startTs   Unix timestamp of earliest track
    /// @param endTs     Unix timestamp of latest track
    /// @param count     Number of tracks
    /// @param cid       IPFS CID of batch JSON
    /// @param batchHash SHA-256 hash of batch JSON
    function submitBatch(
        address user,
        uint64  startTs,
        uint64  endTs,
        uint32  count,
        string  calldata cid,
        bytes32 batchHash
    ) external {
        emit ScrobbleBatch(user, startTs, endTs, count, cid, batchHash);
    }
}
