import React, { useState } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity,
  FlatList, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fullTextSearch, incrementThumbsUp } from '../database/db';
import InnovationCard from '../components/InnovationCard';
import DetailDrawer from '../components/DetailDrawer';
import CommentsModal from '../components/CommentsModal';

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedInnovation, setSelectedInnovation] = useState(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [commentsInnovation, setCommentsInnovation] = useState(null);

  const handleThumbsUp = async (innovation) => {
    if (!innovation) return;
    try {
      await incrementThumbsUp(innovation.id);
    } catch (e) {
      console.log('Thumbs up failed:', e);
    }
    const bump = (list) =>
      Array.isArray(list)
        ? list.map((item) =>
            item.id === innovation.id
              ? { ...item, thumbsUpCount: (item.thumbsUpCount ?? 0) + 1 }
              : item
          )
        : list;
    setResults((prev) => bump(prev));
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setHasSearched(true);
    try {
      const cleanQuery = query.trim().split(/\s+/).join(' OR ');
      const res = await fullTextSearch(cleanQuery, 30);
      setResults(res);
    } catch (e) {
      console.log('Search error:', e);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const openDrawer = (innovation) => {
    setSelectedInnovation(innovation);
    setDrawerVisible(true);
  };

  const starterPrompts = [
    'How can I reduce post-harvest losses?',
    'Drought-tolerant crops for small farms',
    'Low-cost irrigation solutions',
    'Digital tools for extension services',
  ];

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        {!hasSearched ? (
          <View style={styles.heroSection}>
            <Text style={styles.heroTitle}>Describe the problem you are facing</Text>
            <Text style={styles.heroSubtitle}>Powered by AI</Text>

            <TextInput
              style={styles.searchInput}
              placeholder="Enter your problem description here..."
              placeholderTextColor="#999"
              multiline
              value={query}
              onChangeText={setQuery}
            />

            <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
              <Text style={styles.searchBtnText}>Search Solutions</Text>
            </TouchableOpacity>

            <Text style={styles.promptsTitle}>Try asking about:</Text>
            {starterPrompts.map((p, i) => (
              <TouchableOpacity
                key={i}
                style={styles.promptChip}
                onPress={() => { setQuery(p); }}
              >
                <Text style={styles.promptText}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <>
            <View style={styles.searchBarRow}>
              <TextInput
                style={styles.searchBarInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Search..."
                onSubmitEditing={handleSearch}
              />
              <TouchableOpacity style={styles.searchBarBtn} onPress={handleSearch}>
                <Ionicons name="search-outline" size={22} color="#fff" />
              </TouchableOpacity>
            </View>

            {loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="large" color="#22c55e" />
              </View>
            ) : (
              <FlatList
                data={results}
                keyExtractor={item => String(item.id)}
                contentContainerStyle={styles.resultsList}
                ListHeaderComponent={
                  <Text style={styles.poweredByAI}>Powered by AI</Text>
                }
                renderItem={({ item }) => (
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
                    thumbsUpCount={item.thumbsUpCount ?? 0}
                    onThumbsUp={handleThumbsUp}
                    onComments={setCommentsInnovation}
                  />
                )}
                ListEmptyComponent={
                  <Text style={styles.emptyText}>No innovations found. Try a different search term.</Text>
                }
              />
            )}
          </>
        )}
      </KeyboardAvoidingView>

      <DetailDrawer
        innovation={selectedInnovation}
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        onComments={setCommentsInnovation}
        thumbsUpCount={selectedInnovation?.thumbsUpCount ?? 0}
        onThumbsUp={handleThumbsUp}
      />
      <CommentsModal
        visible={!!commentsInnovation}
        innovation={commentsInnovation}
        onClose={() => setCommentsInnovation(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  heroSection: { flex: 1, paddingHorizontal: 20, paddingTop: 30 },
  heroTitle: { fontSize: 18, fontWeight: '600', textAlign: 'center', marginBottom: 8 },
  heroSubtitle: { fontSize: 12, color: '#999', textAlign: 'center', marginBottom: 20 },
  searchInput: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 14, fontSize: 13, minHeight: 120, textAlignVertical: 'top' },
  searchBtn: { backgroundColor: '#030213', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 12 },
  searchBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  promptsTitle: { fontSize: 12, color: '#999', marginTop: 24, marginBottom: 10 },
  promptChip: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, marginBottom: 8 },
  promptText: { fontSize: 12, color: '#555' },
  searchBarRow: { flexDirection: 'row', padding: 12, paddingHorizontal: 20, gap: 8, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  searchBarInput: { flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13 },
  searchBarBtn: { width: 44, height: 44, backgroundColor: '#030213', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  resultsList: { padding: 20, paddingBottom: 100 },
  poweredByAI: { fontSize: 12, color: '#999', textAlign: 'center', marginBottom: 16 },
  emptyText: { textAlign: 'center', color: '#999', fontSize: 13, padding: 40 },
});
