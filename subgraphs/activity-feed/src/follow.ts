import {
  Followed as FollowedEvent,
  Unfollowed as UnfollowedEvent,
} from "../generated/FollowV1/FollowV1";
import { Follow, UserFollowStats } from "../generated/schema";

function getOrCreateStats(address: string): UserFollowStats {
  let stats = UserFollowStats.load(address);
  if (stats == null) {
    stats = new UserFollowStats(address);
    stats.followerCount = 0;
    stats.followingCount = 0;
  }
  return stats;
}

export function handleFollowed(event: FollowedEvent): void {
  let follower = event.params.follower.toHexString();
  let followee = event.params.followee.toHexString();
  let id = follower + "-" + followee;

  let follow = new Follow(id);
  follow.follower = event.params.follower;
  follow.followee = event.params.followee;
  follow.active = true;
  follow.blockTimestamp = event.block.timestamp;
  follow.transactionHash = event.transaction.hash;
  follow.save();

  let followerStats = getOrCreateStats(follower);
  followerStats.followingCount = followerStats.followingCount + 1;
  followerStats.save();

  let followeeStats = getOrCreateStats(followee);
  followeeStats.followerCount = followeeStats.followerCount + 1;
  followeeStats.save();
}

export function handleUnfollowed(event: UnfollowedEvent): void {
  let follower = event.params.follower.toHexString();
  let followee = event.params.followee.toHexString();
  let id = follower + "-" + followee;

  let follow = Follow.load(id);
  if (follow != null) {
    follow.active = false;
    follow.blockTimestamp = event.block.timestamp;
    follow.transactionHash = event.transaction.hash;
    follow.save();
  }

  let followerStats = getOrCreateStats(follower);
  if (followerStats.followingCount > 0) {
    followerStats.followingCount = followerStats.followingCount - 1;
  }
  followerStats.save();

  let followeeStats = getOrCreateStats(followee);
  if (followeeStats.followerCount > 0) {
    followeeStats.followerCount = followeeStats.followerCount - 1;
  }
  followeeStats.save();
}
