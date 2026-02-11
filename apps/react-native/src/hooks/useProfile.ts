import { useCallback, useEffect, useState } from 'react';
import { fetchProfile, type ProfileData } from '../lib/profile';

interface UseProfileParams {
  /** Whether fetch is enabled. For own profile, pass isAuthenticated. For public profiles, pass true. */
  enabled?: boolean;
  address?: string;
}

export function useProfile({ enabled = true, address }: UseProfileParams) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!address) return;
    try {
      const data = await fetchProfile(address as `0x${string}`);
      setProfile(data);
    } catch (err) {
      console.error('Failed to load profile:', err);
    } finally {
      setProfileLoading(false);
      setRefreshing(false);
    }
  }, [address]);

  useEffect(() => {
    if (enabled && address) {
      setProfileLoading(true);
      loadProfile();
      return;
    }
    setProfile(null);
    setProfileLoading(false);
    setRefreshing(false);
  }, [enabled, address, loadProfile]);

  const refresh = useCallback(() => {
    if (!address) return;
    setRefreshing(true);
    loadProfile();
  }, [address, loadProfile]);

  return { profile, profileLoading, refreshing, refresh };
}
