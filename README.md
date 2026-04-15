# StreamAura

A modern, production-ready Progressive Web App (PWA) for downloading videos, movies and music from any platform. Built with React, TypeScript, Tailwind CSS, and Firebase.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![React](https://img.shields.io/badge/react-18.0+-61DAFB.svg)
![TypeScript](https://img.shields.io/badge/typescript-5.0+-3178C6.svg)
![PWA](https://img.shields.io/badge/PWA-ready-5A0FC8.svg)

## Features

### Core Functionality
- **Video Downloader**: Download videos from YouTube, TikTok, Instagram, Facebook, Twitter/X
- **Music Downloader**: Download audio from Spotify, SoundCloud, Apple Music, Deezer
- **Movie Downloader**: Download or watch any movie of your choice 
- **Bulk Download**: Process multiple URLs at once with queue management
- **Quality Selection**: Choose from multiple quality options (144p to 4K for video, 128kbps to Lossless for audio)
- **Auto-Detect**: Automatically detects media type on paste
- **Preview**: View thumbnails, titles, duration before downloading

### PWA Features
- **Installable**: Add to home screen on mobile and desktop
- **Offline Support**: Works offline with cached assets
- **Background Sync**: Queue downloads for when connection returns
- **Push Notifications**: Get notified when downloads complete
- **Fast Loading**: Optimized for low bandwidth users

### UI/UX
- **Glassmorphism Design**: Modern blur, transparency, and gradient effects
- **Dark/Light Mode**: Toggle between themes
- **Smooth Animations**: Framer Motion powered transitions
- **Toast Notifications**: Non-intrusive feedback
- **Responsive**: Mobile-first design, works on all devices
- **Skeleton Loaders**: Beautiful loading states

### Authentication
- **Email/Password**: Traditional signup/login
- **Google Sign-In**: One-click authentication
- **Protected Routes**: Must be logged in to download
- **Admin Panel**: Special privileges for admin users

### Data Management
- **Download History**: Persisted in localStorage
- **30-Minute Auto-Cleanup**: Links expire after 30 minutes
- **Queue System**: Manage multiple downloads
- **Progress Tracking**: Real-time download progress

## Tech Stack

### Frontend
- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **shadcn/ui** - UI components
- **Framer Motion** - Animations
- **Lucide React** - Icons

### Backend Integration
- **Firebase Auth** - Authentication
- **Firestore** - User data storage
- **Cloudinary** - Image storage
- **Custom API** - Media extraction (Node.js/Python)

### PWA
- **Vite PWA Plugin** - PWA configuration
- **Workbox** - Service worker
- **Web App Manifest** - App metadata

## Project Structure

```
app/
├── public/                 # Static assets
│   ├── icons/             # PWA icons
│   ├── sw.js              # Service worker
│   ├── manifest.json      # PWA manifest
│   ├── offline.html       # Offline fallback
│   └── favicon.svg        # App icon
├── src/
│   ├── api/               # API services
│   │   └── mediaApi.ts    # Media extraction API
│   ├── components/        # Reusable components
│   │   └── ui/           # shadcn/ui components
│   ├── contexts/          # React contexts
│   │   ├── AuthContext.tsx
│   │   ├── DownloadContext.tsx
│   │   ├── ThemeContext.tsx
│   │   └── ToastContext.tsx
│   ├── hooks/             # Custom hooks
│   │   ├── useClipboard.ts
│   │   ├── useDebounce.ts
│   │   └── useLocalStorage.ts
│   ├── lib/               # Utilities
│   │   └── firebase.ts    # Firebase config
│   ├── sections/          # Page sections
│   │   ├── Login.tsx
│   │   ├── Signup.tsx
│   │   ├── Layout.tsx
│   │   ├── VideoDownloader.tsx
│   │   ├── MusicDownloader.tsx
│   │   ├── BulkDownloader.tsx
│   │   └── History.tsx
│   ├── types/             # TypeScript types
│   │   └── index.ts
│   ├── App.tsx            # Main app component
│   ├── main.tsx           # Entry point
│   └── index.css          # Global styles
├── .env.example           # Environment variables template
├── index.html
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

## Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Firebase account (for auth)
- Cloudinary account (for images)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/media-downloader.git
cd media-downloader
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**
```bash
cp .env.example .env
```
Edit `.env` with your Firebase and Cloudinary credentials.

4. **Start development server**
```bash
npm run dev
```

5. **Build for production**
```bash
npm run build
```

### Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project
3. Enable Authentication (Email/Password and Google)
4. Create a Firestore database
5. Get your config from Project Settings > General
6. Update `.env` with your Firebase credentials

### Cloudinary Setup

1. Go to [Cloudinary](https://cloudinary.com/)
2. Create an account
3. Get your cloud name and API key from the dashboard
4. Create an upload preset
5. Update `.env` with your Cloudinary credentials

### Backend API Setup

The frontend expects a backend API for media extraction. You need to set up:

1. **Node.js/Express server** or **Python/FastAPI**
2. **yt-dlp** or similar library for media extraction
3. **Rate limiting** to prevent abuse
4. **File cleanup** (30-minute auto-delete)

Example API endpoints needed:
- `POST /api/extract/video` - Extract video info
- `POST /api/extract/music` - Extract music info
- `POST /api/extract/bulk` - Bulk extract
- `POST /api/download` - Start download
- `GET /api/download/:id/progress` - Get progress
- `DELETE /api/download/:id` - Cancel download

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_FIREBASE_API_KEY` | Firebase API key | Yes |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain | Yes |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID | Yes |
| `VITE_CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name | Yes |
| `VITE_API_URL` | Backend API URL | Yes |
| `VITE_USE_MOCK_API` | Use mock API for testing | No |

### Customization

**Themes**: Edit `src/index.css` to customize colors

**Platforms**: Add new platforms in `src/api/mediaApi.ts`

**Quality Options**: Modify quality arrays in `extractVideoInfo` and `extractMusicInfo`

## Deployment

### Vercel
```bash
npm i -g vercel
vercel
```

### Netlify
```bash
npm i -g netlify-cli
netlify deploy
```

### Firebase Hosting
```bash
npm i -g firebase-tools
firebase init hosting
firebase deploy
```

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Performance

- **Lighthouse Score**: 95+ (Performance, Accessibility, Best Practices, SEO)
- **First Contentful Paint**: < 1.5s
- **Time to Interactive**: < 3s
- **Bundle Size**: < 200KB (gzipped)

## Security

- All API calls use HTTPS
- Firebase Auth for secure authentication
- Input validation on all forms
- Rate limiting on backend
- CORS properly configured
- No sensitive data in client-side code

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Acknowledgments

- [yt-dlp](https://github.com/yt-dlp/yt-dlp) for media extraction
- [shadcn/ui](https://ui.shadcn.com/) for UI components
- [Framer Motion](https://www.framer.com/motion/) for animations

## Support

For support, email john@feelflytech.site or join our telegram channel.

---

**Note**: This is a demonstration project. For production use, ensure you comply with all applicable laws and terms of service for the platforms you're downloading from.

**Made with love ❤️ by Bobbizy**
