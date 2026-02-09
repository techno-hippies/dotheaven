import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { CaretRight } from 'phosphor-react-native';
import { colors, radii, fontSize } from '../lib/theme';

export interface SettingsMenuItem {
  key: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon?: React.ComponentType<any>;
  label: string;
  description?: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
}

export interface SettingsMenuProps {
  title?: string;
  items: SettingsMenuItem[];
  style?: StyleProp<ViewStyle>;
}

export const SettingsMenu: React.FC<SettingsMenuProps> = ({
  title,
  items,
  style,
}) => {
  return (
    <View style={style}>
      {title ? <Text style={styles.title}>{title.toUpperCase()}</Text> : null}
      <View style={styles.container}>
        {items.map((item, index) => {
          const iconColor = item.destructive
            ? colors.accentCoral
            : colors.textMuted;
          const labelColor = item.destructive
            ? colors.accentCoral
            : colors.textPrimary;

          const content = (
            <View style={styles.row}>
              {item.icon ? (
                <View style={styles.iconSlot}>
                  <item.icon size={20} color={iconColor} />
                </View>
              ) : null}

              <View style={styles.labelSlot}>
                <Text style={[styles.label, { color: labelColor }]}>
                  {item.label}
                </Text>
                {item.description ? (
                  <Text style={styles.description} numberOfLines={1}>
                    {item.description}
                  </Text>
                ) : null}
              </View>

              {item.value ? (
                <Text style={styles.value} numberOfLines={1}>
                  {item.value}
                </Text>
              ) : null}

              {item.onPress ? (
                <CaretRight size={16} color={colors.textMuted} />
              ) : null}
            </View>
          );

          const isLast = index === items.length - 1;

          return item.onPress ? (
            <Pressable
              key={item.key}
              onPress={item.onPress}
              style={({ pressed }) => [
                !isLast && styles.divider,
                pressed && styles.pressed,
              ]}
            >
              {content}
            </Pressable>
          ) : (
            <View key={item.key} style={!isLast ? styles.divider : undefined}>
              {content}
            </View>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  title: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  container: {
    backgroundColor: colors.bgSurface,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  iconSlot: {
    width: 20,
    alignItems: 'center',
  },
  labelSlot: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontSize: fontSize.base,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  description: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: 2,
  },
  value: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    flexShrink: 0,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  pressed: {
    backgroundColor: colors.bgElevated,
  },
});
