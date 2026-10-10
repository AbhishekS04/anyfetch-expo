import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Setting, Music, Video } from 'reicon-react-native';
import * as Haptics from 'expo-haptics';
import { QualityOption } from '../../extractors/types';
import { FONTS } from '../../theme/typography';

interface QualitySelectorProps {
  qualities: QualityOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  accentColor?: string;
}

export default function QualitySelector({
  qualities,
  selectedId,
  onSelect,
  accentColor = '#FF0000',
}: QualitySelectorProps) {
  if (!qualities || qualities.length === 0) return null;

  const currentSelected = qualities.find(q => q.id === selectedId) || qualities[0];

  return (
    <View style={s.container}>
      <View style={s.headerRow}>
        <View style={s.headerLeft}>
          <Setting size={13} color={accentColor} />
          <Text style={s.title}>QUALITY</Text>
        </View>
        <Text style={[s.badgeText, { color: accentColor }]}>
          {currentSelected.label}
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.scroll}>
        {qualities.map(q => {
          const isSelected = selectedId === q.id;
          const QualityIcon = q.type === 'audio' ? Music : Video;
          return (
            <TouchableOpacity
              key={q.id}
              activeOpacity={0.8}
              style={[
                s.chip,
                isSelected && [s.chipSelected, { backgroundColor: accentColor, borderColor: accentColor }],
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onSelect(q.id);
              }}>
              <QualityIcon
                size={12}
                color={isSelected ? '#FFFFFF' : '#8E8E93'}
              />
              <Text style={[s.chipText, isSelected && s.chipTextSelected]}>
                {q.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    width: '100%',
    gap: 6,
    marginTop: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  title: {
    fontFamily: FONTS.sans,
    color: '#8E8E93',
    fontSize: 10,
    letterSpacing: 1,
  },
  badgeText: {
    fontFamily: FONTS.sans,
    fontSize: 11,
    letterSpacing: 0.3,
  },
  scroll: {
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#18181A',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#28282A',
  },
  chipSelected: {
    elevation: 3,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  chipText: {
    fontFamily: FONTS.sans,
    color: '#AEAEB2',
    fontSize: 11.5,
  },
  chipTextSelected: {
    color: '#FFFFFF',
  },
});

