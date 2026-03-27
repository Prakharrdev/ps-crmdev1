// apps/web/lib/db.ts

const DB_NAME = "jansamadhan_chat_db";
const STORE_NAME = "state";
const DB_VERSION = 1;

/**
 * Initialize IndexedDB securely
 */
export async function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    
    request.onsuccess = (e) => {
      resolve((e.target as IDBOpenDBRequest).result);
    };
    
    request.onerror = (e) => {
      reject((e.target as IDBOpenDBRequest).error);
    };
  });
}

/**
 * Save an object state into IndexedDB, supporting Blobs/Files natively.
 */
export async function saveSharedState(key: string, value: any): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(value, key);
    
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject((e.target as IDBRequest).error);
  });
}

/**
 * Retrieve state seamlessly
 */
export async function getSharedState(key: string): Promise<any> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);
    
    request.onsuccess = (e) => resolve((e.target as IDBRequest).result);
    request.onerror = (e) => reject((e.target as IDBRequest).error);
  });
}

/**
 * Clear a specific user's state securely
 */
export async function clearSharedState(key: string): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(key);
    
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject((e.target as IDBRequest).error);
  });
}
