# Quick Notes: Note Taking

<div align="center">

![Quick Notes Logo](icons/icon128.png)

**A powerful, feature-rich note-taking Chrome extension with glassmorphism design**

[![Version](https://img.shields.io/badge/version-5.5.3-blue.svg)](manifest.json)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-green.svg)](https://chrome.google.com/webstore)
[![License](https://img.shields.io/badge/license-MIT-orange.svg)](LICENSE)

[Features](#features) • [Installation](#installation) • [Usage](#usage) • [Architecture](#architecture) • [Development](#development) • [Contributing](#contributing)

</div>

---

## 📋 Overview

Quick Notes is a modern, full-featured note-taking Chrome extension that combines elegant glassmorphism design with powerful functionality. Create, organize, and sync your notes seamlessly across devices with Google Drive integration, rich text editing, markdown support, and multi-language support for 60+ languages.

### ✨ Key Highlights

- 🎨 **Beautiful Glassmorphism UI** - Modern, translucent design with smooth animations
- 📝 **Rich Text Editor** - Powered by Quill.js with full formatting capabilities
- 📂 **Collections System** - Organize notes into themed collections
- ☁️ **Google Drive Sync** - Automatic cloud backup and synchronization
- 🌍 **60+ Languages** - Full internationalization support
- 🎯 **Multi-Tab Interface** - Work with multiple notes simultaneously
- 🖼️ **Custom Backgrounds** - 100+ built-in patterns and custom upload support
- 📱 **Responsive Design** - Works seamlessly on all screen sizes
- 🔍 **Advanced Search** - Fast, real-time note searching
- 📤 **Export/Import** - Backup and restore your data easily

---

## 🚀 Features

### Core Functionality

#### 📝 Rich Text Editing
- **Full Formatting Support**: Bold, italic, underline, strikethrough
- **Text Styling**: Font sizes, colors, and background colors
- **Lists**: Bullet lists, numbered lists, and interactive checklists
- **Headers**: H1, H2, H3 for document structure
- **Alignment**: Left, center, right, and justify
- **Advanced Elements**: Blockquotes, code blocks, links, images, and videos
- **Markdown Support**: Import and export markdown format

#### 📂 Organization
- **Collections**: Group related notes by theme (Work, Personal, Ideas, Study, Travel, Hobby)
- **Color Coding**: 8 vibrant colors for visual categorization
- **Pinning**: Keep important notes at the top
- **Drag & Drop**: Intuitive note organization
- **Multi-Select**: Bulk operations on multiple notes
- **Search**: Real-time search across all notes

#### 🎨 Customization
- **100+ Backgrounds**: Geometric, nature, abstract, and seasonal patterns
- **Custom Backgrounds**: Upload your own images
- **Theme Support**: Light and dark modes
- **Note Colors**: 8 color options for note cards
- **Adjustable Sizes**: Customize default note dimensions
- **Custom Positioning**: Place notes anywhere on screen

#### ☁️ Cloud Integration
- **Google Drive Sync**: Automatic backup to Google Drive
- **OAuth 2.0**: Secure authentication
- **Conflict Resolution**: Smart merging of changes
- **Manual Sync**: On-demand synchronization
- **Offline Support**: Work without internet, sync when online

#### 🌐 Internationalization
Full support for 60+ languages including:
- English, Spanish, French, German, Italian, Portuguese
- Chinese, Japanese, Korean, Vietnamese, Thai
- Arabic, Hebrew, Hindi, Bengali, Urdu
- Russian, Ukrainian, Polish, Czech, Romanian
- And many more...

#### 🔧 Advanced Features
- **Multi-Tab Interface**: Open multiple notes in tabs
- **Tab Management**: Drag, reorder, and organize tabs
- **Context Menus**: Right-click for quick actions
- **Keyboard Shortcuts**: 
  - `Ctrl+Shift+O` (Mac: `Cmd+Shift+O`) - Open Quick Notes
  - `Ctrl+T` - New tab in note window
- **Draft System**: Auto-save incomplete notes
- **Trash System**: Recover deleted notes
- **Export/Import**: JSON format for data portability
- **Image Management**: Insert, resize, and download images
- **Link Management**: Add and edit hyperlinks
- **Video Embedding**: YouTube video support

---

## 💻 Installation

### From Chrome Web Store (Recommended)
1. Visit the [Chrome Web Store](https://chrome.google.com/webstore) (link to be added)
2. Click "Add to Chrome"
3. Confirm the installation

### Manual Installation (Development)
1. Clone this repository:
   ```bash
   git clone https://github.com/alvesoscar517-cloud/Quick-Notes.git
   cd Quick-Notes
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" (toggle in top-right corner)

4. Click "Load unpacked" and select the project directory

5. The extension icon will appear in your Chrome toolbar

---

## 📖 Usage

### Getting Started

1. **First Launch**: Click the extension icon to open Quick Notes
2. **Create a Note**: Click the "+" button or use the keyboard shortcut
3. **Start Writing**: Use the rich text editor with formatting toolbar
4. **Organize**: Create collections and categorize your notes
5. **Sync**: Sign in with Google to enable cloud synchronization

### Creating Notes

#### Quick Note
- Click the extension icon in the toolbar
- Start typing immediately
- Auto-saves as you type

#### From Selected Text
- Select text on any webpage
- Right-click and choose "Add to Quick Notes"
- Text is automatically added to a new note

#### In Collections
- Navigate to a collection
- Click "Create Note in Collection"
- Note is automatically organized

### Managing Collections

1. **Create Collection**:
   - Click the collection icon in the header
   - Enter name and choose theme
   - Select color

2. **Organize Notes**:
   - Drag notes into collections
   - Right-click note → "Move to Collection"
   - Remove from collection anytime

3. **Collection Actions**:
   - Pin/unpin collections
   - Edit collection details
   - Delete collections (moves notes to trash)

### Customization

#### Note Appearance
- **Color**: Click menu → Select from color palette
- **Background**: Click menu → Background → Choose pattern
- **Size**: Settings → Default Note Size → Configure dimensions

#### Application Settings
- **Theme**: Settings → Appearance → Light/Dark
- **Language**: Automatically detects browser language
- **Default Size**: Configure default note dimensions

### Cloud Sync

1. **Enable Sync**:
   - Open Settings
   - Click "Sign in with Google"
   - Grant permissions

2. **Automatic Sync**:
   - Changes sync every 10 seconds
   - Conflict resolution handles simultaneous edits

3. **Manual Sync**:
   - Settings → Cloud Sync → "Sync Now"

### Data Management

#### Export Data
- Settings → Data Management → Export
- Downloads JSON file with all notes and collections

#### Import Data
- Settings → Data Management → Import
- Select previously exported JSON file
- Confirms before overwriting

#### Trash Management
- Settings → Trash → Open
- Restore individual items or all at once
- Permanently delete items

---

## 🏗️ Architecture

### Technology Stack

#### Frontend
- **HTML5/CSS3**: Modern web standards
- **JavaScript (ES6+)**: Vanilla JavaScript, no frameworks
- **Quill.js**: Rich text editor
- **Anime.js**: Smooth animations
- **Lottie**: Animation rendering
- **Marked.js**: Markdown parsing

#### Storage
- **IndexedDB**: Local database via Dexie.js
- **Chrome Storage API**: Settings and preferences
- **Google Drive API**: Cloud synchronization

#### Architecture Pattern
- **Service Worker**: Background processing and sync
- **MVC-like Structure**: Separation of concerns
- **Event-Driven**: Message passing between components
- **Modular Design**: Reusable components

### Project Structure

```
Quick-Notes/
├── manifest.json                 # Extension configuration
├── service-worker.js            # Background service worker
├── indexeddb-manager.js         # Database management
├── server-config.js             # API configuration
│
├── main_app/                    # Main application window
│   ├── main_app.html           # Main UI
│   ├── main_app.js             # Main logic
│   ├── main_app.css            # Styling
│   ├── theme-preload.js        # Theme initialization
│   └── search-highlight-helper.js
│
├── note/                        # Note editor window
│   ├── note.html               # Note UI
│   ├── note.js                 # Note logic
│   ├── note.css                # Note styling
│   ├── note-tabs.js            # Tab management
│   ├── note-tabs-drag-drop.js  # Drag & drop
│   └── performance-optimizer.js
│
├── libs/                        # Third-party libraries
│   ├── dexie.min.js            # IndexedDB wrapper
│   ├── quill/                  # Rich text editor
│   ├── marked.min.js           # Markdown parser
│   ├── anime.min.js            # Animation library
│   └── lottie-web.min.js       # Lottie animations
│
├── img/                         # Background patterns (100+)
├── icons/                       # Extension icons
├── note img/                    # UI icons and images
│
├── _locales/                    # Internationalization
│   ├── en/messages.json        # English
│   ├── es/messages.json        # Spanish
│   ├── fr/messages.json        # French
│   └── ... (60+ languages)
│
├── i18n-helper.js              # Translation utilities
├── markdown-processor.js        # Markdown handling
├── animation-helpers.js         # Animation utilities
├── toast-system.js             # Notification system
├── virtual-scroll-manager.js    # Performance optimization
└── search.html/css/js          # Search interface
```

### Key Components

#### Service Worker (`service-worker.js`)
- Manages note lifecycle (create, update, delete)
- Handles Google Drive synchronization
- Processes context menu actions
- Manages window state
- Implements storage queue for race condition prevention

#### Database Manager (`indexeddb-manager.js`)
- Dexie.js wrapper for IndexedDB
- CRUD operations for notes, collections, trash
- Settings management
- Cross-tab synchronization via BroadcastChannel
- Query and filtering capabilities

#### Main Application (`main_app/`)
- Note grid display with virtual scrolling
- Collection management UI
- Search functionality
- Settings panel
- Trash management

#### Note Editor (`note/`)
- Quill.js rich text editor
- Multi-tab interface
- Formatting toolbar
- Background picker
- Image and video embedding
- Export functionality

### Data Models

#### Note Object
```javascript
{
  id: string,              // Unique identifier
  content: string,         // HTML content
  color: string,           // Hex color code
  background: string,      // Background ID or 'none'
  position: {x, y},        // Window position
  size: {width, height},   // Window dimensions
  lastModified: number,    // Timestamp
  category: string,        // 'general' or category
  isDraft: boolean,        // Draft status
  pinned: boolean,         // Pin status
  isMarkdown: boolean,     // Markdown flag
  collectionId?: string    // Optional collection ID
}
```

#### Collection Object
```javascript
{
  id: string,              // Unique identifier
  name: string,            // Collection name
  color: string,           // Hex color code
  theme: string,           // Theme type
  createdAt: number,       // Creation timestamp
  lastModified: number,    // Last modified timestamp
  noteCount: number        // Number of notes
}
```

### API Integration

#### Google Drive API
- **Endpoint**: `https://www.googleapis.com/drive/v3/files`
- **Storage**: `appDataFolder` (hidden from user)
- **File**: `sticky_notes_sync_data.json`
- **Authentication**: OAuth 2.0 with Chrome Identity API
- **Scopes**:
  - `drive.appdata` - Access app data folder
  - `userinfo.email` - User email
  - `userinfo.profile` - User profile

#### Sync Strategy
1. **Trigger**: Auto-sync after 10 seconds of inactivity
2. **Process**:
   - Fetch remote data from Drive
   - Compare timestamps
   - Merge changes (last-write-wins)
   - Upload merged data
3. **Conflict Resolution**: Timestamp-based merging

---

## 🛠️ Development

### Prerequisites
- Google Chrome (latest version)
- Text editor or IDE
- Basic knowledge of JavaScript, HTML, CSS
- Chrome Extension development basics

### Setup Development Environment

1. **Clone Repository**:
   ```bash
   git clone https://github.com/alvesoscar517-cloud/Quick-Notes.git
   cd Quick-Notes
   ```

2. **Load Extension**:
   - Open `chrome://extensions/`
   - Enable Developer mode
   - Click "Load unpacked"
   - Select project directory

3. **Development Tools**:
   - Chrome DevTools for debugging
   - Service Worker inspector
   - Storage inspector (IndexedDB)

### Development Workflow

1. **Make Changes**: Edit source files
2. **Reload Extension**: Click reload button in `chrome://extensions/`
3. **Test**: Verify functionality
4. **Debug**: Use Chrome DevTools
5. **Commit**: Git commit with descriptive message

### Testing

#### Manual Testing
- Create, edit, delete notes
- Test collections functionality
- Verify sync with Google Drive
- Test in different languages
- Check responsive design
- Test keyboard shortcuts

#### Storage Testing
- Open DevTools → Application → IndexedDB
- Inspect `QuickNotesDB` database
- Verify data structure

#### Service Worker Testing
- Open `chrome://extensions/`
- Click "Service Worker" link
- View console logs and errors

### Building for Production

1. **Version Update**: Update version in `manifest.json`
2. **Test Thoroughly**: All features and edge cases
3. **Create ZIP**: Package extension files
4. **Submit**: Upload to Chrome Web Store

### Code Style Guidelines

- **JavaScript**: ES6+ features, async/await
- **Naming**: camelCase for variables, PascalCase for classes
- **Comments**: JSDoc style for functions
- **Indentation**: 4 spaces
- **Semicolons**: Required
- **Quotes**: Single quotes for strings

---

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

### Ways to Contribute

1. **Report Bugs**: Open an issue with detailed description
2. **Suggest Features**: Share your ideas in issues
3. **Submit Pull Requests**: Fix bugs or add features
4. **Improve Documentation**: Enhance README or code comments
5. **Translate**: Add or improve language translations

### Pull Request Process

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/AmazingFeature`)
3. **Commit** your changes (`git commit -m 'Add some AmazingFeature'`)
4. **Push** to the branch (`git push origin feature/AmazingFeature`)
5. **Open** a Pull Request

### Contribution Guidelines

- Follow existing code style
- Add comments for complex logic
- Test thoroughly before submitting
- Update documentation if needed
- One feature per pull request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

### Third-Party Libraries
- [Quill.js](https://quilljs.com/) - Rich text editor
- [Dexie.js](https://dexie.org/) - IndexedDB wrapper
- [Anime.js](https://animejs.com/) - Animation library
- [Lottie](https://airbnb.design/lottie/) - Animation rendering
- [Marked.js](https://marked.js.org/) - Markdown parser
- [Hero Patterns](https://heropatterns.com/) - SVG background patterns

### Resources
- Chrome Extension Documentation
- Google Drive API Documentation
- MDN Web Docs

---

## 📞 Support

### Getting Help
- **Issues**: [GitHub Issues](https://github.com/alvesoscar517-cloud/Quick-Notes/issues)
- **Discussions**: [GitHub Discussions](https://github.com/alvesoscar517-cloud/Quick-Notes/discussions)
- **Email**: [Contact Developer](mailto:alvesoscar517@gmail.com)

### FAQ

**Q: How do I sync my notes?**  
A: Go to Settings → Cloud Sync → Sign in with Google. Sync happens automatically.

**Q: Can I use Quick Notes offline?**  
A: Yes! All notes are stored locally. Sync happens when you're back online.

**Q: How many notes can I create?**  
A: There's no hard limit, but performance may vary with thousands of notes.

**Q: Is my data secure?**  
A: Yes. Data is stored locally in IndexedDB and synced to your private Google Drive appDataFolder.

**Q: Can I export my notes?**  
A: Yes. Go to Settings → Data Management → Export to download all your data.

**Q: How do I change the language?**  
A: Quick Notes automatically uses your browser's language. Change your browser language to switch.

---

## 🗺️ Roadmap

### Planned Features
- [ ] End-to-end encryption for cloud sync
- [ ] Collaborative notes (real-time sharing)
- [ ] Advanced search with filters
- [ ] Note templates
- [ ] Reminder system
- [ ] Browser extension for Firefox and Edge
- [ ] Mobile app (iOS/Android)
- [ ] Desktop app (Electron)
- [ ] API for third-party integrations
- [ ] Plugin system for extensibility

---

## 📊 Statistics

- **Version**: 5.5.3
- **Languages Supported**: 60+
- **Background Patterns**: 100+
- **Lines of Code**: ~15,000+
- **File Count**: 150+
- **Active Development**: Yes

---

## 🌟 Star History

If you find Quick Notes useful, please consider giving it a star on GitHub! ⭐

---

<div align="center">

**Made with ❤️ by [Oscar Alves](https://github.com/alvesoscar517-cloud)**

[⬆ Back to Top](#quick-notes-note-taking)

</div>
