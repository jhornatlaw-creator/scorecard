window.App = window.App || {};

App.Storage = (() => {
  const DB_NAME = 'ScorecardDB';
  const DB_VER = 1;
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = e => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('cards')) {
          const store = d.createObjectStore('cards', { keyPath: 'id' });
          store.createIndex('date', 'date');
          store.createIndex('completed', 'completed');
        }
      };
      req.onsuccess = e => resolve(e.target.result);
      req.onerror = e => { dbPromise = null; reject(e.target.error); };
    });
    return dbPromise;
  }

  async function save(card) {
    const d = await open();
    return new Promise((resolve, reject) => {
      const tx = d.transaction('cards', 'readwrite');
      tx.objectStore('cards').put(card);
      tx.oncomplete = () => resolve();
      tx.onerror = e => reject(e.target.error);
    });
  }

  async function load(id) {
    const d = await open();
    return new Promise((resolve, reject) => {
      const req = d.transaction('cards').objectStore('cards').get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = e => reject(e.target.error);
    });
  }

  async function list() {
    const d = await open();
    return new Promise((resolve, reject) => {
      const req = d.transaction('cards').objectStore('cards').index('date').openCursor(null, 'prev');
      const results = [];
      req.onsuccess = e => {
        const cursor = e.target.result;
        if (cursor) { results.push(cursor.value); cursor.continue(); }
        else resolve(results);
      };
      req.onerror = e => reject(e.target.error);
    });
  }

  async function remove(id) {
    const d = await open();
    return new Promise((resolve, reject) => {
      const tx = d.transaction('cards', 'readwrite');
      tx.objectStore('cards').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = e => reject(e.target.error);
    });
  }

  return { save, load, list, remove };
})();
