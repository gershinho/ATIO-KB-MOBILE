import React, { useState, useCallback } from 'react';
import {
  StyleSheet, Text, View, FlatList, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatRelativeDate } from '../utils/relativeDate';
import InnovationCard from '../components/InnovationCard';
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
    <View style={styles.cardRow}>
      <View style={styles.cardRowHeader}>
        <Text style={styles.relativeDate}>{formatRelativeDate(item.downloadedAt)}</Text>
        <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteDownload(item)}>
          <Text style={styles.deleteBtnText}>Delete</Text>
        </TouchableOpacity>
      </View>
      <InnovationCard
        innovation={item}
        title={item.title}
        countries={item.countries?.join(', ') || item.region}
        description={item.shortDescription}
        readinessLevel={item.readinessLevel}
        isGrassroots={item.isGrassroots}
        cost={item.cost}
        complexity={item.complexity}
        onLearnMore={() => openDrawer(item)}
        showTopIcons={false}
        thumbsUpCount={item.thumbsUpCount ?? 0}
      />
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  const itemLabel = list.length === 1 ? '1 item' : `${list.length} items`;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerWrap}>
        <Text style={styles.header}>Downloads</Text>
        {list.length > 0 && <Text style={styles.headerCount}>{itemLabel}</Text>}
      </View>
      {list.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
              <Ionicons name="download-outline" size={48} color="#999" />
            </View>
          <Text style={styles.emptyTitle}>No downloads yet</Text>
          <Text style={styles.emptyText}>Download innovations from Home to view them offline here.</Text>
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
  headerWrap: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  header: { fontSize: 22, fontWeight: '700', color: '#111' },
  headerCount: { fontSize: 14, color: '#666', marginTop: 4 },
  list: { padding: 20, paddingBottom: 100 },
  cardRow: { marginBottom: 16 },
  cardRowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  relativeDate: { fontSize: 12, color: '#888' },
  deleteBtn: { paddingVertical: 6, paddingHorizontal: 12 },
  deleteBtnText: { fontSize: 13, color: '#dc2626', fontWeight: '600' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#666', textAlign: 'center' },
});
