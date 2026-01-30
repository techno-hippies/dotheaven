import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface PlaceholderScreenProps {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
}

export const PlaceholderScreen: React.FC<PlaceholderScreenProps> = ({ title, icon }) => {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{title}</Text>
      </View>
      <View style={styles.content}>
        <Ionicons name={icon} size={48} color="#7878a0" />
        <Text style={styles.text}>Coming soon</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1625',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#1f1b2e',
    borderBottomWidth: 1,
    borderBottomColor: '#2d2645',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#f0f0f5',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 16,
    color: '#7878a0',
    marginTop: 12,
  },
});
