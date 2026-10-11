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
  localUri?: string;
  downloadedAt?: number;
}

const HISTORY_FILE = (documentDirectory ?? '') + 'download_history.json';

// Global shared state across screens for instantaneous synchronization
let globalHistory: HistoryItem[] = [];
let hasLoadedFromFile = false;
const listeners = new Set<(items: HistoryItem[]) => void>();

function notifyListeners() {
  listeners.forEach(fn => fn(globalHistory));
}

export function useDownloadHistory() {
  const [history, setHistory] = useState<HistoryItem[]>(globalHistory);
  const [filter, setFilter] = useState<HistoryFilter>('all');

  useEffect(() => {
    listeners.add(setHistory);

    if (!hasLoadedFromFile) {
      (async () => {
        try {
          if (!documentDirectory) return;
          const info = await getInfoAsync(HISTORY_FILE);
          if (info.exists) {
            const raw = await readAsStringAsync(HISTORY_FILE);
            const parsed = JSON.parse(raw) as HistoryItem[];
            if (Array.isArray(parsed)) {
              globalHistory = parsed;
              hasLoadedFromFile = true;
              notifyListeners();
            }
          }
        } catch {
          // fresh start
        } finally {
          hasLoadedFromFile = true;
        }
      })();
    } else {
      setHistory(globalHistory);
    }

    return () => {
      listeners.delete(setHistory);
    };
  }, []);

  const saveHistoryToFile = (items: HistoryItem[]) => {
    if (!documentDirectory) return;
    writeAsStringAsync(HISTORY_FILE, JSON.stringify(items)).catch(() => {});
  };

  const addHistoryItem = (item: HistoryItem) => {
    const filtered = globalHistory.filter(h => h.url !== item.url);
    const updated = [item, ...filtered].slice(0, 30);
    globalHistory = updated;
    notifyListeners();
    saveHistoryToFile(updated);
  };

  const updateHistoryItem = (url: string, patch: Partial<HistoryItem>) => {
    const updated = globalHistory.map(item =>
      item.url === url ? { ...item, ...patch } : item
    );
    globalHistory = updated;
    notifyListeners();
    saveHistoryToFile(updated);
  };

  const removeHistoryItem = (url: string) => {
    const updated = globalHistory.filter(h => h.url !== url);
    globalHistory = updated;
    notifyListeners();
    saveHistoryToFile(updated);
  };

  const clearHistory = async () => {
    globalHistory = [];
    notifyListeners();
    try {
      if (documentDirectory) {
        await writeAsStringAsync(HISTORY_FILE, JSON.stringify([])).catch(() => {});
      }
    } catch {}
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
    updateHistoryItem,
    removeHistoryItem,
    clearHistory,
  };
}
