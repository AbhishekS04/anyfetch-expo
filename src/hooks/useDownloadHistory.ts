import { useEffect, useState } from 'react';
import {
  documentDirectory,
  getInfoAsync,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';
import { SupportedPlatform } from '../theme/platformColors';
import { ExtractedResult, ExtractedMediaItem } from '../extractors/types';

export type HistoryFilter = 'all' | SupportedPlatform;

export interface HistoryItem {
  url: string;
  platform: SupportedPlatform;
  singleResult: ExtractedResult | null;
  carouselItems: ExtractedMediaItem[];
}

const HISTORY_FILE = (documentDirectory ?? '') + 'download_history.json';

export function useDownloadHistory() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [ready, setReady] = useState(false);

  // Load saved history on mount
  useEffect(() => {
    (async () => {
      try {
        if (!documentDirectory) return;
        const info = await getInfoAsync(HISTORY_FILE);
        if (info.exists) {
          const raw = await readAsStringAsync(HISTORY_FILE);
          const parsed = JSON.parse(raw) as HistoryItem[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            setHistory(parsed);
          }
        }
      } catch {
        // Start fresh on read error
      } finally {
        setReady(true);
      }
    })();
  }, []);

  // Save history on changes
  useEffect(() => {
    if (!ready || !documentDirectory) return;
    writeAsStringAsync(HISTORY_FILE, JSON.stringify(history)).catch(() => {});
  }, [history, ready]);

  const addHistoryItem = (item: HistoryItem) => {
    setHistory(prev => {
      const filtered = prev.filter(h => h.url !== item.url);
      return [item, ...filtered].slice(0, 30);
    });
  };

  const removeHistoryItem = (url: string) => {
    setHistory(prev => prev.filter(h => h.url !== url));
  };

  const filteredItems = history.filter(
    item => filter === 'all' || item.platform === filter
  );

  return {
    history,
    filter,
    setFilter,
    filteredItems,
    addHistoryItem,
    removeHistoryItem,
  };
}
