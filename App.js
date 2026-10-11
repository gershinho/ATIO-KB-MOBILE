import React, { useContext, useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, Animated } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { BottomTabBar, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from './src/components/icons/Icon';
import { BookmarkCountProvider } from './src/context/BookmarkCountContext';
import { DownloadProvider, DownloadContext } from './src/context/DownloadContext';
import { AccessibilityProvider, AccessibilityContext } from './src/context/AccessibilityContext';
import HomeScreen from './src/screens/HomeScreen';
import BookmarksScreen from './src/screens/BookmarksScreen';
import DownloadsScreen from './src/screens/DownloadsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import OfflineBanner from './src/components/OfflineBanner';
import useOnlineStatus from './src/hooks/useOnlineStatus';
import { COLORS } from './src/theme/fao';

const Tab = createBottomTabNavigator();

/**
 * A tab icon. The selected tab sits in a filled FAO-blue circle with the glyph
 * in white, so which tab is open reads at a glance rather than from a tint.
 */
function TabIcon({ name, focused, color, size = 22 }) {
  if (!focused) return <Icon name={name} size={size} color={color} />;
  return (
    <View style={styles.activeIcon}>
      <Icon name={name} size={18} color={COLORS.textInverse} />
    </View>
  );
}

function DownloadsTabIcon({ color, focused }) {
  const { downloadJustCompleted } = useContext(DownloadContext);
  const { reduceMotion } = useContext(AccessibilityContext);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const prevCompleted = useRef(false);
  useEffect(() => {
    // The icon still grows and turns green to announce the download; reduced
    // motion only drops the shake. This was the other animation in the app that
    // ignored the setting.
    if (reduceMotion) return;
    if (downloadJustCompleted && !prevCompleted.current) {
      prevCompleted.current = true;
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 1, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 2, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 3, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 4, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 5, duration: 60, useNativeDriver: true }),
      ]).start(() => {
        shakeAnim.setValue(0);
        prevCompleted.current = false;
      });
    }
  }, [downloadJustCompleted, shakeAnim, reduceMotion]);
  const translateX = shakeAnim.interpolate({
    inputRange: [0, 1, 2, 3, 4, 5],
    outputRange: [0, -5, 5, -5, 5, 0],
  });
  return (
    <Animated.View style={{ transform: [{ translateX }] }}>
      <TabIcon
        name="download-outline"
        focused={focused}
        size={downloadJustCompleted ? 26 : 22}
        color={downloadJustCompleted ? COLORS.primary : color}
      />
    </Animated.View>
  );
}

function TabNavigator() {
  const insets = useSafeAreaInsets();
  const tabBarBottomPadding = 8 + insets.bottom;
  // Icons only: room for the 34px active circle and nothing else.
  const tabBarHeight = 58 + insets.bottom;
  const online = useOnlineStatus();

  return (
    <Tab.Navigator
            // The offline banner rides on top of the tab bar so it is in view
            // on every tab without each screen having to make room for it.
            tabBar={(props) => (
              <>
                {!online && <OfflineBanner />}
                <BottomTabBar {...props} />
              </>
            )}
            screenOptions={{
              headerShown: false,
              tabBarActiveTintColor: COLORS.primary,
              tabBarInactiveTintColor: COLORS.textMuted,
              tabBarStyle: {
                backgroundColor: COLORS.surface,
                borderTopColor: COLORS.border,
                paddingBottom: tabBarBottomPadding,
                paddingTop: 8,
                height: tabBarHeight,
              },
              // Icons only; each screen sets tabBarAccessibilityLabel so screen
              // readers can still name the tab.
              tabBarShowLabel: false,
              tabBarLabelStyle: {
                fontSize: 10,
                fontWeight: '600',
              },
            }}
          >
            <Tab.Screen
              name="Home"
              component={HomeScreen}
              options={{
                tabBarIcon: ({ color, focused }) => <TabIcon name="home-outline" focused={focused} color={color} />,
                tabBarLabel: 'Home',
                tabBarAccessibilityLabel: 'Home',
              }}
            />
            <Tab.Screen
              name="Bookmarks"
              component={BookmarksScreen}
              options={{
                tabBarIcon: ({ color, focused }) => <TabIcon name="bookmark-outline" focused={focused} color={color} />,
                tabBarLabel: 'Bookmarks',
                tabBarAccessibilityLabel: 'Bookmarks',
              }}
            />
            <Tab.Screen
              name="Downloads"
              component={DownloadsScreen}
              options={{
                tabBarIcon: ({ color, focused }) => <DownloadsTabIcon color={color} focused={focused} />,
                tabBarLabel: 'Downloads',
                tabBarAccessibilityLabel: 'Downloads',
              }}
            />
            <Tab.Screen
              name="Settings"
              component={SettingsScreen}
              options={{
                tabBarIcon: ({ color, focused }) => <TabIcon name="settings-outline" focused={focused} color={color} />,
                tabBarLabel: 'Settings',
                tabBarAccessibilityLabel: 'Settings',
              }}
            />
          </Tab.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AccessibilityProvider>
        <BookmarkCountProvider>
          <DownloadProvider>
            <View style={styles.root}>
              <StatusBar style="dark" />
              <NavigationContainer>
                <TabNavigator />
              </NavigationContainer>
            </View>
          </DownloadProvider>
        </BookmarkCountProvider>
      </AccessibilityProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  activeIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
