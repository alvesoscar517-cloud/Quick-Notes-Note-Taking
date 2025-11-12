// indexeddb-manager.js - Direct IndexedDB Manager using Dexie
// Quản lý IndexedDB trực tiếp, không qua adapter

class IndexedDBManager {
    constructor() {
        this.db = null;
        this.initPromise = null;
    }

    async initialize() {
        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = (async () => {
            try {
                if (typeof Dexie === 'undefined') {
                    throw new Error('Dexie.js not loaded');
                }

                this.db = new Dexie('QuickNotesDB');

                this.db.version(1).stores({
                    notes: 'id, lastModified, collectionId, isDraft, pinned, category',
                    collections: 'id, lastModified, createdAt',
                    trash: 'id, deletedAt',
                    settings: 'key'
                });

                await this.db.open();
                console.log('[IndexedDB] Database initialized successfully');
                return true;
            } catch (error) {
                console.error('[IndexedDB] Initialization failed:', error);
                throw error;
            }
        })();

        return this.initPromise;
    }

    async ensureInitialized() {
        if (!this.db) {
            await this.initialize();
        }
    }

    // Notes operations
    async getAllNotes() {
        await this.ensureInitialized();
        const notes = await this.db.notes.toArray();
        const notesObj = {};
        notes.forEach(note => notesObj[note.id] = note);
        return notesObj;
    }

    async getNote(noteId) {
        await this.ensureInitialized();
        return await this.db.notes.get(noteId);
    }

    async saveNote(note) {
        await this.ensureInitialized();
        return await this.db.notes.put(note);
    }

    async saveNotes(notes) {
        await this.ensureInitialized();
        const notesArray = Array.isArray(notes) ? notes : Object.values(notes);
        return await this.db.notes.bulkPut(notesArray);
    }

    async deleteNote(noteId) {
        await this.ensureInitialized();
        return await this.db.notes.delete(noteId);
    }

    async clearAllNotes() {
        await this.ensureInitialized();
        return await this.db.notes.clear();
    }

    // Collections operations
    async getAllCollections() {
        await this.ensureInitialized();
        const collections = await this.db.collections.toArray();
        const collectionsObj = {};
        collections.forEach(coll => collectionsObj[coll.id] = coll);
        return collectionsObj;
    }

    async getCollection(collectionId) {
        await this.ensureInitialized();
        return await this.db.collections.get(collectionId);
    }

    async saveCollection(collection) {
        await this.ensureInitialized();
        return await this.db.collections.put(collection);
    }

    async saveCollections(collections) {
        await this.ensureInitialized();
        const collectionsArray = Array.isArray(collections) ? collections : Object.values(collections);
        return await this.db.collections.bulkPut(collectionsArray);
    }

    async deleteCollection(collectionId) {
        await this.ensureInitialized();
        return await this.db.collections.delete(collectionId);
    }

    async clearAllCollections() {
        await this.ensureInitialized();
        return await this.db.collections.clear();
    }

    // Trash operations
    async getAllTrash() {
        await this.ensureInitialized();
        const trash = await this.db.trash.toArray();
        const trashObj = {};
        trash.forEach(item => trashObj[item.id] = item);
        return trashObj;
    }

    async getTrashItem(itemId) {
        await this.ensureInitialized();
        return await this.db.trash.get(itemId);
    }

    async saveTrashItem(item) {
        await this.ensureInitialized();
        return await this.db.trash.put(item);
    }

    async saveTrashItems(items) {
        await this.ensureInitialized();
        const itemsArray = Array.isArray(items) ? items : Object.values(items);
        return await this.db.trash.bulkPut(itemsArray);
    }

    async deleteTrashItem(itemId) {
        await this.ensureInitialized();
        return await this.db.trash.delete(itemId);
    }

    async clearAllTrash() {
        await this.ensureInitialized();
        return await this.db.trash.clear();
    }

    // Settings operations
    async getSetting(key) {
        await this.ensureInitialized();
        const setting = await this.db.settings.get(key);
        return setting ? setting.value : undefined;
    }

    async getSettings(keys) {
        await this.ensureInitialized();
        const result = {};
        for (const key of keys) {
            const setting = await this.db.settings.get(key);
            if (setting) {
                result[key] = setting.value;
            }
        }
        return result;
    }

