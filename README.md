# Dark Browser - Auto Dark Mode Extension

A powerful browser extension that automatically converts white backgrounds to dark mode while intelligently preserving images, videos, and embedded content. Available for Chrome, Firefox, Edge, and Brave.

## Features

- 🌓 **Automatic Dark Mode** - Instantly converts white backgrounds to comfortable dark mode
- 🖼️ **Preserve Media** - Images, videos, iframes, and embedded content remain unchanged
- ✍️ **Smart Text Adjustment** - Text colors are automatically optimized for readability
- ⚙️ **Easy Controls** - Simple toggle in the popup menu
- 🌐 **Cross-Browser** - Works on Chrome, Firefox, Edge, and Brave
- 🎨 **Multiple Themes** - Choose between different color schemes
- 📋 **Site Exclusions** - Exclude specific websites from dark mode
- ⚡ **Dynamic Content** - Applies to dynamically loaded content via MutationObserver

## Installation

### Chrome/Brave
1. Download/clone this repository
2. Go to `chrome://extensions/` (or `brave://extensions/`)
3. Enable "Developer mode" (top right)
4. Click "Load unpacked" and select the extension folder
5. The extension is now active!

### Firefox
1. Download/clone this repository
2. Go to `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on"
4. Select the `manifest.json` file
5. The extension is now active!

### Edge
1. Download/clone this repository
2. Go to `edge://extensions`
3. Enable "Developer mode" (bottom left)
4. Click "Load unpacked" and select the extension folder
5. The extension is now active!

## Testing

Run automated smoke tests:

```bash
npm test
```

Run JavaScript syntax-only checks:

```bash
npm run test:syntax
```

These checks validate manifest integrity, required file presence, and script syntax.

## Project Structure

```
darkbrowser/
├── manifest.json          # Extension metadata and configuration
├── content.js             # Main dark mode script (injected into pages)
├── dark-mode.css          # Global dark mode styles
├── background.js          # Service worker for extension lifecycle
├── popup.html             # Extension popup UI
├── popup.css              # Popup styling
├── popup.js               # Popup functionality
├── welcome.html           # Welcome page on first install
├── welcome.css            # Welcome page styling
├── welcome.js             # Welcome page functionality
└── README.md              # This file
```

## How It Works

### Content Script (`content.js`)
- Runs on every page load before DOM rendering
- Detects elements with white backgrounds
- Converts backgrounds to dark mode (#1e1e1e)
- Adjusts text colors for readability
- Preserves images, videos, iframes, and embedded content
- Uses MutationObserver to handle dynamically added content

### Background Service Worker (`background.js`)
- Manages extension lifecycle (install, update)
- Handles settings storage
- Communicates between popup and content scripts
- Manages site exclusion list

### Popup Interface (`popup.html`/`popup.js`)
- Toggle dark mode on/off
- View current website
- Exclude/include specific sites
- Choose color themes
- View excluded sites list

## Customization

### Colors
Edit the `CONFIG` object in `content.js`:

```javascript
const CONFIG = {
  DARK_BG_COLOR: '#1e1e1e',      // Dark background
  DARK_TEXT_COLOR: '#e0e0e0',    // Text on dark background
  LIGHT_TEXT_COLOR: '#f0f0f0',   // Light text
  WHITE_THRESHOLD: 240,           // RGB brightness threshold for white detection
};
```

### Excluded Tags
Modify the `PRESERVE_TAGS` array to exclude additional elements:

```javascript
PRESERVE_TAGS: ['img', 'video', 'iframe', 'canvas', 'svg']
```

## CSS Variables

The extension uses CSS custom properties for easy theming. Modify in `dark-mode.css`:

```css
:root {
  --dm-bg-primary: #1e1e1e;
  --dm-text-primary: #e0e0e0;
  --dm-link-color: #6eb3f7;
}
```

## Browser Compatibility

| Browser | Status | Notes |
|---------|--------|-------|
| Chrome | ✅ Full Support | Manifest V3 compatible |
| Firefox | ✅ Full Support | WebExtensions API |
| Edge | ✅ Full Support | Chromium-based |
| Brave | ✅ Full Support | Chromium-based |
| Safari | ⚠️ Partial | May require additional setup |

## Performance Considerations

- **Lightweight**: Minimal CSS and JavaScript injected
- **Optimized**: WeakSet tracks processed elements to avoid re-processing
- **Efficient**: MutationObserver only processes new/changed elements
- **Smart Detection**: Only processes light backgrounds, ignores already dark pages

## Limitations

- **PDF Files**: Limited support (handled at browser level)
- **Very Old Sites**: Some extremely old websites may have inline styles that override dark mode
- **Web Apps**: Some JavaScript-heavy web applications may need site exclusion
- **Performance**: Very large pages may experience slight delay on first load

## Troubleshooting

### Dark mode not applying?
1. Make sure the extension is enabled in extension settings
2. Try excluding and re-including the site
3. Reload the page (Ctrl+R or Cmd+R)
4. Check browser console for errors (F12)

### Images/Videos look wrong?
- This shouldn't happen. If it does, the site may be using unusual styling. Try excluding the site.

### Text is unreadable?
- The extension tries to auto-detect good text colors. If it fails, please exclude that site or adjust `WHITE_THRESHOLD` in the config.

## Future Enhancements

- [ ] Context menu to quickly toggle dark mode
- [ ] Keyboard shortcut support
- [ ] Advanced color theme editor
- [ ] Per-domain custom settings
- [ ] Sync settings across devices
- [ ] Image inversion toggle (for inverted images on dark backgrounds)
- [ ] Performance metrics dashboard
- [ ] Auto-detect system dark mode preference

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

MIT License - feel free to use, modify, and distribute.

## Support

For issues, feature requests, or questions:
- Open an issue on GitHub
- Check existing discussions
- Review the troubleshooting section

## Changelog

### v1.0.0 (Initial Release)
- Basic dark mode conversion
- Image/video preservation
- Text color adjustment
- Site exclusion list
- Cross-browser support
- Welcome page on install

---

Made with 🌙 for comfortable browsing.
