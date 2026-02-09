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
import { FeedPost } from '../components/FeedPost';
import { useAuth } from '../providers/AuthProvider';
import { DrawerContext } from '../navigation/TabNavigator';
import { fetchFeedPosts, timeAgo, type FeedPostData } from '../lib/posts';
import { colors } from '../lib/theme';
import { TabBar } from '../ui';

type FeedTab = 'foryou' | 'following';

export const FeedScreen: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const drawer = useContext(DrawerContext);
  const [activeTab, setActiveTab] = useState<FeedTab>('foryou');
  const [posts, setPosts] = useState<FeedPostData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
        isAuthenticated={isAuthenticated}
        onAvatarPress={drawer.open}
      />

      <TabBar
        tabs={[
          { key: 'foryou', label: 'For you' },
          { key: 'following', label: 'Following' },
        ]}
        activeTab={activeTab}
        onTabPress={(key) => setActiveTab(key as FeedTab)}
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
  listContent: {
    paddingBottom: 140,
  },
});
