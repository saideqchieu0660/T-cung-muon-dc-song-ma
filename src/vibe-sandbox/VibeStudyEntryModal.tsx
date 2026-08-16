import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { get, set } from 'idb-keyval';
import { BookOpen, AlertTriangle, X, DatabaseBackup, Save, RotateCcw, Target } from 'lucide-react';
import { toast } from 'sonner';
import { store, Flashcard, Deck, saveLocalUserDecks } from '../lib/store';
import { cn } from '../lib/utils';
import { useNavigate } from 'react-router-dom';

interface BackupData {
  deckId: string;
  hardCardIds: string[];
  updatedAt: number;
}

interface VibeStudyEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  deck: Deck | null;
}

export function VibeStudyEntryModal({ isOpen, onClose, deck }: VibeStudyEntryModalProps) {
  const navigate = useNavigate();
  const [isConfirmingRestore, setIsConfirmingRestore] = useState(false);
  const [lastBackup, setLastBackup] = useState<BackupData | null>(null);
  
  const [weakCardIds, setWeakCardIds] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen && deck) {
      const storageKey = `weak_cards_${deck.id}`;
      const savedWeakIds = JSON.parse(localStorage.getItem(storageKey) || "[]");
      setWeakCardIds(savedWeakIds);

      // Fetch backup
      get(`vibe_backup_x_${deck.id}`).then((data) => {
        if (data) setLastBackup(data as BackupData);
      }).catch(e => console.error(e));
    } else {
      setIsConfirmingRestore(false);
    }
  }, [isOpen, deck]);

  if (!deck) return null;

  const handleStudyAll = () => {
    navigate(`/study/${deck.id}`);
    onClose();
  };

  const handleStudyWeak = () => {
    if (weakCardIds.length === 0) {
      toast.info("Chưa có thẻ nào được đánh dấu cần học lại (Thẻ X) trong học phần này.");
      return;
    }
    navigate(`/study/${deck.id}?mode=weak`);
    onClose();
  };

  const handleBackup = async () => {
    try {
      const storageKey = `weak_cards_${deck.id}`;
      const savedWeakIds = JSON.parse(localStorage.getItem(storageKey) || "[]");
      const backupData: BackupData = {
        deckId: deck.id,
        hardCardIds: savedWeakIds,
        updatedAt: Date.now()
      };
      await set(`vibe_backup_x_${deck.id}`, backupData);
      setLastBackup(backupData);
    } catch (e) {
      console.error(e);
    }
  };

  const handleRestore = async () => {
    if (!lastBackup) return;
    try {
      const storageKey = `weak_cards_${deck.id}`;
      localStorage.setItem(storageKey, JSON.stringify(lastBackup.hardCardIds));
      setWeakCardIds(lastBackup.hardCardIds);
      
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent("vibe-backup-restored"));
      }
      
      setIsConfirmingRestore(false);
    } catch (e) {
      console.error(e);
    }
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="study-entry-portal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[99999] flex items-center justify-center p-4"
        >
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          
          <motion.div
            key="content"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden z-10"
          >
            <div className="p-5 border-b border-zinc-100 dark:border-zinc-800/60 flex items-start justify-between bg-zinc-50/50 dark:bg-zinc-950/20">
              <div className="pr-8">
                <h3 className="font-extrabold text-xl text-zinc-900 dark:text-zinc-100 line-clamp-1">{deck.title}</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 flex items-center gap-2">
                  <span className="font-semibold bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-md">{deck.cards.length} thẻ</span>
                  {weakCardIds.length > 0 && (
                    <span className="font-semibold text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-500/10 px-2 py-0.5 rounded-md">
                      {weakCardIds.length} thẻ X
                    </span>
                  )}
                </p>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full transition-colors cursor-pointer absolute top-4 right-4 bg-zinc-100 dark:bg-zinc-900 shadow-sm border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="space-y-3">
                <button
                  onClick={handleStudyAll}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-800/40 dark:hover:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/50 transition-all text-left group cursor-pointer active:scale-[0.98]"
                >
                  <div className="p-3 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl group-hover:scale-110 group-hover:bg-blue-500 group-hover:text-white transition-all">
                    <BookOpen className="w-6 h-6" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-base font-bold text-zinc-900 dark:text-zinc-100">Học bình thường</span>
                    <span className="text-sm text-zinc-500 dark:text-zinc-400">Học toàn bộ {deck.cards.length} thẻ trong học phần</span>
                  </div>
                </button>

                <button
                  onClick={handleStudyWeak}
                  className={cn(
                    "w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-left group",
                    weakCardIds.length > 0 
                      ? "bg-orange-50 hover:bg-orange-100 dark:bg-orange-500/10 dark:hover:bg-orange-500/20 border-orange-200 dark:border-orange-500/20 cursor-pointer active:scale-[0.98]"
                      : "bg-zinc-50 dark:bg-zinc-900/50 border-zinc-100 dark:border-zinc-800/50 opacity-60 cursor-not-allowed"
                  )}
                  disabled={weakCardIds.length === 0}
                >
                  <div className={cn(
                    "p-3 rounded-xl transition-all",
                    weakCardIds.length > 0
                      ? "bg-orange-500/20 text-orange-600 dark:text-orange-400 group-hover:scale-110 group-hover:bg-orange-500 group-hover:text-white"
                      : "bg-zinc-200 dark:bg-zinc-800 text-zinc-400"
                  )}>
                    <Target className="w-6 h-6" />
                  </div>
                  <div className="flex flex-col">
                    <span className={cn(
                      "text-base font-bold",
                      weakCardIds.length > 0 ? "text-zinc-900 dark:text-orange-50" : "text-zinc-500 dark:text-zinc-500"
                    )}>Học riêng Thẻ X</span>
                    <span className="text-sm text-zinc-500 dark:text-zinc-400">
                      {weakCardIds.length > 0 ? `Tập trung ôn tập ${weakCardIds.length} thẻ khó` : "Chưa có thẻ X nào để học"}
                    </span>
                  </div>
                </button>
              </div>

              <div className="border-t border-zinc-100 dark:border-zinc-800/60 pt-4 mt-2">
                <div className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-3 px-1">Snapshots Thẻ X</div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={handleBackup}
                    className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl bg-purple-50 hover:bg-purple-100 dark:bg-purple-500/5 dark:hover:bg-purple-500/10 border border-purple-100 dark:border-purple-500/10 text-purple-700 dark:text-purple-400 transition-all group active:scale-95 cursor-pointer"
                  >
                    <Save className="w-5 h-5 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-bold">Lưu trạng thái</span>
                  </button>

                  {!isConfirmingRestore ? (
                    <button
                      onClick={() => {
                        if (lastBackup) setIsConfirmingRestore(true);
                      }}
                      disabled={!lastBackup}
                      className={cn(
                        "flex flex-col items-center justify-center gap-2 p-3 rounded-xl border transition-all",
                        lastBackup 
                          ? "bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-800/40 dark:hover:bg-zinc-800/80 border-zinc-200 dark:border-zinc-700/50 text-zinc-700 dark:text-zinc-300 group active:scale-95 cursor-pointer" 
                          : "bg-zinc-50/50 dark:bg-zinc-900/30 border-zinc-100 dark:border-zinc-800/50 text-zinc-400 dark:text-zinc-600 cursor-not-allowed"
                      )}
                    >
                      <RotateCcw className={cn("w-5 h-5", lastBackup && "group-hover:scale-110 transition-transform")} />
                      <span className="text-xs font-bold text-center">
                        {lastBackup ? `Khôi phục (${lastBackup.hardCardIds.length})` : "Chưa có bản lưu"}
                      </span>
                    </button>
                  ) : (
                    <div className="col-span-2 p-3 bg-orange-500/10 border border-orange-500/20 rounded-xl flex flex-col gap-2">
                      <div className="text-xs font-semibold text-orange-800 dark:text-orange-300 flex items-center justify-center gap-1.5 text-center">
                        <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0" />
                        Ghi đè bằng bản sao lưu {lastBackup?.hardCardIds.length} thẻ?
                      </div>
                      <div className="flex gap-2 mt-1">
                        <button
                          onClick={handleRestore}
                          className="flex-1 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-lg transition-colors"
                        >
                          Chắc chắn
                        </button>
                        <button
                          onClick={() => setIsConfirmingRestore(false)}
                          className="flex-1 py-1.5 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-bold rounded-lg transition-colors"
                        >
                          Hủy
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
