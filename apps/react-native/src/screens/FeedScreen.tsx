import React, { useState, useEffect, useCallback, useContext } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MobileHeader } from '../components/MobileHeader';
import { LiveRoomsRow, type LiveRoom } from '../components/LiveRoomsRow';
import { FeedPost } from '../components/FeedPost';
import { useAuth } from '../providers/AuthProvider';
import { DrawerContext } from '../navigation/TabNavigator';
import { fetchFeedPosts, timeAgo, type FeedPostData } from '../lib/posts';
import { colors } from '../lib/theme';

export const FeedScreen: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const drawer = useContext(DrawerContext);
  const [posts, setPosts] = useState<FeedPostData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // TODO: fetch live rooms from backend
  const [liveRooms] = useState<LiveRoom[]>([]);

  const loadPosts = useCallback(async () => {
    try {
      const data = await fetchFeedPosts({ first: 50 });
      setPosts(data);
    } catch (err) {
      console.error('Failed to load posts:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadPosts();
    const interval = setInterval(loadPosts, 30_000);
    return () => clearInterval(interval);
  }, [loadPosts]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadPosts();
  };

  return (
    <View style={styles.container}>
      <MobileHeader
        title="Home"
        isAuthenticated={isAuthenticated}
        onAvatarPress={drawer.open}
      />

      {/* Posts */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="small" color={colors.accentBlue} />
          <Text style={styles.loadingText}>Loading posts...</Text>
        </View>
      ) : posts.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No posts yet</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.accentBlue}
              colors={[colors.accentBlue]}
            />
          }
        >
          {/* Live rooms row */}
          <LiveRoomsRow
            rooms={liveRooms}
            onCreateRoom={() => console.log('[FeedScreen] Create room')}
            onRoomPress={(id) => console.log('[FeedScreen] Join room:', id)}
          />
          {(liveRooms.length > 0 || true) && <View style={styles.separator} />}

          {posts.map((post) => (
            <FeedPost
              key={post.postId}
              authorName={post.authorName}
              authorHandle={post.authorHandle}
              authorAvatarUrl={post.authorAvatarUrl}
              timestamp={timeAgo(post.blockTimestamp)}
              text={post.text}
              photoUrl={post.photoUrls?.[0]}
              likes={post.likeCount}
              comments={post.commentCount}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPage,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  emptyText: {
    fontSize: 16,
    color: colors.textMuted,
  },
  separator: {
    height: 1,
    backgroundColor: colors.borderSubtle,
  },
  listContent: {
    paddingBottom: 140,
  },
});
