import React, { useState, useEffect, useCallback, useContext } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Users } from 'phosphor-react-native';
import { MobileHeader } from '../components/MobileHeader';
import { CommunityCard } from '../components/CommunityCard';
import { useAuth } from '../providers/AuthProvider';
import { DrawerContext } from '../navigation/TabNavigator';
import {
  fetchCommunityMembers,
  fetchUserLocationCityId,
  type CommunityMember,
} from '../lib/community';
import { colors, fontSize } from '../lib/theme';
import { Spinner } from '../ui';

type CommunityTab = 'all' | 'nearby';

export const CommunityScreen: React.FC = () => {
  const { isAuthenticated, pkpInfo } = useAuth();
  const drawer = useContext(DrawerContext);
  const [activeTab, setActiveTab] = useState<CommunityTab>('all');
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userCityId, setUserCityId] = useState<string | null>(null);

  // Fetch user's location for Nearby tab
  useEffect(() => {
    if (pkpInfo?.ethAddress) {
      fetchUserLocationCityId(pkpInfo.ethAddress).then(setUserCityId).catch(() => {});
    }
  }, [pkpInfo?.ethAddress]);

  const loadMembers = useCallback(async () => {
    try {
      const opts =
        activeTab === 'nearby' && userCityId
          ? { locationCityId: userCityId }
          : {};
      const data = await fetchCommunityMembers({ first: 50, ...opts });
      setMembers(data);
    } catch (err) {
      console.error('Failed to load community:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab, userCityId]);

  useEffect(() => {
    setLoading(true);
    loadMembers();
  }, [loadMembers]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadMembers();
  };

  const handleTabChange = (tab: CommunityTab) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
  };

  const renderCard = ({ item }: { item: CommunityMember }) => (
    <CommunityCard
      name={item.name}
      avatarUrl={item.avatarUrl}
      nationalityCode={item.nationalityCode}
      age={item.age}
      gender={item.gender}
      location={item.location}
      style={styles.card}
    />
  );

  return (
    <View style={styles.container}>
      <MobileHeader
        isAuthenticated={isAuthenticated}
        onAvatarPress={drawer.open}
      />

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={styles.tabButton}
          onPress={() => handleTabChange('all')}
          activeOpacity={0.8}
        >
          <Text
            style={[styles.tabText, activeTab === 'all' && styles.tabTextActive]}
          >
            All
          </Text>
          {activeTab === 'all' ? <View style={styles.tabIndicator} /> : null}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tabButton}
          onPress={() => handleTabChange('nearby')}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'nearby' && styles.tabTextActive,
            ]}
          >
            Nearby
          </Text>
          {activeTab === 'nearby' ? (
            <View style={styles.tabIndicator} />
          ) : null}
        </TouchableOpacity>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.centered}>
          <Spinner label="Loading community..." />
        </View>
      ) : members.length === 0 ? (
        <View style={styles.centered}>
          <Users size={48} color={colors.textMuted} weight="light" />
          <Text style={styles.emptyText}>No members found</Text>
        </View>
      ) : (
        <FlatList
          data={members}
          keyExtractor={(item) => item.address}
          renderItem={renderCard}
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
        />
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
    fontSize: fontSize.base,
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
    gap: 12,
  },
  emptyText: {
    fontSize: fontSize.base,
    color: colors.textMuted,
  },
  listContent: {
    padding: 16,
    gap: 8,
    paddingBottom: 140,
  },
  card: {
    // Individual card styles are in CommunityCard — this is for list spacing
  },
});