    async saveSetting(key, value) {
        await this.ensureInitialized();
        return await this.db.settings.put({ key, value });
    }

    async saveSettings(settings) {
        await this.ensureInitialized();
        const settingsArray = Object.entries(settings).map(([key, value]) => ({ key, value }));
        return await this.db.settings.bulkPut(settingsArray);
    }

    async deleteSetting(key) {
        await this.ensureInitialized();
        return await this.db.settings.delete(key);
    }

    async deleteSettings(keys) {
        await this.ensureInitialized();
        return await this.db.settings.bulkDelete(keys);
    }

    // Combined get operation (for backward compatibility)
    async get(keys) {
        await this.ensureInitialized();
        const result = {};
        const keyArray = Array.isArray(keys) ? keys : (typeof keys === 'string' ? [keys] : Object.keys(keys));

        for (const key of keyArray) {
            if (key === 'notes') {
                result.notes = await this.getAllNotes();
            } else if (key === 'collections') {
                result.collections = await this.getAllCollections();
            } else if (key === 'trash') {
                result.trash = await this.getAllTrash();
            } else {
                const value = await this.getSetting(key);
                if (value !== undefined) {
                    result[key] = value;
                }
            }
        }

        return result;
    }

    // Combined set operation (for backward compatibility)
    async set(data) {
        await this.ensureInitialized();
        const operations = [];

        if (data.notes) {
            operations.push(this.saveNotes(data.notes));
        }

        if (data.collections) {
            operations.push(this.saveCollections(data.collections));
        }

        if (data.trash) {
            operations.push(this.saveTrashItems(data.trash));
        }

        // Save other settings
        const settingsToSave = {};
        for (const [key, value] of Object.entries(data)) {
            if (!['notes', 'collections', 'trash'].includes(key)) {
                settingsToSave[key] = value;
            }
        }

        if (Object.keys(settingsToSave).length > 0) {
            operations.push(this.saveSettings(settingsToSave));
        }

        await Promise.all(operations);
    }

    // Combined remove operation (for backward compatibility)
    async remove(keys) {
        await this.ensureInitialized();
        const keyArray = Array.isArray(keys) ? keys : [keys];

        for (const key of keyArray) {
            if (key === 'notes') {
                await this.clearAllNotes();
            } else if (key === 'collections') {
                await this.clearAllCollections();
            } else if (key === 'trash') {
                await this.clearAllTrash();
            } else {
                await this.deleteSetting(key);
            }
        }
    }

    // Clear entire database
    async clear() {
        await this.ensureInitialized();
        
        // Clear all tables instead of deleting database
        // This is safer and doesn't cause DatabaseClosedError
        console.log('[IndexedDB] Clearing all data...');
        
        await Promise.all([
            this.db.notes.clear(),
            this.db.collections.clear(),
            this.db.trash.clear(),
            this.db.settings.clear()
        ]);
        
        console.log('[IndexedDB] All data cleared');
    }

    // Query operations for advanced usage
    async queryNotes(filter) {
        await this.ensureInitialized();
        let query = this.db.notes;

        if (filter.collectionId) {
            query = query.where('collectionId').equals(filter.collectionId);
        }
        if (filter.isDraft !== undefined) {
            query = query.where('isDraft').equals(filter.isDraft);
        }
        if (filter.pinned !== undefined) {
            query = query.where('pinned').equals(filter.pinned);
        }

        return await query.toArray();
    }

    async countNotes(filter = {}) {
        await this.ensureInitialized();
        let query = this.db.notes;

        if (filter.collectionId) {
            query = query.where('collectionId').equals(filter.collectionId);
        }

        return await query.count();
    }
}

// Create singleton instance
const dbManager = new IndexedDBManager();

// Add BroadcastChannel for cross-tab synchronization
if (typeof BroadcastChannel !== 'undefined' && typeof window !== 'undefined') {
    dbManager._broadcastChannel = new BroadcastChannel('indexeddb-sync');

    // Listen for changes from other tabs
    dbManager._broadcastChannel.onmessage = (event) => {
        if (event.data.type === 'storage-changed') {
            console.log('[IndexedDB] Received storage change from another tab:', event.data.changes);
            // Emit to local listeners
            dbManager._listeners.forEach(listener => {
                try {
                    listener(event.data.changes, 'local');
                } catch (error) {
                    console.error('Error in storage change listener:', error);
                }
            });
        }
    };
}

