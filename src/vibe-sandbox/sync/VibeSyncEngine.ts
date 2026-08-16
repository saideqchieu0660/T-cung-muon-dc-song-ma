import React, { useEffect } from "react";
import { get, set, del, keys } from "idb-keyval";
import { db } from "../../lib/firebase";
import { collection, doc, getDocs, query, where, writeBatch, getDoc } from "firebase/firestore";
import { Deck, store } from "../../lib/store";
import { isFeatureEnabled } from "../../features.config";
import { auth } from "../../lib/firebase";

const SYNC_QUEUE_KEY = "vibe_offline_sync_queue_v3";
const DEBOUNCE_MS = 3000;

export interface SyncAction {
  id: string;
  type: "UPSERT_DECK" | "DELETE_DECK" | "UPSERT_PROFILE" | "UPSERT_PROGRESS" | "UPSERT_CARD_STATE";
  payload: any;
  timestamp: number;
}

class SyncEngineClass {
  private isSyncing = false;
  private listeners: (() => void)[] = [];
  private syncTimeout: any = null;
  private queueLock: Promise<void> = Promise.resolve();

  subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach(l => l());
  }

  async getQueue(): Promise<SyncAction[]> {
    try {
      return (await get<SyncAction[]>(SYNC_QUEUE_KEY)) || [];
    } catch (e) {
      console.warn("[VibeSyncEngine] getQueue failed:", e);
      return [];
    }
  }

  async setQueue(queue: SyncAction[]) {
    try {
      await set(SYNC_QUEUE_KEY, queue);
    } catch (e) {
      console.warn("[VibeSyncEngine] setQueue failed:", e);
    }
  }

  // Unified enqueue with debounce strategy (Batched Sync)
  async enqueueChange(action: Omit<SyncAction, "id" | "timestamp">) {
    const operation = async () => {
      try {
        const queue = await this.getQueue();
        // Resolve conflicts inside queue if they target the same entity
        const existingIdx = queue.findIndex(q => {
          if (q.type !== action.type) return false;
          if (action.type === "UPSERT_CARD_STATE") {
            return q.payload.cardId === action.payload.cardId && q.payload.uid === action.payload.uid;
          }
          return q.payload.id === action.payload.id;
        });
        if (existingIdx !== -1) {
          queue[existingIdx] = {
            ...queue[existingIdx],
            payload: { ...queue[existingIdx].payload, ...action.payload }, // Merge payload
            timestamp: Date.now()
          };
        } else {
          queue.push({
            ...action,
            id: `sync_${Date.now()}_${Math.random().toString(36).substring(2,9)}`,
            timestamp: Date.now()
          });
        }
        
        await this.setQueue(queue);
        
        if (navigator.onLine) {
          this.scheduleSync();
        }
      } catch (e) {
        console.warn("[VibeSyncEngine] enqueueChange failed:", e);
      }
    };

    this.queueLock = this.queueLock.then(() => operation()).catch(() => operation());
    await this.queueLock;
  }

  scheduleSync() {
    if (this.syncTimeout) clearTimeout(this.syncTimeout);
    this.syncTimeout = setTimeout(() => {
      this.syncNow();
    }, DEBOUNCE_MS);
  }

  async syncNow() {
    if (this.isSyncing || !navigator.onLine) return;
    this.isSyncing = true;
    
    try {
      let queue = await this.getQueue();
      
      if (queue.length > 0) {
        const batch = writeBatch(db);
        for (const item of queue) {
          if (item.type === "UPSERT_DECK") {
            const deckRef = doc(db, "vibe_decks", item.payload.id);
            batch.set(deckRef, { ...item.payload, lastUpdatedAt: item.timestamp }, { merge: true });
          } else if (item.type === "DELETE_DECK") {
            const deckRef = doc(db, "vibe_decks", item.payload.id);
            batch.delete(deckRef);
          } else if (item.type === "UPSERT_PROFILE") {
            const profileRef = doc(db, "users", item.payload.id);
            batch.set(profileRef, { ...item.payload, lastUpdatedAt: item.timestamp }, { merge: true });
          } else if (item.type === "UPSERT_CARD_STATE") {
            const cardStateRef = doc(db, "users", item.payload.uid, "cardsState", item.payload.cardId);
            batch.set(cardStateRef, { ...item.payload, lastUpdatedAt: item.timestamp }, { merge: true });
          } else if (item.type === "UPSERT_PROGRESS") {
             const progressRef = doc(db, "vibe_progress", item.payload.id);
             batch.set(progressRef, { ...item.payload, lastUpdatedAt: item.timestamp }, { merge: true });
          }
        }
        await batch.commit();
        // Clear successfully synced items
        await this.setQueue([]);
      }
    } catch (e) {
      console.error("[VibeSyncEngine] Sync failed:", e);
    } finally {
      this.isSyncing = false;
    }
  }

  async pullFromFirestore() {
    const user = store.getCurrentUser() || auth.currentUser;
    if (!user) return;
    const uid = typeof user === 'string' ? user : (user as any).uid || (user as any).id;
    if (!uid) return;
    
    try {
      // Pull Decks
      const q = query(collection(db, "vibe_decks"), where("ownerId", "==", uid));
      const snap = await getDocs(q);
      const remoteDecks: Deck[] = [];
      snap.forEach(d => remoteDecks.push({ id: d.id, ...d.data() } as Deck));
      
      for (const deck of remoteDecks) {
        // Conflict resolution: keep whichever is newer
        try {
          const local = await get(`vibe_deck_${deck.id}`) as any;
          if (!local || !local.lastUpdatedAt || (deck as any).lastUpdatedAt > local.lastUpdatedAt) {
             await set(`vibe_deck_${deck.id}`, deck);
          }
        } catch (e) { console.warn(e); }
      }

      // Pull Profile
      const pDoc = await getDoc(doc(db, "users", uid));
      if (pDoc.exists()) {
         const remoteProfile = pDoc.data();
         try {
           const localProfile = await get(`vibe_profile_${uid}`) as any;
           if (!localProfile || !localProfile.lastUpdatedAt || remoteProfile.lastUpdatedAt > localProfile.lastUpdatedAt) {
              await set(`vibe_profile_${uid}`, remoteProfile);
           }
         } catch (e) { console.warn(e); }
      }
      
      this.notify();
    } catch (e) {
      console.error("[VibeSyncEngine] Pull failed:", e);
    }
  }

  // --- Local IDB Access for UI ---

  async getLocalDecks(): Promise<Deck[]> {
    let allKeys: IDBValidKey[] = [];
    try {
      allKeys = await keys();
    } catch (e) {
      console.warn("[VibeSyncEngine] getLocalDecks keys error:", e);
    }
    const deckKeys = allKeys.filter(k => typeof k === 'string' && k.startsWith("vibe_deck_"));
    const localDecks: Deck[] = [];
    for (const k of deckKeys) {
      try {
        const d = await get(k as string);
        if (d) localDecks.push(d as Deck);
      } catch (e) { console.warn(e); }
    }
    
    // Get all legacy decks (includes system decks + user's created decks)
    const legacyDecks = store.getDecks();
    const mergedDecks = [...legacyDecks];
    
    for (const ld of localDecks) {
      const existingIdx = mergedDecks.findIndex(md => md.id === ld.id);
      if (existingIdx >= 0) {
        const existingDeck = mergedDecks[existingIdx];
        let mergedCards = ld.cards ? [...ld.cards] : [];
        if (existingDeck.cards && mergedCards.length > 0) {
           mergedCards = mergedCards.map(lc => {
              const ec = existingDeck.cards.find(c => c.id === lc.id);
              return ec ? { ...lc, ...ec } : lc;
           });
           
           existingDeck.cards.forEach(ec => {
              if (!mergedCards.find(c => c.id === ec.id)) {
                 mergedCards.push(ec);
              }
           });
        } else if (existingDeck.cards) {
           mergedCards = existingDeck.cards;
        }
        
        mergedDecks[existingIdx] = { 
            ...ld, 
            ...existingDeck, 
            cards: mergedCards 
        };
      } else {
        mergedDecks.push(ld);
      }
    }
    
    // Apply pending local card states
    const currentUser = store.getCurrentUser();
    if (currentUser) {
      const stateKeys = allKeys.filter(k => typeof k === 'string' && k.startsWith(`vibe_cardstate_${currentUser.id}_`));
      for (const k of stateKeys) {
        try {
          const statePayload = await get(k as string) as any;
          if (statePayload && statePayload.cardId) {
             for (const md of mergedDecks) {
                if (md.cards) {
                   const card = md.cards.find(c => c.id === statePayload.cardId);
                   if (card) {
                      card.isHard = typeof statePayload.isWeakCard !== "undefined" ? statePayload.isWeakCard : card.isHard;
                      card.mastery = typeof statePayload.mastery === "number" ? statePayload.mastery : card.mastery;
                      card.lastPointAwarded = statePayload.lastPointAwarded || card.lastPointAwarded;
                      card.updatedAt = statePayload.updatedAt || card.updatedAt;
                   }
                }
             }
          }
        } catch (e) { console.warn(e); }
      }
    }

    return mergedDecks;
  }

  async getDeck(deckId: string): Promise<Deck | null> {
    try {
      const d = await get(`vibe_deck_${deckId}`);
      if (d) return d as Deck;
    } catch (e) {
      console.warn("[VibeSyncEngine] getDeck error:", e);
    }
    return store.getDeck(deckId) || null;
  }

  async saveDeck(deck: Deck) {
    const user = store.getCurrentUser() || auth.currentUser;
    const uid = typeof user === 'string' ? user : ((user as any)?.uid || (user as any)?.id);
    
    const deckToSave = { ...deck };
    if (uid) {
      if (!(deckToSave as any).ownerId) (deckToSave as any).ownerId = uid;
      if (!deckToSave.createdBy) deckToSave.createdBy = uid;
    }

    const timestamp = Date.now();
    try {
      await set(`vibe_deck_${deckToSave.id}`, { ...deckToSave, lastUpdatedAt: timestamp });
    } catch (e) {
      console.warn("[VibeSyncEngine] saveDeck error:", e);
    }
    await this.enqueueChange({ type: "UPSERT_DECK", payload: deckToSave });
    this.notify();
  }

  async deleteDeck(deckId: string) {
    try {
      await del(`vibe_deck_${deckId}`);
    } catch (e) {
      console.warn("[VibeSyncEngine] deleteDeck error:", e);
    }
    await this.enqueueChange({ type: "DELETE_DECK", payload: { id: deckId } });
    this.notify();
  }
  
  async updateCard(deckId: string, cardId: string, updates: any) {
    try {
       const deck = await get<Deck>(`vibe_deck_${deckId}`);
       if (deck && deck.cards) {
           deck.cards = deck.cards.map(c => c.id === cardId ? { ...c, ...updates } : c);
           await this.saveDeck(deck);
       }
    } catch (e) {
       console.warn("[VibeSyncEngine] updateCard error:", e);
    }
  }

  async updateCardState(uid: string, cardId: string, statePayload: any) {
    const timestamp = Date.now();
    const merged = { ...statePayload, uid, cardId, lastUpdatedAt: timestamp };
    
    // Cache the state locally so it can be merged if offline
    try {
      await set(`vibe_cardstate_${uid}_${cardId}`, merged);
    } catch (e) {
      console.warn("[VibeSyncEngine] updateCardState IDB error:", e);
    }

    await this.enqueueChange({ type: "UPSERT_CARD_STATE", payload: merged });
    this.notify();
  }

  async saveProfile(uid: string, updates: any) {
    const timestamp = Date.now();
    let current: any = {};
    try {
      current = await get(`vibe_profile_${uid}`) || {};
    } catch (e) {
      console.warn("[VibeSyncEngine] saveProfile get error:", e);
    }
    const merged = { ...current, ...updates, lastUpdatedAt: timestamp };
    try {
      await set(`vibe_profile_${uid}`, merged);
    } catch (e) {
      console.warn("[VibeSyncEngine] saveProfile set error:", e);
    }
    await this.enqueueChange({ type: "UPSERT_PROFILE", payload: { id: uid, ...merged } });
    this.notify();
  }
}

export const VibeSyncEngine = new SyncEngineClass();
