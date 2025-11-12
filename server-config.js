// server-config.js - Single US server configuration

// US server URL constant
const US_SERVER_URL = 'https://quick-notes-85523783979.us-central1.run.app';

class ServerSelector {
    constructor() {
        this.serverUrl = US_SERVER_URL;
    }

    getServerUrl() {
        return this.serverUrl;
    }
}

// Create singleton instance
const serverSelector = new ServerSelector();

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = serverSelector;
}
