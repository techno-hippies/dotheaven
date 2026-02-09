import React, { useState, useEffect, useCallback, useContext } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MobileHeader } from '../components/MobileHeader';
import { FeedPost } from '../components/FeedPost';
import { useAuth } from '../providers/AuthProvider';
import { DrawerContext } from '../navigation/TabNavigator';
import { fetchFeedPosts, timeAgo, type FeedPostData } from '../lib/posts';
import { colors } from '../lib/theme';

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

      {/* Feed tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={styles.tabButton}
          onPress={() => setActiveTab('foryou')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, activeTab === 'foryou' && styles.tabTextActive]}>
            For you
          </Text>
          {activeTab === 'foryou' ? <View style={styles.tabIndicator} /> : null}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tabButton}
          onPress={() => setActiveTab('following')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, activeTab === 'following' && styles.tabTextActive]}>
            Following
          </Text>
          {activeTab === 'following' ? <View style={styles.tabIndicator} /> : null}
        </TouchableOpacity>
      </View>

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
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    position: 'relative',
    paddingHorizontal: 8,
  },
  tabText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.textPrimary,
  },
  tabIndicator: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    backgroundColor: colors.accentBlue,
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
