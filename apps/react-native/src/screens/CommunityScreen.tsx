import React, { useCallback, useState, useContext } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SlidersHorizontal, Users } from 'phosphor-react-native';
import { MobileHeader } from '../components/MobileHeader';
import { CommunityCard } from '../components/CommunityCard';
import {
  CommunityFilterSheet,
  countActiveFilters,
  type CommunityFilters,
} from '../components/CommunityFilterSheet';
import { useAuth } from '../providers/AuthProvider';
import { DrawerContext } from '../navigation/DrawerContext';
import type { RootStackParamList } from '../navigation/TabNavigator';
import type { CommunityMember } from '../lib/community';
import { colors, fontSize } from '../lib/theme';
import { IconButton, Spinner } from '../ui';
import { useCommunity } from '../hooks/useCommunity';

export const CommunityScreen: React.FC = () => {
  const { isAuthenticated, pkpInfo } = useAuth();
  const drawer = useContext(DrawerContext);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [filters, setFilters] = useState<CommunityFilters>({});
  const [filterOpen, setFilterOpen] = useState(false);
  const { members, loading, refreshing, refresh } = useCommunity({
    filters,
    userAddress: pkpInfo?.ethAddress,
  });

  const activeCount = countActiveFilters(filters);

  const handleCardPress = useCallback((address: string) => {
    navigation.navigate('PublicProfile', { address });
  }, [navigation]);

  const renderCard = ({ item }: { item: CommunityMember }) => (
    <CommunityCard
      name={item.name}
      avatarUrl={item.avatarUrl}
      nationalityCode={item.nationalityCode}
      age={item.age}
      gender={item.gender}
      location={item.location}
      style={styles.card}
      onPress={() => handleCardPress(item.address)}
    />
  );

  return (
    <View style={styles.container}>
      <MobileHeader
        title="Community"
        isAuthenticated={isAuthenticated}
        onAvatarPress={drawer.open}
        rightSlot={
          <View>
            <IconButton
              variant="soft"
              size="md"
              accessibilityLabel="Filter"
              onPress={() => setFilterOpen(true)}
            >
              <SlidersHorizontal size={20} color={colors.textSecondary} />
            </IconButton>
            {activeCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{activeCount}</Text>
              </View>
            )}
          </View>
        }
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

      <CommunityFilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        onFiltersChange={setFilters}
      />
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
  badge: {
    position: 'absolute',
    top: -2,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.accentCoral,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.white,
  },
});
