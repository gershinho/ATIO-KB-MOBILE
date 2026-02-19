import React, { useState, useCallback } from 'react';
import {
  StyleSheet, Text, View, FlatList, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DetailDrawer from '../components/DetailDrawer';

const DOWNLOADS_KEY = 'completedDownloads';

export default function DownloadsScreen() {
  const insets = useSafeAreaInsets();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedInnovation, setSelectedInnovation] = useState(null);
  const [drawerVisible, setDrawerVisible] = useState(false);

  const loadDownloads = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(DOWNLOADS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      setList(arr);
    } catch (e) {
      console.log('Error loading downloads:', e);
      setList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadDownloads();
    }, [loadDownloads])
  );

  const deleteDownload = (innovation) => {
    Alert.alert(
      'Remove download',
      `Remove "${innovation.title}" from downloads?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const next = list.filter((i) => i.id !== innovation.id);
            await AsyncStorage.setItem(DOWNLOADS_KEY, JSON.stringify(next));
            setList(next);
            if (selectedInnovation?.id === innovation.id) {
              setDrawerVisible(false);
              setSelectedInnovation(null);
            }
          },
        },
      ]
    );
  };

  const openDrawer = (innovation) => {
    setSelectedInnovation(innovation);
    setDrawerVisible(true);
  };

  const renderItem = ({ item }) => (
    <View style={styles.row}>
      <Text style={styles.rowTitle} numberOfLines={2}>{item.title}</Text>
      <View style={styles.rowActions}>
        <TouchableOpacity style={styles.rowIconBtn} onPress={() => openDrawer(item)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="expand-outline" size={22} color="#333" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.rowIconBtn} onPress={() => deleteDownload(item)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="trash-outline" size={22} color="#dc2626" />
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>Downloads</Text>
        {list.length > 0 && (
          <Text style={styles.headerCount}>{list.length === 1 ? '1 item' : `${list.length} items`}</Text>
        )}
      </View>
      {list.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons name="download-outline" size={48} color="#999" />
          </View>
          <Text style={styles.emptyTitle}>No downloads yet</Text>
          <Text style={styles.emptyText}>Download solutions from Home to view them offline here.</Text>
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={renderItem}
        />
      )}
      <DetailDrawer
        innovation={selectedInnovation}
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        startExpanded
        downloadedAt={selectedInnovation?.downloadedAt}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  header: { fontSize: 22, fontWeight: '700', color: '#111' },
  headerCount: { fontSize: 14, color: '#666', fontWeight: '500' },
  list: { paddingHorizontal: 20, paddingBottom: 100 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  rowTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: '#111', marginRight: 12, lineHeight: 20 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowIconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#666', textAlign: 'center' },
});
