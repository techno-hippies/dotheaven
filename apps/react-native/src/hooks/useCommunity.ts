import { useCallback, useEffect, useState } from 'react';
import {
  fetchCommunityMembers,
  fetchUserLocationCityId,
  type CommunityMember,
} from '../lib/community';

type CommunityTab = 'all' | 'nearby';

interface UseCommunityParams {
  activeTab: CommunityTab;
  userAddress?: string;
}

export function useCommunity({ activeTab, userAddress }: UseCommunityParams) {
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userCityId, setUserCityId] = useState<string | null>(null);

  useEffect(() => {
    if (!userAddress) {
      setUserCityId(null);
      return;
    }
    fetchUserLocationCityId(userAddress).then(setUserCityId).catch(() => {});
  }, [userAddress]);

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

  const refresh = useCallback(() => {
    setRefreshing(true);
    loadMembers();
  }, [loadMembers]);

  return { members, loading, refreshing, refresh };
}
