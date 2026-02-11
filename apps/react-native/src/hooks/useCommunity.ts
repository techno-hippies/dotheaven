import { useCallback, useEffect, useState } from 'react';
import {
  fetchCommunityMembers,
  fetchUserLocationCityId,
  type CommunityMember,
} from '../lib/community';
import type { CommunityFilters } from '../components/CommunityFilterSheet';

interface UseCommunityParams {
  filters: CommunityFilters;
  userAddress?: string;
}

export function useCommunity({ filters, userAddress }: UseCommunityParams) {
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
      const opts: Parameters<typeof fetchCommunityMembers>[0] = { first: 50 };

      // Subgraph-level filters
      if (filters.gender) opts.gender = filters.gender;
      if (filters.sameCity && userCityId) opts.locationCityId = userCityId;

      const data = await fetchCommunityMembers(opts);
      // Client-side filtering for fields not indexed in subgraph
      // (nativeLanguage, learningLanguage, verified require unpacking — skip for now,
      //  as the web app also does these client-side with additional RPC calls)
      setMembers(data);
    } catch (err) {
      console.error('Failed to load community:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filters, userCityId]);

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
