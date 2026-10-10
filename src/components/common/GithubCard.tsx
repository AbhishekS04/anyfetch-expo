import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Code, ArrowUpRight } from 'reicon-react-native';
import * as Haptics from 'expo-haptics';
import { FONTS } from '../../theme/typography';

export interface ContributionDay {
  date: string;
  count: number;
  level: number;
}

export interface GithubCardProps {
  username?: string;
  name?: string;
  avatarUrl?: string;
  year?: number | string;
  text?: string;
  linkText?: string;
  href?: string;
  themeScheme?: 'monochrome' | 'green' | 'blue' | 'purple';
  calendarTheme?: {
    light: string[];
    dark: string[];
  };
  contributionsData?: ContributionDay[];
  totalContributions?: number;
  style?: StyleProp<ViewStyle>;
  onPressProfile?: () => void;
}

export const COLOR_SCHEMES = {
  monochrome: {
    light: ['#f5f5f5', '#d4d4d4', '#a3a3a3', '#737373', '#404040'],
    dark: ['#262626', '#404040', '#737373', '#a3a3a3', '#d4d4d4'],
  },
  green: {
    light: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
    dark: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'],
  },
  blue: {
    light: ['#f0f9ff', '#bae6fd', '#38bdf8', '#0284c7', '#0369a1'],
    dark: ['#172554', '#1e3a8a', '#1d4ed8', '#3b82f6', '#60a5fa'],
  },
  purple: {
    light: ['#faf5ff', '#e9d5ff', '#c084fc', '#9333ea', '#6b21a8'],
    dark: ['#2e1065', '#3b0764', '#581c87', '#7e22ce', '#a855f7'],
  },
};

const generateEmptyContributions = (): ContributionDay[] => {
  const data: ContributionDay[] = [];
  const today = new Date();
  for (let i = 118; i >= 0; i--) {
    const date = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    data.push({
      date: date.toISOString().split('T')[0],
      count: 0,
      level: 0,
    });
  }
  return data;
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
  return dateStr;
};

