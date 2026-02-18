import React, { useState, useCallback, useRef } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity,
  FlatList, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { incrementThumbsUp } from '../database/db';
import { aiSearch } from '../config/api';
import useSpeechToText from '../hooks/useSpeechToText';
import InnovationCard from '../components/InnovationCard';
import DetailDrawer from '../components/DetailDrawer';
import CommentsModal from '../components/CommentsModal';

const PAGE_SIZE = 5;

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(null);
  const [selectedInnovation, setSelectedInnovation] = useState(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [commentsInnovation, setCommentsInnovation] = useState(null);

  // Track the current query for pagination (so load-more uses the right query)
  const currentQueryRef = useRef('');
  const searchAfterSpeechRef = useRef(false);

  const { isListening, isTranscribing, toggle: toggleSpeech } = useSpeechToText(
    useCallback((text, isFinal) => {
      setQuery(text);
      if (isFinal && text.trim()) {
        searchAfterSpeechRef.current = true;
      }
    }, [])
  );

  // Auto-trigger search when speech recognition delivers a final result
  React.useEffect(() => {
    if (searchAfterSpeechRef.current && query.trim() && !isListening) {
      searchAfterSpeechRef.current = false;
      handleSearch();
    }
  }, [isListening, query]);

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

  const handleSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setLoading(true);
    setHasSearched(true);
    setError(null);
    setResults([]);
    setHasMore(false);
    currentQueryRef.current = trimmed;

    try {
      const data = await aiSearch(trimmed, 0, PAGE_SIZE);
      const sorted = (data.results || []).sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
      setResults(sorted);
      setHasMore(data.hasMore || false);
    } catch (e) {
      console.log('AI Search error:', e);
      setError(e.message || 'Search failed. Please check your connection.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;

    setLoadingMore(true);
    try {
      const data = await aiSearch(
        currentQueryRef.current,
        results.length,
        PAGE_SIZE
      );
      const appended = [...results, ...(data.results || [])].sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
      setResults(appended);
      setHasMore(data.hasMore || false);
    } catch (e) {
      console.log('Load more error:', e);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, results.length]);

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

  const renderFooter = () => {
    if (!hasMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color="#22c55e" />
        <Text style={styles.footerText}>Loading more innovations...</Text>
      </View>
    );
  };

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

            <View style={styles.heroActions}>
              <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
                <Text style={styles.searchBtnText}>Search Solutions</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.micBtn, (isListening || isTranscribing) && styles.micBtnActive]}
                onPress={toggleSpeech}
                activeOpacity={0.7}
                disabled={isTranscribing}
              >
                {isTranscribing
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name={isListening ? 'mic' : 'mic-outline'} size={22} color={isListening ? '#fff' : '#374151'} />
                }
              </TouchableOpacity>
            </View>
            {(isListening || isTranscribing) && (
              <Text style={styles.listeningLabel}>
                {isTranscribing ? 'Transcribing...' : 'Listening...'}
              </Text>
            )}

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
              <TouchableOpacity
                style={[styles.searchBarMicBtn, (isListening || isTranscribing) && styles.micBtnActive]}
                onPress={toggleSpeech}
                activeOpacity={0.7}
                disabled={isTranscribing}
              >
                {isTranscribing
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name={isListening ? 'mic' : 'mic-outline'} size={20} color={isListening ? '#fff' : '#374151'} />
                }
              </TouchableOpacity>
              <TouchableOpacity style={styles.searchBarBtn} onPress={handleSearch}>
                <Ionicons name="search-outline" size={22} color="#fff" />
              </TouchableOpacity>
            </View>

            {loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="large" color="#22c55e" />
                <Text style={styles.loadingText}>AI is finding the best solutions...</Text>
              </View>
            ) : error ? (
              <View style={styles.errorWrap}>
                <Ionicons name="warning-outline" size={32} color="#d97706" />
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={handleSearch}>
                  <Text style={styles.retryBtnText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <FlatList
                data={results}
                keyExtractor={item => String(item.id)}
                contentContainerStyle={styles.resultsList}
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
                ListFooterComponent={renderFooter}
                onEndReached={handleLoadMore}
                onEndReachedThreshold={0.3}
              />
            )}
          </>
        )}
      </KeyboardAvoidingView>

      <DetailDrawer
        innovation={selectedInnovation}
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
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
  heroActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  searchBtn: { flex: 1, backgroundColor: '#030213', borderRadius: 12, padding: 14, alignItems: 'center' },
  searchBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  micBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  micBtnActive: { backgroundColor: '#dc2626' },
  listeningLabel: { textAlign: 'center', color: '#dc2626', fontSize: 12, fontWeight: '500', marginTop: 8 },
  promptsTitle: { fontSize: 12, color: '#999', marginTop: 24, marginBottom: 10 },
  promptChip: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, marginBottom: 8 },
  promptText: { fontSize: 12, color: '#555' },
  searchBarRow: { flexDirection: 'row', padding: 12, paddingHorizontal: 20, gap: 8, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  searchBarInput: { flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13 },
  searchBarMicBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  searchBarBtn: { width: 44, height: 44, backgroundColor: '#030213', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: '#999', fontSize: 13, marginTop: 8 },
  errorWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, gap: 12 },
  errorText: { textAlign: 'center', color: '#666', fontSize: 13, lineHeight: 20 },
  retryBtn: { backgroundColor: '#030213', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
  retryBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  resultsList: { padding: 20, paddingBottom: 100 },
  emptyText: { textAlign: 'center', color: '#999', fontSize: 13, padding: 40 },
  footerLoader: { paddingVertical: 20, alignItems: 'center', gap: 8 },
  footerText: { color: '#999', fontSize: 12 },
});
