import React from 'react';
import { CalendarBlank } from 'phosphor-react-native';
import { PlaceholderScreen } from './PlaceholderScreen';

export const ScheduleScreen: React.FC = () => (
  <PlaceholderScreen
    title="Schedule"
    subtitle="Book time and manage your availability"
    IconComponent={CalendarBlank}
  />
);