export const GithubCard: React.FC<GithubCardProps> = ({
  username = 'AbhishekS04',
  name = 'Abhishek Singh',
  avatarUrl,
  year = 2026,
  href,
  themeScheme = 'green',
  calendarTheme,
  contributionsData,
  totalContributions,
  style,
  onPressProfile,
}) => {
  const [profile, setProfile] = useState<{ name: string; avatarUrl: string }>({
    name,
    avatarUrl: avatarUrl || `https://github.com/${username}.png`,
  });

  const [contributionsList, setContributionsList] = useState<ContributionDay[]>(() =>
    contributionsData || generateEmptyContributions(),
  );

  const [selectedDay, setSelectedDay] = useState<ContributionDay | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;

    // Fetch user profile from GitHub
    fetch(`https://api.github.com/users/${username}`)
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error('Failed to fetch github user');
      })
      .then((data) => {
        if (!isMounted) return;
        setProfile({
          name: data.name || data.login || name,
          avatarUrl: data.avatar_url || avatarUrl || `https://github.com/${username}.png`,
        });
      })
      .catch(() => {});

    if (contributionsData) {
      setContributionsList(contributionsData);
      return;
    }

    setLoading(true);

    // Fetch real contributions activity
    fetch(`https://github-contributions-api.jogruber.de/v4/${username}`)
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error('Failed to fetch contributions');
      })
      .then((data) => {
        if (!isMounted) return;
        if (data.contributions && data.contributions.length > 0) {
          const today = new Date();
          const pastContributions: ContributionDay[] = data.contributions.filter(
            (d: any) => new Date(d.date) <= today,
          );
          const sorted = pastContributions.sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
          );
          setContributionsList(sorted.slice(-119));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [username, name, avatarUrl, contributionsData]);

  const activeTheme = calendarTheme || COLOR_SCHEMES[themeScheme];

  // Group 119 days into 17 columns of 7 days each
  const columns = useMemo(() => {
    const cols: ContributionDay[][] = [];
    for (let i = 0; i < contributionsList.length; i += 7) {
      cols.push(contributionsList.slice(i, i + 7));
    }
    return cols;
  }, [contributionsList]);

  const calculatedTotalCommits = useMemo(() => {
    if (totalContributions !== undefined) return totalContributions;
    return contributionsList.reduce((acc, curr) => acc + curr.count, 0);
  }, [contributionsList, totalContributions]);

  const profileUrl = href || `https://github.com/${username}`;

  const handleOpenProfile = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (onPressProfile) {
      onPressProfile();
    }
    Linking.openURL(profileUrl).catch(() => {});
  };

  return (
    <View style={[styles.card, style]}>
      {/* Header Profile Row */}
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={handleOpenProfile}
        style={styles.headerRow}
      >
        <Image
          source={{ uri: profile.avatarUrl }}
          style={styles.avatar}
          resizeMode="cover"
        />

        <View style={styles.profileTextContainer}>
          <Text style={styles.nameText} numberOfLines={1}>
            {profile.name}
          </Text>
          <Text style={styles.handleText} numberOfLines={1}>
            @{username}
          </Text>
        </View>

        <View style={styles.githubBadge}>
          <Code size={16} color="#FFFFFF" />
          <Text style={styles.badgeText}>GitHub</Text>
          <ArrowUpRight size={12} color="#8E8E93" />
        </View>
      </TouchableOpacity>

      {/* Selected Day Tooltip */}
      {selectedDay && (
        <View style={styles.tooltipBox}>
          <Text style={styles.tooltipText}>
            <Text style={styles.tooltipBold}>{selectedDay.count} commits</Text> on {formatDate(selectedDay.date)}
          </Text>
        </View>
      )}

      {/* Contributions Heatmap Grid (7 rows x 17 columns) */}
      <View style={styles.gridSection}>
        {loading && contributionsList.length === 0 ? (
          <ActivityIndicator size="small" color="#26a641" style={styles.loader} />
        ) : (
          <View style={styles.gridContainer}>
            {columns.map((col, colIdx) => (
              <View key={`col-${colIdx}`} style={styles.gridColumn}>
                {col.map((day, rowIdx) => {
                  const color = activeTheme.dark[day.level] || activeTheme.dark[0];
                  const isSelected = selectedDay?.date === day.date;
                  return (
                    <TouchableOpacity
                      key={`day-${day.date || `${colIdx}-${rowIdx}`}`}
                      activeOpacity={0.7}
                      onPress={() => {
                        if (day.date) {
                          Haptics.selectionAsync().catch(() => {});
                          setSelectedDay(isSelected ? null : day);
                        }
                      }}
                      style={[
                        styles.cell,
                        { backgroundColor: color },
                        isSelected && styles.cellSelected,
                      ]}
                    />
                  );
                })}
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Footer Total Commits */}
      <View style={styles.footerRow}>
        <Text style={styles.footerText}>
          {calculatedTotalCommits.toLocaleString()} contributions in {year}
        </Text>
        <Text style={styles.footerHint}>Tap square for details</Text>
      </View>
    </View>
  );
};

export default GithubCard;

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#141417',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    backgroundColor: '#262626',
  },
  profileTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  nameText: {
    fontFamily: FONTS.display,
    color: '#FFFFFF',
    fontSize: 16,
    letterSpacing: -0.2,
  },
  handleText: {
    fontFamily: FONTS.sans,
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 1,
  },
  githubBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeText: {
    fontFamily: FONTS.sans,
    color: '#FFFFFF',
    fontSize: 11.5,
  },
  tooltipBox: {
    backgroundColor: '#1E1E24',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    alignSelf: 'center',
    marginBottom: 8,
  },
  tooltipText: {
    fontFamily: FONTS.sans,
    color: '#D4D4D8',
    fontSize: 11,
  },
  tooltipBold: {
    color: '#39D353',
    fontWeight: '700',
  },
  gridSection: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  loader: {
    paddingVertical: 18,
  },
  gridContainer: {
    flexDirection: 'row',
    gap: 3.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridColumn: {
    flexDirection: 'column',
    gap: 3.5,
  },
  cell: {
    width: 10.5,
    height: 10.5,
    borderRadius: 2.2,
  },
  cellSelected: {
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    transform: [{ scale: 1.25 }],
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  footerText: {
    fontFamily: FONTS.sans,
    color: '#8E8E93',
    fontSize: 11,
  },
  footerHint: {
    fontFamily: FONTS.sans,
    color: '#555558',
    fontSize: 10,
  },
});
