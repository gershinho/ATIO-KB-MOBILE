import React, { useContext, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { BookmarkCountProvider, BookmarkCountContext } from './src/context/BookmarkCountContext';
import { DownloadCompleteProvider, DownloadCompleteContext } from './src/context/DownloadCompleteContext';
import { AccessibilityProvider } from './src/context/AccessibilityContext';
import HomeScreen from './src/screens/HomeScreen';
import BookmarksScreen from './src/screens/BookmarksScreen';
import DownloadsScreen from './src/screens/DownloadsScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const Tab = createBottomTabNavigator();

function TabNavigator() {
  const insets = useSafeAreaInsets();
  const { bookmarkCount, refreshBookmarkCount } = useContext(BookmarkCountContext);
  const { downloadJustCompleted } = useContext(DownloadCompleteContext);
  const tabBarBottomPadding = 12 + insets.bottom;
  const tabBarHeight = 60 + insets.bottom;

  useEffect(() => {
    refreshBookmarkCount();
  }, [refreshBookmarkCount]);

  return (
    <Tab.Navigator
            screenOptions={{
              headerShown: false,
              tabBarActiveTintColor: '#000',
              tabBarInactiveTintColor: '#999',
              tabBarStyle: {
                backgroundColor: '#fff',
                borderTopColor: '#e5e7eb',
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
                tabBarIcon: ({ color }) => <Ionicons name="home-outline" size={22} color={color} />,
                tabBarLabel: 'Home',
              }}
            />
            <Tab.Screen
              name="Bookmarks"
              component={BookmarksScreen}
              options={{
                tabBarIcon: ({ color }) => <Ionicons name="bookmark-outline" size={22} color={color} />,
                tabBarLabel: 'Bookmarks',
                tabBarBadge: bookmarkCount > 0 ? bookmarkCount : undefined,
                tabBarBadgeStyle: { backgroundColor: '#2563eb' },
              }}
            />
            <Tab.Screen
              name="Downloads"
              component={DownloadsScreen}
              options={{
                tabBarIcon: ({ color }) => (
                  <Ionicons
                    name="download-outline"
                    size={downloadJustCompleted ? 26 : 22}
                    color={downloadJustCompleted ? '#22c55e' : color}
                  />
                ),
                tabBarLabel: 'Downloads',
              }}
            />
            <Tab.Screen
              name="Settings"
              component={SettingsScreen}
              options={{
                tabBarIcon: ({ color }) => <Ionicons name="settings-outline" size={22} color={color} />,
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
          <DownloadCompleteProvider>
            <View style={styles.root}>
              <StatusBar style="dark" />
              <NavigationContainer>
                <TabNavigator />
              </NavigationContainer>
            </View>
          </DownloadCompleteProvider>
        </BookmarkCountProvider>
      </AccessibilityProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
});
