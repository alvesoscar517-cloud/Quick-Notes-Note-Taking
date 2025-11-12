// i18n-helper.js - Helper script to replace __MSG_ placeholders with actual translations

(function () {
    'use strict';

    // Fallback translations for when chrome.i18n is not available
    const fallbackTranslations = {
        'app_description': 'Create, manage, and sync notes with a glassmorphism style.',
        'main_createNote': 'Create a new note',
        'settings_title': 'Settings',
        'main_searchPlaceholder': 'Search notes...',
        'main_pinNote': 'Pin Note',
        'main_deleteNote': 'Delete Note',
        'settings_appearance': 'Appearance',
        'settings_theme': 'Theme',
        'settings_language': 'Language',
        'settings_dataManagement': 'Data Management',
        'settings_trash': 'Trash',
        'settings_open': 'Open',
        'settings_exportData': 'Export Data',
        'settings_export': 'Export',
        'settings_importData': 'Import Data',
        'settings_import': 'Import',
        'settings_cloudSync': 'Cloud Sync',
        'settings_signedInWith': 'Signed in with',
        'settings_signInWithGoogle': 'Sign in with Google',
        'settings_sync': 'Sync',
        'settings_signOut': 'Sign Out',
        'trash_title': 'Trash',
        'trash_restoreAll': 'Restore All',
        'trash_emptyTrash': 'Empty Trash',
        'trash_restore': 'Restore',
        'trash_deleteForever': 'Delete forever',
        'collections_collection': 'Collection',
        'collections_createCollection': 'Create Collection',
        'collections_collectionName': 'Collection Name',
        'collections_collectionTheme': 'Theme',
        'collections_create': 'Create',
        'collections_editCollection': 'Edit Collection',
        'collections_deleteCollection': 'Delete Collection',
        'collections_pinCollection': 'Pin Collection',
        'collections_removeFromCollection': 'Remove from Collection',
        'collections_collectionNamePlaceholder': 'Enter collection name...',
        'multiSelect_selectAll': 'Select All',
        'multiSelect_bulkDelete': 'Delete Selected',
        'multiSelect_bulkRestore': 'Restore Selected',
        'multiSelect_bulkDeleteForever': 'Delete Forever',
        'confirmations_continue': 'Continue',
        'confirmations_cancel': 'Cancel',
        'languages_en': 'English',
        'languages_vi': 'Tiếng Việt',
        'languages_zh': '中文',
        'languages_es': 'Español',
        'languages_fr': 'Français',
        'languages_de': 'Deutsch',
        'languages_ja': '日本語',
        'languages_ko': '한국어',
        'languages_it': 'Italiano',
        'languages_pt': 'Português',
        'languages_ru': 'Русский',
        'languages_nl': 'Nederlands',
        'languages_sv': 'Svenska',
        'languages_no': 'Norsk',
        'languages_da': 'Dansk',
        'languages_fi': 'Suomi',
        'languages_pl': 'Polski',
        'languages_cs': 'Čeština',
        'languages_hu': 'Magyar',
        'languages_ro': 'Română',
        'languages_el': 'Ελληνικά',
        'languages_bg': 'Български',
        'languages_hr': 'Hrvatski',
        'languages_sk': 'Slovenčina',
        'languages_sl': 'Slovenščina',
        'languages_lt': 'Lietuvių',
        'languages_lv': 'Latviešu',
        'languages_et': 'Eesti',
        'languages_hi': 'हिन्दी',
        'languages_ar': 'العربية',
        'languages_th': 'ไทย',
        'languages_id': 'Bahasa Indonesia',
        'languages_tr': 'Türkçe',
        'languages_ms': 'Bahasa Melayu',
        'languages_tl': 'Filipino',
        'languages_bn': 'বাংলা',
        'languages_ta': 'தமிழ்',
        'languages_te': 'తెలుగు',
        'languages_mr': 'मराठी',
        'languages_gu': 'ગુજરાતી',
        'languages_pa': 'ਪੰਜਾਬੀ',
        'languages_ur': 'اردو',
        'languages_he': 'עברית',
        'languages_fa': 'فارسی',
        'languages_uk': 'Українська',
        'languages_kk': 'Қазақша',
        'languages_uz': 'O\'zbekcha',
        'languages_mn': 'Монгол',
        'languages_sw': 'Kiswahili',
        'languages_am': 'አማርኛ',
        'languages_ha': 'Hausa',
        'languages_yo': 'Yorùbá',
        'languages_ig': 'Igbo',
        'languages_zu': 'IsiZulu',
        'languages_af': 'Afrikaans',
        'languages_pt-BR': 'Português (Brasil)',
        'languages_es-MX': 'Español (México)',
        'languages_fr-CA': 'Français (Canada)',
        'themes_work': 'Work',
        'themes_personal': 'Personal',
        'themes_ideas': 'Ideas',
        'themes_study': 'Study',
        'themes_travel': 'Travel',
        'themes_hobby': 'Hobby',
        'ai_summarize': 'Summarize',
        'ai_expand': 'Expand',
        'ai_improve': 'Improve',
        'ai_translate': 'Translate',
        'ai_suggestions': 'Suggestions',
        'ai_outline': 'Outline',
        'ai_tone': 'Tone',
        'ai_save': 'Save',
        'ai_search': 'Search',
        'toast_imageFileRequired': 'Image file required',
        'toast_imageTooLarge': 'Image too large',
        'toast_backgroundSetFailed': 'Background failed',
        'toast_cannotDeleteDefault': 'Cannot delete',
        'toast_aiResponseFailed': 'AI failed',
        'toast_libraryNotLoaded': 'Library loading',
        'toast_exportFailed': 'Export failed',
        'toast_libraryError': 'Library error',
        'toast_operationFailed': 'Operation failed',
        'toast_noteMoved': 'Moved',
        'toast_noSelection': 'No selection',
        'toast_collectionError': 'Collection error',
        'toast_updateFailed': 'Update failed',
        'toast_loadFailed': 'Load failed',
        'toast_deleteFailed': 'Delete failed',
        'toast_pinFailed': 'Pin failed',
        'toast_moveFailed': 'Move failed',
        'toast_failed': 'Failed',
        'toolbar_fontSize': 'Font Size',
        'toolbar_fontSizeIcon': 'Font Size',
        'toolbar_heading3': 'Heading 3',
        'toolbar_heading3Icon': 'Heading 3',
        'toolbar_justify': 'Justify',
        'toolbar_justifyIcon': 'Justify',
        'toolbar_textColor': 'Text Color',
        'toolbar_textColorIcon': 'Text Color',
        'toolbar_backgroundColor': 'Background Color',
        'toolbar_backgroundColorIcon': 'Background Color',
        'toolbar_blockquote': 'Blockquote',
        'toolbar_blockquoteIcon': 'Blockquote',
        'toolbar_codeBlock': 'Code Block',
        'toolbar_codeBlockIcon': 'Code Block',
        'toolbar_insertLink': 'Insert Link',
        'toolbar_insertLinkIcon': 'Insert Link',
        'toolbar_insertVideo': 'Insert Video',
        'toolbar_insertVideoIcon': 'Insert Video',
        'note_enterLinkURL': 'Enter link URL...',
        'note_enterVideoURL': 'Enter video URL...',
        'note_insertButton': 'Insert',
        'premium_congratulations': '🎉 Congratulations!',
        'premium_upgradedSuccessfully': 'You have successfully upgraded to Premium',
        'premium_unlimitedAIChat': 'Unlimited AI Chat',
        'premium_accessAdvancedFeatures': 'Access advanced features',
        'premium_prioritySupport': 'Priority support',
        'premium_startUsing': 'Start using',
        'background_categoryAll': 'All',
        'background_categoryChristmas': 'Christmas',
        'background_categoryGeometric': 'Geometric',
        'background_categoryNature': 'Nature',
        'background_categoryAbstract': 'Abstract'
    };

    function getTranslation(key) {
        // Try chrome.i18n first
        if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getMessage) {
            const translation = chrome.i18n.getMessage(key);
            if (translation && translation !== '') {
                return translation;
            }
        }

        // Fallback to hardcoded translations
        return fallbackTranslations[key] || key;
    }

    function initializeI18n() {
        // Replace all __MSG_*__ placeholders in the document
        function replaceMessagePlaceholders() {
            // Wait for document.body to be available
            if (!document.body) {
                setTimeout(replaceMessagePlaceholders, 50);
                return;
            }

            let replacedCount = 0;

            // Replace in the entire document HTML
            const bodyHTML = document.body.innerHTML;
            if (bodyHTML.includes('__MSG_')) {
                // Replace in the entire HTML with more aggressive regex
                const newHTML = bodyHTML.replace(/__MSG_([a-zA-Z0-9_]+)__/g, (match, key) => {
                    const translation = getTranslation(key);
                    if (translation && translation !== key) {
                        replacedCount++;
                        return translation;
                    } else {
                        console.warn(`i18n-helper: No translation found for key: ${key}`);
                        return match;
                    }
                });

                if (newHTML !== bodyHTML) {
                    document.body.innerHTML = newHTML;
                }
            }

            // Also check individual elements for attributes and text content
            const elements = document.querySelectorAll('*');
            elements.forEach((element, index) => {
                // Handle text content
                if (element.textContent && element.textContent.includes('__MSG_')) {
                    const newText = element.textContent.replace(/__MSG_([a-zA-Z0-9_]+)__/g, (match, key) => {
                        const translation = getTranslation(key);
                        if (translation && translation !== key) {
                            replacedCount++;
                            return translation;
                        } else {
                            console.warn(`i18n-helper: No translation found for key: ${key} in text content`);
                            return match;
                        }
                    });
                    if (newText !== element.textContent) {
                        element.textContent = newText;
                    }
                }

                // Handle attributes
                const attributes = ['title', 'placeholder', 'alt', 'aria-label'];
                attributes.forEach(attr => {
                    if (element.hasAttribute(attr)) {
                        const value = element.getAttribute(attr);
                        if (value && value.includes('__MSG_')) {
                            const newValue = value.replace(/__MSG_([a-zA-Z0-9_]+)__/g, (match, key) => {
                                const translation = getTranslation(key);
                                if (translation && translation !== key) {
                                    replacedCount++;
                                    return translation;
                                } else {
                                    console.warn(`i18n-helper: No translation found for key: ${key} in ${attr}`);
                                    return match;
                                }
                            });
                            element.setAttribute(attr, newValue);
                        }
                    }
                });
            });
        }

        // Start the replacement process
        replaceMessagePlaceholders();
    }

    // Function to re-run i18n replacement (useful for dynamic content)
    function reinitializeI18n() {
        initializeI18n();
    }

    // Expose the reinitialize function globally for use by other scripts
    window.reinitializeI18n = reinitializeI18n;

    // Auto-initialize when script loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeI18n);
    } else {
        initializeI18n();
    }

    // Also try to initialize after a short delay as backup
    setTimeout(initializeI18n, 1000);

    // Multiple retry attempts to ensure all placeholders are replaced
    setTimeout(initializeI18n, 2000);
    setTimeout(initializeI18n, 3000);
    setTimeout(initializeI18n, 5000);

    // Retry with longer intervals if chrome.i18n becomes available later
    let retryCount = 0;
    const maxRetries = 10;

    function retryWithChromeI18n() {
        if (retryCount >= maxRetries) {
            return;
        }

        if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getMessage) {
            initializeI18n();
        } else {
            retryCount++;
            setTimeout(retryWithChromeI18n, 2000);
        }
    }

    // Start retry mechanism
    setTimeout(retryWithChromeI18n, 2000);

})();