// Add event emitter functionality for storage change notifications
dbManager._listeners = [];
dbManager.onChanged = {
    addListener: function (callback) {
        dbManager._listeners.push(callback);
    },
    removeListener: function (callback) {
        const index = dbManager._listeners.indexOf(callback);
        if (index > -1) {
            dbManager._listeners.splice(index, 1);
        }
    }
};

// Helper function to emit change events
dbManager._emitChange = function (changes) {
    // Emit to local listeners
    dbManager._listeners.forEach(listener => {
        try {
            listener(changes, 'local');
        } catch (error) {
            console.error('Error in storage change listener:', error);
        }
    });

    // Broadcast to other tabs using BroadcastChannel
    if (dbManager._broadcastChannel) {
        try {
            dbManager._broadcastChannel.postMessage({
                type: 'storage-changed',
                changes: changes
            });
        } catch (error) {
            console.error('Error broadcasting to other tabs:', error);
        }
    }

    // If in service worker context, broadcast to all windows
    if (typeof chrome !== 'undefined' && chrome.runtime && typeof window === 'undefined') {
        chrome.runtime.sendMessage({
            action: 'storageChanged',
            changes: changes,
            namespace: 'local'
        }).catch(() => {
            // Ignore errors if no listeners
        });
    }
};

// Override methods to emit change events
const originalSet = dbManager.set.bind(dbManager);
dbManager.set = async function (data) {
    const result = await originalSet(data);

    // Emit change event
    const changes = {};
    for (const key in data) {
        changes[key] = { newValue: data[key] };
    }

    dbManager._emitChange(changes);
    return result;
};

// Override saveNote to emit change
const originalSaveNote = dbManager.saveNote.bind(dbManager);
dbManager.saveNote = async function (note) {
    const result = await originalSaveNote(note);
    const notes = await dbManager.getAllNotes();
    dbManager._emitChange({ notes: { newValue: notes } });
    return result;
};

// Override saveNotes to emit change
const originalSaveNotes = dbManager.saveNotes.bind(dbManager);
dbManager.saveNotes = async function (notes) {
    const result = await originalSaveNotes(notes);
    const allNotes = await dbManager.getAllNotes();
    dbManager._emitChange({ notes: { newValue: allNotes } });
    return result;
};

// Override deleteNote to emit change
const originalDeleteNote = dbManager.deleteNote.bind(dbManager);
dbManager.deleteNote = async function (noteId) {
    const result = await originalDeleteNote(noteId);
    const notes = await dbManager.getAllNotes();
    dbManager._emitChange({ notes: { newValue: notes } });
    return result;
};

// Override clearAllNotes to emit change
const originalClearAllNotes = dbManager.clearAllNotes.bind(dbManager);
dbManager.clearAllNotes = async function () {
    const result = await originalClearAllNotes();
    dbManager._emitChange({ notes: { newValue: {} } });
    return result;
};

// Override saveCollection to emit change
const originalSaveCollection = dbManager.saveCollection.bind(dbManager);
dbManager.saveCollection = async function (collection) {
    const result = await originalSaveCollection(collection);
    const collections = await dbManager.getAllCollections();
    dbManager._emitChange({ collections: { newValue: collections } });
    return result;
};

// Override saveCollections to emit change
const originalSaveCollections = dbManager.saveCollections.bind(dbManager);
dbManager.saveCollections = async function (collections) {
    const result = await originalSaveCollections(collections);
    const allCollections = await dbManager.getAllCollections();
    dbManager._emitChange({ collections: { newValue: allCollections } });
    return result;
};

// Override deleteCollection to emit change
const originalDeleteCollection = dbManager.deleteCollection.bind(dbManager);
dbManager.deleteCollection = async function (collectionId) {
    const result = await originalDeleteCollection(collectionId);
    const collections = await dbManager.getAllCollections();
    dbManager._emitChange({ collections: { newValue: collections } });
    return result;
};

