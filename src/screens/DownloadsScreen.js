import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { readDownloads, writeDownloads } from '../storage/localState';
import DetailDrawer from '../components/DetailDrawer';
import SavedList, { RowIconButton } from '../components/SavedList';
import AppText from '../components/AppText';

export default function DownloadsScreen() {
  const [downloads, setDownloads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [drawerVisible, setDrawerVisible] = useState(false);

  const loadDownloads = useCallback(async () => {
    setDownloads(await readDownloads());
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadDownloads();
    }, [loadDownloads])
  );

  const deleteDownload = (innovation) => {
    Alert.alert('Remove download', `Remove "${innovation.title}" from downloads?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const next = downloads.filter((i) => i.id !== innovation.id);
          if (!(await writeDownloads(next))) {
            Alert.alert('Could not remove download', 'Please try again.');
            return;
          }
          setDownloads(next);
          if (selected?.id === innovation.id) {
            setDrawerVisible(false);
            setSelected(null);
          }
        },
      },
    ]);
  };

  const openDrawer = (innovation) => {
    setSelected(innovation);
    setDrawerVisible(true);
  };

  return (
    <SavedList
      title="Downloads"
      loading={loading}
      items={downloads}
      headerAccessory={
        downloads.length > 0 ? (
          <AppText style={styles.headerCount}>
            {downloads.length === 1 ? '1 item' : `${downloads.length} items`}
          </AppText>
        ) : null
      }
      empty={{
        icon: 'download-outline',
        title: 'No downloads yet',
        text: 'Download solutions from Home to view them offline here.',
      }}
      renderActions={(item) => (
        <>
          <RowIconButton
            icon="expand-outline"
            color="#333"
            onPress={() => openDrawer(item)}
            label={`Open ${item.title}`}
          />
          <RowIconButton
            icon="trash-outline"
            color="#dc2626"
            onPress={() => deleteDownload(item)}
            label={`Remove ${item.title} from downloads`}
          />
        </>
      )}
    >
      <DetailDrawer
        innovation={selected}
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        startExpanded
        downloadedAt={selected?.downloadedAt}
        hideDownloadInHeader
      />
    </SavedList>
  );
}

const styles = StyleSheet.create({
  headerCount: { fontSize: 14, color: '#666', fontWeight: '500' },
});
