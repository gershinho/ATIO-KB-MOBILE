import React, { useState, useCallback, useEffect } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity, Switch,
  Alert, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BookmarkCountContext } from '../context/BookmarkCountContext';

const BOOKMARKS_KEY = 'bookmarkedInnovations';
const DOWNLOADS_KEY = 'completedDownloads';
const SETTINGS_REDUCE_MOTION = 'settingsReduceMotion';
const SETTINGS_TEXT_SIZE = 'settingsTextSize';

const TEXT_SIZE_OPTIONS = [
  { value: 'small', label: 'Small' },
  { value: 'default', label: 'Default' },
  { value: 'large', label: 'Large' },
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { refreshBookmarkCount } = React.useContext(BookmarkCountContext);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [textSize, setTextSize] = useState('default');
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(null);

  const loadSettings = useCallback(async () => {
    try {
      const [motionRaw, sizeRaw] = await Promise.all([
        AsyncStorage.getItem(SETTINGS_REDUCE_MOTION),
        AsyncStorage.getItem(SETTINGS_TEXT_SIZE),
      ]);
      setReduceMotion(motionRaw === 'true');
      setTextSize(sizeRaw || 'default');
    } catch (e) {
      // keep defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleReduceMotionChange = async (value) => {
    setReduceMotion(value);
    try {
      await AsyncStorage.setItem(SETTINGS_REDUCE_MOTION, value ? 'true' : 'false');
    } catch (e) {}
  };

  const handleTextSizeSelect = async (value) => {
    setTextSize(value);
    try {
      await AsyncStorage.setItem(SETTINGS_TEXT_SIZE, value);
    } catch (e) {}
  };

  const clearBookmarks = () => {
    Alert.alert(
      'Clear bookmarks',
      'Remove all saved bookmarks? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel', accessibilityLabel: 'Cancel clearing bookmarks' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            setClearing('bookmarks');
            try {
              await AsyncStorage.removeItem(BOOKMARKS_KEY);
              await refreshBookmarkCount();
            } catch (e) {}
            setClearing(null);
          },
          accessibilityLabel: 'Confirm clear bookmarks',
        },
      ]
    );
  };

  const clearDownloads = () => {
    Alert.alert(
      'Clear downloads',
      'Remove all downloaded solutions from this device? You can download them again later.',
      [
        { text: 'Cancel', style: 'cancel', accessibilityLabel: 'Cancel clearing downloads' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            setClearing('downloads');
            try {
              await AsyncStorage.removeItem(DOWNLOADS_KEY);
            } catch (e) {}
            setClearing(null);
          },
          accessibilityLabel: 'Confirm clear downloads',
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#030213" accessibilityLabel="Loading settings" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: 12 + insets.top, paddingBottom: 24 + insets.bottom }]}
      showsVerticalScrollIndicator={false}
      accessibilityLabel="Settings"
      accessibilityRole="none"
    >
      <Text
        style={styles.title}
        accessibilityRole="header"
        accessibilityLabel="Settings"
      >
        Settings
      </Text>
      <Text style={styles.subtitle} accessibilityLabel="Preferences and app options">
        Preferences and accessibility options
      </Text>

      {/* Appearance & accessibility */}
      <View style={styles.section} accessibilityRole="summary" accessibilityLabel="Appearance and accessibility">
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Appearance & accessibility
        </Text>

        <View style={styles.row}>
          <Text style={styles.rowLabelInline}>Reduce motion</Text>
          <Switch
            value={reduceMotion}
            onValueChange={handleReduceMotionChange}
            trackColor={{ false: '#e5e7eb', true: '#2563eb' }}
            thumbColor="#fff"
            accessibilityLabel="Reduce motion"
            accessibilityHint={reduceMotion ? 'Turn off to enable animations' : 'Turn on to reduce animations'}
            accessibilityRole="switch"
            accessibilityState={{ checked: reduceMotion }}
          />
        </View>
        <View style={styles.rowHelp}>
          <Text style={styles.helpText}>Limits animations for sensitivity or preference.</Text>
        </View>

        <Text style={styles.rowLabel}>Text size</Text>
        <View style={styles.textSizeRow}>
          {TEXT_SIZE_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.textSizeBtn, textSize === opt.value && styles.textSizeBtnActive]}
              onPress={() => handleTextSizeSelect(opt.value)}
              activeOpacity={0.7}
              accessibilityLabel={`Text size ${opt.label}`}
              accessibilityHint={textSize === opt.value ? 'Selected' : `Select ${opt.label} text size`}
              accessibilityRole="button"
              accessibilityState={{ selected: textSize === opt.value }}
            >
              <Text style={[styles.textSizeBtnText, textSize === opt.value && styles.textSizeBtnTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.rowHelp}>
          <Text style={styles.helpText}>Preferred reading size. App may need a restart to apply fully.</Text>
        </View>
      </View>

      {/* Data & storage */}
      <View style={styles.section} accessibilityRole="summary" accessibilityLabel="Data and storage">
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Data & storage
        </Text>

        <TouchableOpacity
          style={styles.rowButton}
          onPress={clearBookmarks}
          disabled={!!clearing}
          activeOpacity={0.7}
          accessibilityLabel="Clear bookmarks"
          accessibilityHint="Removes all saved bookmarks. Double tap to confirm."
          accessibilityRole="button"
        >
          <Text style={styles.rowButtonLabel}>Clear bookmarks</Text>
          {clearing === 'bookmarks' ? (
            <ActivityIndicator size="small" color="#666" />
          ) : (
            <Text style={styles.rowButtonValue}>Remove all</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.rowButton}
          onPress={clearDownloads}
          disabled={!!clearing}
          activeOpacity={0.7}
          accessibilityLabel="Clear downloads"
          accessibilityHint="Removes downloaded solutions from this device. Double tap to confirm."
          accessibilityRole="button"
        >
          <Text style={styles.rowButtonLabel}>Clear downloads</Text>
          {clearing === 'downloads' ? (
            <ActivityIndicator size="small" color="#666" />
          ) : (
            <Text style={styles.rowButtonValue}>Remove all</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* About */}
      <View style={styles.section} accessibilityRole="summary" accessibilityLabel="About this app">
        <Text style={styles.sectionTitle} accessibilityRole="header">
          About
        </Text>
        <View style={styles.aboutBlock}>
          <Text style={styles.aboutTitle} accessibilityLabel="ATIO Knowledge Base">
            ATIO Knowledge Base
          </Text>
          <Text style={styles.aboutVersion} accessibilityLabel="Version 1.0.0">
            Version 1.0.0
          </Text>
          <Text style={styles.aboutDesc}>
            Explore and save agricultural solutions. Search by challenge, browse by type, and download for offline use.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { paddingHorizontal: 20 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: '700', color: '#111', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 24 },
  section: { marginBottom: 28 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#64748b', letterSpacing: 0.3, marginBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    minHeight: 52,
  },
  rowLabel: { fontSize: 16, fontWeight: '600', color: '#111', marginBottom: 8 },
  rowLabelInline: { fontSize: 16, fontWeight: '600', color: '#111' },
  rowHelp: { marginTop: 6, marginBottom: 16 },
  helpText: { fontSize: 12, color: '#64748b', lineHeight: 18 },
  textSizeRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  textSizeBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  textSizeBtnActive: { backgroundColor: '#eff6ff', borderColor: '#2563eb' },
  textSizeBtnText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  textSizeBtnTextActive: { color: '#2563eb' },
  rowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 10,
    minHeight: 52,
  },
  rowButtonLabel: { fontSize: 16, fontWeight: '600', color: '#111' },
  rowButtonValue: { fontSize: 14, color: '#dc2626', fontWeight: '500' },
  aboutBlock: { backgroundColor: '#f9fafb', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#e5e7eb' },
  aboutTitle: { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 4 },
  aboutVersion: { fontSize: 13, color: '#64748b', marginBottom: 10 },
  aboutDesc: { fontSize: 14, color: '#555', lineHeight: 22 },
});