// Override saveTrashItem to emit change
const originalSaveTrashItem = dbManager.saveTrashItem.bind(dbManager);
dbManager.saveTrashItem = async function (item) {
    const result = await originalSaveTrashItem(item);
    const trash = await dbManager.getAllTrash();
    dbManager._emitChange({ trash: { newValue: trash } });
    return result;
};

// Override deleteTrashItem to emit change
const originalDeleteTrashItem = dbManager.deleteTrashItem.bind(dbManager);
dbManager.deleteTrashItem = async function (itemId) {
    const result = await originalDeleteTrashItem(itemId);
    const trash = await dbManager.getAllTrash();
    dbManager._emitChange({ trash: { newValue: trash } });
    return result;
};

// Override clearAllTrash to emit change
const originalClearAllTrash = dbManager.clearAllTrash.bind(dbManager);
dbManager.clearAllTrash = async function () {
    const result = await originalClearAllTrash();
    dbManager._emitChange({ trash: { newValue: {} } });
    return result;
};

// Add deleteSetting method
dbManager.deleteSetting = async function (key) {
    try {
        await this.db.settings.delete(key);
        console.log(`[IndexedDB] Deleted setting: ${key}`);
    } catch (error) {
        console.error(`[IndexedDB] Error deleting setting ${key}:`, error);
        throw error;
    }
};

// Add remove method for bulk delete (for cleanup operations)
dbManager.remove = async function (keys) {
    try {
        if (!Array.isArray(keys)) {
            keys = [keys];
        }

        for (const key of keys) {
            await this.db.settings.delete(key);
        }

        console.log(`[IndexedDB] Deleted ${keys.length} settings`);
    } catch (error) {
        console.error('[IndexedDB] Error in bulk delete:', error);
        throw error;
    }
};

// Add exportAll method for data export
dbManager.exportAll = async function () {
    try {
        const notes = await this.getAllNotes();
        const collections = await this.getAllCollections();
        const trash = await this.getAllTrash();
        const settings = await this.db.settings.toArray();

        // Convert settings array to object
        const settingsObj = {};
        settings.forEach(item => {
            settingsObj[item.key] = item.value;
        });

        return {
            notes,
            collections,
            trash,
            settings: settingsObj
        };
    } catch (error) {
        console.error('[IndexedDB] Error exporting data:', error);
        throw error;
    }
};

// Add importAll method for data import
dbManager.importAll = async function (data) {
    try {
        console.log('[IndexedDB] Starting import...');
        
        // Ensure database is initialized
        await this.ensureInitialized();
        
        // Import notes in bulk
        if (data.notes) {
            const notesArray = Object.values(data.notes);
            console.log('[IndexedDB] Importing', notesArray.length, 'notes');
            if (notesArray.length > 0) {
                await this.db.notes.bulkPut(notesArray);
            }
        }

        // Import collections in bulk
        if (data.collections) {
            const collectionsArray = Object.values(data.collections);
            console.log('[IndexedDB] Importing', collectionsArray.length, 'collections');
            if (collectionsArray.length > 0) {
                await this.db.collections.bulkPut(collectionsArray);
            }
        }

        // Import trash in bulk
        if (data.trash) {
            const trashArray = Object.values(data.trash);
            console.log('[IndexedDB] Importing', trashArray.length, 'trash items');
            if (trashArray.length > 0) {
                await this.db.trash.bulkPut(trashArray);
            }
        }

        // Import settings
        if (data.settings) {
            console.log('[IndexedDB] Importing settings');
            for (const key in data.settings) {
                await this.saveSetting(key, data.settings[key]);
            }
        }

        console.log('[IndexedDB] Data imported successfully');
        
    } catch (error) {
        console.error('[IndexedDB] Error importing data:', error);
        throw error;
    }
};

// Make it globally available
if (typeof window !== 'undefined') {
    window.dbManager = dbManager;
}

// Export for use in other modules (service worker)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = dbManager;
}

// Also make it available as self.dbManager for service workers
if (typeof self !== 'undefined' && typeof window === 'undefined') {
    self.dbManager = dbManager;
}
