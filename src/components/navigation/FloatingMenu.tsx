import React, {
  useState,
  useRef,
  forwardRef,
  useImperativeHandle,
  useCallback,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TouchableOpacity,
  ScrollView,
  Animated,
  Dimensions,
  Linking,
  StyleProp,
  ViewStyle,
  TouchableWithoutFeedback,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'reicon-react-native';
import * as Haptics from 'expo-haptics';
import GithubCard, { GithubCardProps } from '../common/GithubCard';
import TwitterCard, { TwitterCardProps } from '../common/TwitterCard';
import { FONTS } from '../../theme/typography';

export interface MenuLink {
  label: string;
  href?: string;
  onPress?: () => void;
  isExternal?: boolean;
}

export interface FloatingMenuProps {
  title?: React.ReactNode;
  primaryLinks?: MenuLink[];
  secondaryLinks?: MenuLink[];
  socialLinks?: MenuLink[];
  githubCard?: GithubCardProps | boolean;
  twitterCard?: TwitterCardProps | boolean;
  style?: StyleProp<ViewStyle>;
  backButton?: {
    label?: string;
    onPress: () => void;
  };
  onSelectLink?: (link: MenuLink) => void;
}

export interface FloatingMenuHandle {
  open: () => void;
  close: () => void;
  toggle: () => void;
  isOpen: boolean;
}

interface MenuIconProps {
  animProgress: Animated.Value;
}

/**
 * 120fps Native-driven Hamburger-to-Cross Menu Icon.
 */
function MenuIcon({ animProgress }: MenuIconProps) {
  const topRotate = animProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '45deg'],
  });
  const topTranslateY = animProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-3.5, 0],
  });
  const bottomRotate = animProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-45deg'],
  });
  const bottomTranslateY = animProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [3.5, 0],
  });

  return (
    <View style={styles.menuIconContainer}>
      <Animated.View
        style={[
          styles.menuIconLine,
          {
            transform: [{ translateY: topTranslateY }, { rotate: topRotate }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.menuIconLine,
          {
            transform: [{ translateY: bottomTranslateY }, { rotate: bottomRotate }],
          },
        ]}
      />
    </View>
  );
}

export const FloatingMenu = forwardRef<FloatingMenuHandle, FloatingMenuProps>(
  (
    {
      title = (
        <Text style={styles.defaultTitleText}>
          MENU
        </Text>
      ),
      primaryLinks = [],
      secondaryLinks = [],
      socialLinks = [],
      githubCard = true,
      twitterCard = true,
      style,
      backButton,
      onSelectLink,
    },
    ref,
  ) => {
    const insets = useSafeAreaInsets();
    const [isOpen, setIsOpen] = useState(false);
    const [isRendered, setIsRendered] = useState(false);

    // Physics Animation Values
    const animProgress = useRef(new Animated.Value(0)).current;
    const iconAnim = useRef(new Animated.Value(0)).current;

    const screenWidth = Dimensions.get('window').width;
    const screenHeight = Dimensions.get('window').height;

    const showGithubCard = githubCard !== false;
    const githubCardProps = typeof githubCard === 'object' ? githubCard : undefined;
    const showTwitterCard = twitterCard !== false;
    const twitterCardProps = typeof twitterCard === 'object' ? twitterCard : undefined;

    // Viewport-adaptive geometry
    const collapsedWidth = Math.min(320, screenWidth - 32);
    const expandedWidth = Math.min(376, screenWidth - 24);
    const collapsedHeight = 54;
    const expandedHeight = Math.min(630, screenHeight - insets.top - insets.bottom - 28);

    const toggleOpen = useCallback((nextState?: boolean) => {
      const target = nextState !== undefined ? nextState : !isOpen;

      if (target) {
        setIsRendered(true);
      }
      setIsOpen(target);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

      Animated.parallel([
        // 1. UI Thread Native Driver for Icon morph (120fps)
        Animated.spring(iconAnim, {
          toValue: target ? 1 : 0,
          stiffness: 320,
          damping: 22,
          mass: 0.6,
          useNativeDriver: true,
        }),
        // 2. High-precision Spring Physics for Card geometry with overshoot clamping
        Animated.spring(animProgress, {
          toValue: target ? 1 : 0,
          stiffness: target ? 250 : 290,
          damping: target ? 24 : 27,
          mass: 0.8,
          overshootClamping: true,
          restSpeedThreshold: 0.001,
          restDisplacementThreshold: 0.001,
          useNativeDriver: false,
        }),
      ]).start(({ finished }) => {
        if (finished && !target) {
          setIsRendered(false);
        }
      });
    }, [isOpen, animProgress, iconAnim]);

    useImperativeHandle(ref, () => ({
      open: () => toggleOpen(true),
      close: () => toggleOpen(false),
      toggle: () => toggleOpen(),
      isOpen,
    }), [toggleOpen, isOpen]);

    const handlePressLink = (link: MenuLink) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      toggleOpen(false);

      requestAnimationFrame(() => {
        if (link.onPress) {
          link.onPress();
        } else if (onSelectLink) {
          onSelectLink(link);
        } else if (link.href) {
          if (link.href.startsWith('http://') || link.href.startsWith('https://')) {
            Linking.openURL(link.href).catch(() => {});
          }
        }
      });
    };

    // Smooth Interpolations
    const cardWidth = animProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [collapsedWidth, expandedWidth],
    });

    const cardHeight = animProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [collapsedHeight, expandedHeight],
    });

    const cardRadius = animProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [27, 28],
    });

    const cardBg = animProgress.interpolate({
      inputRange: [0, 0.25, 1],
      outputRange: ['rgba(16, 16, 20, 0.35)', 'rgba(18, 18, 24, 0.82)', 'rgba(18, 18, 24, 0.88)'],
    });

    const cardBorder = animProgress.interpolate({
      inputRange: [0, 0.25, 1],
      outputRange: ['rgba(255, 255, 255, 0.18)', 'rgba(255, 255, 255, 0.20)', 'rgba(255, 255, 255, 0.22)'],
    });

    const contentOpacity = animProgress.interpolate({
      inputRange: [0, 0.25, 0.75, 1],
      outputRange: [0, 0, 0.85, 1],
    });

    const contentTranslateY = animProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [16, 0],
    });

    const backdropOpacity = animProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
    });

    return (
      <>
        {/* Silky Backdrop with Click-Outside Dismissal */}
        {isRendered && (
          <TouchableWithoutFeedback onPress={() => toggleOpen(false)}>
            <Animated.View
              style={[
                styles.backdrop,
                {
                  opacity: backdropOpacity,
                },
              ]}
            />
          </TouchableWithoutFeedback>
        )}

        {/* Floating Capsule / Card */}
        <View
          pointerEvents="box-none"
          style={[
            styles.container,
            { top: insets.top + 8 },
            style,
          ]}
        >
          <Animated.View
            style={[
              styles.card,
              {
                width: cardWidth,
                height: cardHeight,
                borderRadius: cardRadius,
                backgroundColor: cardBg,
                borderColor: cardBorder,
              },
            ]}
          >
            {/* Top Anchor Header Bar (Two-tier pill) */}
            <Pressable
              onPress={() => {
                if (!isOpen) toggleOpen(true);
              }}
              style={({ pressed }) => [
                styles.headerBar,
                pressed && !isOpen && styles.headerBarPressed,
              ]}
            >
              {/* Left Title / Optional Back Button */}
              <View style={styles.headerLeftContainer}>
                {backButton ? (
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      backButton.onPress();
                    }}
                    hitSlop={12}
                    style={styles.backButton}
                  >
                    <ChevronLeft size={20} color="#FF9F0A" />
                    <Text style={styles.backButtonText}>{backButton.label ?? 'Back'}</Text>
                  </Pressable>
                ) : (
                  typeof title === 'string' ? (
                    <Text style={styles.defaultTitleText}>{title}</Text>
                  ) : (
                    title
                  )
                )}
              </View>

              {/* Right Toggle Pill Button with Crossfading "Menu" <-> "Close" */}
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  toggleOpen();
                }}
                hitSlop={10}
                style={({ pressed }) => [
                  styles.togglePill,
                  pressed && styles.togglePillPressed,
                ]}
              >
                <MenuIcon animProgress={iconAnim} />
                <View style={styles.toggleTextContainer}>
                  <Animated.Text
                    style={[
                      styles.togglePillText,
                      {
                        position: 'absolute',
                        opacity: animProgress.interpolate({
                          inputRange: [0, 0.45],
                          outputRange: [1, 0],
                          extrapolate: 'clamp',
                        }),
                        transform: [
                          {
                            translateY: animProgress.interpolate({
                              inputRange: [0, 0.45],
                              outputRange: [0, -7],
                              extrapolate: 'clamp',
                            }),
                          },
                        ],
                      },
                    ]}
                  >
                    Menu
                  </Animated.Text>
                  <Animated.Text
                    style={[
                      styles.togglePillText,
                      {
                        position: 'absolute',
                        opacity: animProgress.interpolate({
                          inputRange: [0.55, 1],
                          outputRange: [0, 1],
                          extrapolate: 'clamp',
                        }),
                        transform: [
                          {
                            translateY: animProgress.interpolate({
                              inputRange: [0.55, 1],
                              outputRange: [7, 0],
                              extrapolate: 'clamp',
                            }),
                          },
                        ],
                      },
                    ]}
                  >
                    Close
                  </Animated.Text>
                </View>
              </Pressable>
            </Pressable>

            {/* Expanded Content with Smooth Curtain-Reveal */}
            {isRendered && (
              <Animated.View
                pointerEvents={isOpen ? 'auto' : 'none'}
                style={[
                  styles.expandedContent,
                  {
                    opacity: contentOpacity,
                    transform: [{ translateY: contentTranslateY }],
                  },
                ]}
              >
                <ScrollView
                  style={styles.scrollArea}
                  contentContainerStyle={styles.scrollContent}
                  showsVerticalScrollIndicator={false}
                  bounces={true}
                  overScrollMode="never"
                >
                  {/* Primary Links */}
                  {primaryLinks.length > 0 && (
                    <View style={styles.section}>
                      <Text style={styles.sectionHeader}>Menu</Text>
                      {primaryLinks.map((link) => (
                        <TouchableOpacity
                          key={link.label}
                          activeOpacity={0.65}
                          onPress={() => handlePressLink(link)}
                          style={styles.primaryLinkItem}
                        >
                          <Text style={styles.primaryLinkLabel}>
                            {link.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {/* Divider */}
                  {primaryLinks.length > 0 &&
                    (secondaryLinks.length > 0 || socialLinks.length > 0) && (
                      <View style={styles.divider} />
                    )}

                  {/* Secondary Links */}
                  {secondaryLinks.length > 0 && (
                    <View style={styles.section}>
                      <Text style={styles.sectionHeader}>Other</Text>
                      {secondaryLinks.map((link) => (
                        <TouchableOpacity
                          key={link.label}
                          activeOpacity={0.65}
                          onPress={() => handlePressLink(link)}
                          style={styles.secondaryLinkItem}
                        >
                          <Text style={styles.secondaryLinkLabel}>{link.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {/* Developer GitHub Card */}
                  {showGithubCard && (
                    <>
                      <View style={styles.divider} />
                      <View style={styles.section}>
                        <Text style={styles.sectionHeader}>Developer</Text>
                        <GithubCard
                          username={githubCardProps?.username ?? 'AbhishekS04'}
                          name={githubCardProps?.name ?? 'Abhishek Singh'}
                          themeScheme={githubCardProps?.themeScheme ?? 'green'}
                          onPressProfile={() => {
                            toggleOpen(false);
                          }}
                        />
                      </View>
                    </>
                  )}

                  {/* Social Media Section */}
                  {(socialLinks.length > 0 || showTwitterCard) && (
                    <>
                      <View style={styles.divider} />
                      <View style={[styles.section, { marginTop: 8 }]}>
                        <Text style={styles.sectionHeader}>Social media</Text>

                        {/* Twitter / X Profile Card */}
                        {showTwitterCard && (
                          <TwitterCard
                            username={twitterCardProps?.username ?? 'abhi3hekk'}
                            name={twitterCardProps?.name ?? 'Abhishek Singh'}
                            style={{ marginBottom: socialLinks.length > 0 ? 12 : 0 }}
                            onPressProfile={() => {
                              toggleOpen(false);
                            }}
                          />
                        )}

                        {socialLinks.map((link) => (
                          <TouchableOpacity
                            key={link.label}
                            activeOpacity={0.65}
                            onPress={() => handlePressLink(link)}
                            style={styles.secondaryLinkItem}
                          >
                            <Text style={styles.socialLinkLabel}>{link.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  )}
                </ScrollView>
              </Animated.View>
            )}
          </Animated.View>
        </View>
      </>
    );
  },
);

FloatingMenu.displayName = 'FloatingMenu';

export default FloatingMenu;

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.40)',
    zIndex: 9998,
  },
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'flex-start',
    zIndex: 9999,
  },
  card: {
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 0,
  },
  headerBar: {
    height: 54,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderRadius: 27,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  headerBarPressed: {
    opacity: 0.95,
  },
  headerLeftContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  defaultTitleText: {
    fontFamily: FONTS.display,
    color: '#FFFFFF',
    fontSize: 13.5,
    letterSpacing: 2,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingRight: 8,
  },
  backButtonText: {
    fontFamily: FONTS.sans,
    color: '#FF9F0A',
    fontSize: 14.5,
  },
  togglePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  togglePillPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    transform: [{ scale: 0.96 }],
  },
  toggleTextContainer: {
    width: 36,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  togglePillText: {
    fontFamily: FONTS.sans,
    color: '#FFFFFF',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  menuIconContainer: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuIconLine: {
    position: 'absolute',
    width: 14,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#FFFFFF',
  },
  expandedContent: {
    flex: 1,
    marginTop: 10,
    paddingHorizontal: 4,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 8,
    paddingBottom: 16,
  },
  section: {
    marginTop: 6,
  },
  sectionHeader: {
    fontFamily: FONTS.sans,
    color: '#8E8E93',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  primaryLinkItem: {
    paddingVertical: 6,
  },
  primaryLinkLabel: {
    fontFamily: FONTS.display,
    color: '#FFFFFF',
    fontSize: 27,
    letterSpacing: -0.5,
    lineHeight: 35,
  },
  secondaryLinkItem: {
    paddingVertical: 6,
  },
  secondaryLinkLabel: {
    fontFamily: FONTS.sans,
    color: 'rgba(255, 255, 255, 0.88)',
    fontSize: 16,
  },
  socialLinkLabel: {
    fontFamily: FONTS.sans,
    color: 'rgba(255, 255, 255, 0.88)',
    fontSize: 15,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 14,
  },
});
