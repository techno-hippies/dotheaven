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
import { useNavigation, CommonActions } from '@react-navigation/native';
import { Plus } from 'phosphor-react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/TabNavigator';
import { MobileHeader } from '../components/MobileHeader';
import { LiveRoomsRow, type LiveRoom } from '../components/LiveRoomsRow';
import { FeedPost } from '../components/FeedPost';
import { useAuth } from '../providers/AuthProvider';
import { DrawerContext } from '../navigation/DrawerContext';
import { fetchFeedPosts, timeAgo, type FeedPostData } from '../lib/posts';
import { fetchActiveRooms, type ActiveRoom } from '../lib/rooms';
import { colors } from '../lib/theme';

export const FeedScreen: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const drawer = useContext(DrawerContext);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [posts, setPosts] = useState<FeedPostData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [liveRooms, setLiveRooms] = useState<LiveRoom[]>([]);

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

  const loadRooms = useCallback(async () => {
    try {
      const rooms = await fetchActiveRooms();
      // Map to LiveRoom format (TODO: resolve host names/avatars)
      setLiveRooms(
        rooms.map((r) => ({
          id: r.room_id,
          hostName: `${r.host_wallet.slice(0, 6)}...${r.host_wallet.slice(-4)}`,
          participantCount: r.participant_count,
        }))
      );
    } catch (err) {
      console.error('Failed to load rooms:', err);
    }
  }, []);

  useEffect(() => {
    loadPosts();
    loadRooms();
    const postsInterval = setInterval(loadPosts, 30_000);
    const roomsInterval = setInterval(loadRooms, 15_000); // Refresh rooms more frequently
    return () => {
      clearInterval(postsInterval);
      clearInterval(roomsInterval);
    };
  }, [loadPosts, loadRooms]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadPosts();
    loadRooms();
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
            onCreateRoom={() => {
              navigation.dispatch(
                CommonActions.navigate({
                  name: 'Room',
                  params: { mode: 'create', visibility: 'open' },
                })
              );
            }}
            onRoomPress={(id) => {
              navigation.dispatch(
                CommonActions.navigate({
                  name: 'Room',
                  params: { mode: 'join', roomId: id },
                })
              );
            }}
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

      {/* Compose FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('Compose')}
        activeOpacity={0.8}
      >
        <Plus size={28} color={colors.white} weight="bold" />
      </TouchableOpacity>
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
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accentBlue,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
});
