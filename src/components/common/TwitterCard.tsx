import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Linking,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Location, Link, Calendar, UserAdd } from 'reicon-react-native';
import * as Haptics from 'expo-haptics';
import { FONTS } from '../../theme/typography';

export interface TwitterCardProps {
  username?: string;
  name?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  staticCard?: boolean;
  joinedDate?: string;
  year?: number | string;
  text?: string;
  linkText?: string;
  href?: string;
  style?: StyleProp<ViewStyle>;
  onPressProfile?: () => void;
}

const formatCount = (count: number | string) => {
  if (typeof count === 'string') return count;
  if (count >= 1000000) {
    return (count / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (count >= 1000) {
    return (count / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return count.toString();
};

export const TwitterCard: React.FC<TwitterCardProps> = ({
  username = 'abhi3hekk',
  name = 'Abhishek Singh',
  avatarUrl,
  bannerUrl,
  staticCard = true,
  joinedDate,
  year = 2026,
  href,
  style,
  onPressProfile,
}) => {
  const profileUrl = href || `https://x.com/${username}`;

  const [profile, setProfile] = useState({
    name: name || 'Twitter User',
    avatarUrl: avatarUrl || `https://unavatar.io/x/${username}`,
    bannerUrl: bannerUrl || '',
    bio: '',
    following: 0,
    followers: 0,
    joinedDate: joinedDate || `Joined ${year}`,
    location: '',
    website: null as { url: string; display_url: string } | null,
  });

  useEffect(() => {
    let isMounted = true;

    fetch(`https://api.fxtwitter.com/${username}`)
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error('Failed to fetch twitter user');
      })
      .then((data) => {
        if (!isMounted) return;
        if (data.code === 200 && data.user) {
          const user = data.user;
          setProfile({
            name: user.name || name,
            avatarUrl:
              user.avatar_url?.replace('_normal', '_400x400') ||
              avatarUrl ||
              `https://unavatar.io/x/${username}`,
            bannerUrl: user.banner_url || bannerUrl || '',
            bio: user.description || '',
            following: user.following ?? 0,
            followers: user.followers ?? 0,
            joinedDate: user.joined
              ? `Joined ${new Date(user.joined).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`
              : joinedDate || `Joined ${year}`,
            location: user.location || '',
            website: user.website || null,
          });
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [username, name, avatarUrl, bannerUrl, joinedDate, year]);

  const handleOpenProfile = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (onPressProfile) {
      onPressProfile();
    }
    Linking.openURL(profileUrl).catch(() => {});
  };

  return (
    <View style={[styles.card, style]}>
      {/* Banner */}
      <View style={styles.bannerContainer}>
        {profile.bannerUrl ? (
          <Image
            source={{ uri: profile.bannerUrl }}
            style={styles.bannerImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.bannerPlaceholder} />
        )}
      </View>

      {/* Avatar & Follow Button Row */}
      <View style={styles.avatarRow}>
        <Image
          source={{ uri: profile.avatarUrl }}
          style={styles.avatar}
          resizeMode="cover"
        />

        <View style={styles.actionsRow}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleOpenProfile}
            style={styles.followButton}
          >
            <UserAdd size={13} color="#000000" style={styles.xIcon} />
            <Text style={styles.followButtonText}>Follow</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Profile Info */}
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={handleOpenProfile}
        style={styles.contentBody}
      >
        <Text style={styles.nameText} numberOfLines={1}>
          {profile.name}
        </Text>
        <Text style={styles.handleText} numberOfLines={1}>
          @{username}
        </Text>

        {/* Bio */}
        {profile.bio.length > 0 && (
          <Text style={styles.bioText} numberOfLines={3}>
            {profile.bio}
          </Text>
        )}

        {/* Metadata Details (Location, Website, Joined) */}
        <View style={styles.metaRow}>
          {profile.location.length > 0 && (
            <View style={styles.metaItem}>
              <Location size={12} color="#8E8E93" />
              <Text style={styles.metaText} numberOfLines={1}>
                {profile.location}
              </Text>
            </View>
          )}

          {profile.website && (
            <View style={styles.metaItem}>
              <Link size={12} color="#38BDF8" />
              <Text style={[styles.metaText, styles.linkText]} numberOfLines={1}>
                {profile.website.display_url}
              </Text>
            </View>
          )}

          {profile.joinedDate.length > 0 && (
            <View style={styles.metaItem}>
              <Calendar size={12} color="#8E8E93" />
              <Text style={styles.metaText} numberOfLines={1}>
                {profile.joinedDate}
              </Text>
            </View>
          )}
        </View>

        {/* Following & Followers Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statCount}>{formatCount(profile.following)}</Text>
            <Text style={styles.statLabel}>Following</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statCount}>{formatCount(profile.followers)}</Text>
            <Text style={styles.statLabel}>Followers</Text>
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
};

export default TwitterCard;

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#141417',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  bannerContainer: {
    height: 72,
    width: '100%',
    backgroundColor: '#1E1E24',
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  bannerPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#1C1C22',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  avatarRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 14,
    marginTop: -26,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 3,
    borderColor: '#141417',
    backgroundColor: '#262626',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  followButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  xIcon: {
    marginRight: 2,
  },
  followButtonText: {
    fontFamily: FONTS.sans,
    color: '#000000',
    fontSize: 12,
  },
  contentBody: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 14,
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
  bioText: {
    fontFamily: FONTS.sans,
    color: '#D4D4D8',
    fontSize: 12.5,
    lineHeight: 17,
    marginTop: 6,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontFamily: FONTS.sans,
    color: '#8E8E93',
    fontSize: 11,
  },
  linkText: {
    color: '#38BDF8',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statCount: {
    fontFamily: FONTS.sans,
    color: '#FFFFFF',
    fontSize: 12,
  },
  statLabel: {
    fontFamily: FONTS.sans,
    color: '#8E8E93',
    fontSize: 11.5,
  },
});
