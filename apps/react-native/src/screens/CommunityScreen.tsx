import React, { useState, useContext } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Users } from 'phosphor-react-native';
import { MobileHeader } from '../components/MobileHeader';
import { CommunityCard } from '../components/CommunityCard';
import { useAuth } from '../providers/AuthProvider';
import { DrawerContext } from '../navigation/TabNavigator';
import type { CommunityMember } from '../lib/community';
import { colors, fontSize } from '../lib/theme';
import { Spinner, TabBar } from '../ui';
import { useCommunity } from '../hooks/useCommunity';

type CommunityTab = 'all' | 'nearby';

export const CommunityScreen: React.FC = () => {
  const { isAuthenticated, pkpInfo } = useAuth();
  const drawer = useContext(DrawerContext);
  const [activeTab, setActiveTab] = useState<CommunityTab>('all');
  const { members, loading, refreshing, refresh } = useCommunity({
    activeTab,
    userAddress: pkpInfo?.ethAddress,
  });

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

      <TabBar
        tabs={[
          { key: 'all', label: 'All' },
          { key: 'nearby', label: 'Nearby' },
        ]}
        activeTab={activeTab}
        onTabPress={(key) => handleTabChange(key as CommunityTab)}
      />

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
              onRefresh={refresh}
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
