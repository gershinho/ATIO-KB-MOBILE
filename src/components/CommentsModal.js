import React, { useState, useContext } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AccessibilityContext } from '../context/AccessibilityContext';
import useInnovationComments from '../hooks/useInnovationComments';
import AppText from './AppText';

export default function CommentsModal({ visible, innovation, onClose, onCommentAdded }) {
  const insets = useSafeAreaInsets();
  const { reduceMotion } = useContext(AccessibilityContext);
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const { comments, loading, submitting, submitError, submit } = useInnovationComments(
    innovation,
    visible
  );

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    const trimmedText = text.trim();
    if (!trimmedName || !trimmedText) return;
    if (!(await submit(trimmedName, trimmedText))) return;
    Keyboard.dismiss();
    setText('');
    onCommentAdded?.(innovation.id);
  };

  const renderItem = ({ item }) => (
    <View style={styles.commentItem}>
      <View style={styles.commentHeader}>
        <AppText style={styles.commentAuthor}>{item.authorName}</AppText>
        {item.createdAt ? (
          <AppText style={styles.commentDate}>
            {new Date(item.createdAt).toLocaleString(undefined, {
              dateStyle: 'short',
              timeStyle: 'short',
            })}
          </AppText>
        ) : null}
      </View>
      <AppText style={styles.commentBody}>{item.body}</AppText>
    </View>
  );

  if (!visible || !innovation) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? 'none' : 'slide'}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />
        <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
          <View style={styles.sheetHeader}>
            <View style={styles.sheetTitleRow}>
              <Ionicons name="chatbubble-ellipses-outline" size={18} color="#111" />
              <AppText style={styles.sheetTitle} numberOfLines={1}>
                Comments
              </AppText>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#555" />
            </TouchableOpacity>
          </View>
          <AppText style={styles.sheetSubtitle} numberOfLines={2}>
            {innovation.title}
          </AppText>

          <View style={styles.listContainer}>
            {loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="small" color="#22c55e" />
              </View>
            ) : comments.length === 0 ? (
              <View style={styles.emptyWrap}>
                <AppText style={styles.emptyTitle}>No comments yet</AppText>
                <AppText style={styles.emptyText}>
                  Be the first to share your thoughts on this innovation.
                </AppText>
              </View>
            ) : (
              <FlatList
                data={comments}
                keyExtractor={(item) => String(item.id)}
                renderItem={renderItem}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator
                keyboardShouldPersistTaps="handled"
              />
            )}
          </View>

          <View style={styles.form}>
            <AppText style={styles.formTitle}>Add a comment</AppText>
            <TextInput
              style={styles.nameInput}
              placeholder="Your name"
              placeholderTextColor="#9ca3af"
              value={name}
              onChangeText={setName}
            />
            <TextInput
              style={styles.commentInput}
              placeholder="What would you like to say?"
              placeholderTextColor="#9ca3af"
              value={text}
              onChangeText={setText}
              multiline
            />
            {submitError && (
              <AppText style={styles.submitErrorText}>{submitError}</AppText>
            )}
            <TouchableOpacity
              style={[
                styles.submitBtn,
                (!name.trim() || !text.trim() || submitting) && styles.submitBtnDisabled,
              ]}
              onPress={handleSubmit}
              disabled={!name.trim() || !text.trim() || submitting}
            >
              <AppText style={styles.submitBtnText}>
                {submitting ? 'Posting…' : 'Post Comment'}
              </AppText>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    flex: 1,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 20,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  sheetTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  sheetSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 8,
  },
  closeBtn: {
    padding: 4,
  },
  listContainer: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 12,
    overflow: 'hidden',
    backgroundColor: '#f9fafb',
  },
  listContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
  },
  commentItem: {
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingBottom: 8,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  commentAuthor: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
  commentDate: {
    fontSize: 11,
    color: '#9ca3af',
  },
  commentBody: {
    fontSize: 13,
    color: '#374151',
    lineHeight: 18,
  },
  form: {
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 10,
  },
  formTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 6,
  },
  nameInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    marginBottom: 6,
    backgroundColor: '#fff',
  },
  commentInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    minHeight: 60,
    textAlignVertical: 'top',
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  submitBtn: {
    backgroundColor: '#111827',
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    backgroundColor: '#9ca3af',
  },
  submitErrorText: {
    color: '#dc2626',
    fontSize: 12,
    marginBottom: 8,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});

