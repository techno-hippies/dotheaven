import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useAuth } from '../providers/AuthProvider';
import { useNavigation } from '@react-navigation/native';

/**
 * Lazy auth hook. Returns a function that:
 * - If authenticated: runs the callback immediately
 * - If not authenticated: shows an alert prompting user to sign in via Profile tab
 *
 * Usage:
 *   const requireAuth = useRequireAuth();
 *   requireAuth(() => submitScrobbles(), 'submit scrobbles');
 */
export function useRequireAuth() {
  const { isAuthenticated } = useAuth();
  const navigation = useNavigation();

  return useCallback(
    (action: () => void | Promise<void>, actionName?: string) => {
      if (isAuthenticated) {
        action();
        return;
      }

      Alert.alert(
        'Sign in required',
        `You need to sign in to ${actionName || 'do this'}. Go to your profile to sign in.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Sign In',
            onPress: () => navigation.navigate('Profile' as never),
          },
        ],
      );
    },
    [isAuthenticated, navigation],
  );
}
