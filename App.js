import React, { useContext, useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, Animated } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from './src/components/icons/Icon';
import { BookmarkCountProvider, BookmarkCountContext } from './src/context/BookmarkCountContext';
import { DownloadProvider, DownloadContext } from './src/context/DownloadContext';
import { AccessibilityProvider, AccessibilityContext } from './src/context/AccessibilityContext';
import HomeScreen from './src/screens/HomeScreen';
import BookmarksScreen from './src/screens/BookmarksScreen';
import DownloadsScreen from './src/screens/DownloadsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { COLORS } from './src/theme/fao';

const Tab = createBottomTabNavigator();

function DownloadsTabIcon({ color }) {
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
      <Icon
        name="download-outline"
        size={downloadJustCompleted ? 26 : 22}
        color={downloadJustCompleted ? COLORS.primary : color}
      />
    </Animated.View>
  );
}

function TabNavigator() {
  const insets = useSafeAreaInsets();
  const { bookmarkCount, refreshBookmarkCount } = useContext(BookmarkCountContext);
  const tabBarBottomPadding = 12 + insets.bottom;
  const tabBarHeight = 60 + insets.bottom;

  useEffect(() => {
    refreshBookmarkCount();
  }, [refreshBookmarkCount]);

  return (
    <Tab.Navigator
            screenOptions={{
              headerShown: false,
              tabBarActiveTintColor: COLORS.textHeading,
              tabBarInactiveTintColor: COLORS.textMuted,
              tabBarStyle: {
                backgroundColor: COLORS.surface,
                borderTopColor: COLORS.border,
                paddingBottom: tabBarBottomPadding,
                paddingTop: 10,
                height: tabBarHeight,
              },
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
                tabBarIcon: ({ color }) => <Icon name="home-outline" size={22} color={color} />,
                tabBarLabel: 'Home',
              }}
            />
            <Tab.Screen
              name="Bookmarks"
              component={BookmarksScreen}
              options={{
                tabBarIcon: ({ color }) => <Icon name="bookmark-outline" size={22} color={color} />,
                tabBarLabel: 'Bookmarks',
                tabBarBadge: bookmarkCount > 0 ? bookmarkCount : undefined,
                tabBarBadgeStyle: { backgroundColor: COLORS.primary },
              }}
            />
            <Tab.Screen
              name="Downloads"
              component={DownloadsScreen}
              options={{
                tabBarIcon: ({ color }) => <DownloadsTabIcon color={color} />,
                tabBarLabel: 'Downloads',
              }}
            />
            <Tab.Screen
              name="Settings"
              component={SettingsScreen}
              options={{
                tabBarIcon: ({ color }) => <Icon name="settings-outline" size={22} color={color} />,
                tabBarLabel: 'Settings',
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
});
