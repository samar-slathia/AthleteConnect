# AthleteConnect

AthleteConnect is a multi-sided sports coaching platform connecting athletes, parents, and coaches across combat sports and athletic disciplines (such as Boxing, Wushu, and Kickboxing).

The monorepo contains:
- **`mobile/`**: React Native & Expo app (SDK 57) with TypeScript for Parent/Guardian, Individual Customer, and Player/Coach.
- **`admin/`**: Standalone React + Vite operations dashboard with TypeScript.
- **`server/`**: Standalone Node.js, Express, and TypeScript backend API foundation with MongoDB/Mongoose (Phase 2A).

---

## 1. Locked Visual Design System

AthleteConnect uses a strict design token system applied consistently across both mobile and admin:

| Token Name | Hex Code | Purpose |
|---|---|---|
| **Deep Navy** | `#101C2C` | Primary brand color, headers, text, navigation sidebar |
| **Lime Accent** | `#C8F169` | High-visibility primary action buttons, active badges, highlights |
| **White** | `#FFFFFF` | Primary surface cards, container backgrounds |
| **Light Mist Gray** | `#F3F5F7` | Base application background, subtle pill containers |
| **Success Green** | `#16805D` | Status pills, verified checkmarks, positive metrics |
| **Typography** | Inter | Modern, readable sans-serif typography |
| **Iconography** | Lucide | `lucide-react-native` (Mobile), `lucide-react` (Admin) |

---

## 2. Monorepo Folder Structure

```
AthleteConnect/
├── .gitignore                      # Excludes node_modules, .expo, dist, environment files, logs
├── README.md                       # Monorepo architecture, setup guide, & PowerShell commands
├── package.json                    # Root scripts for running and checking all applications
├── mobile/                         # React Native / Expo application
│   ├── assets/                     # App icons and splash screens
│   ├── src/
│   │   ├── components/             # Reusable UI components (Button, RoleCard, Header, Badge, NoticeBanner)
│   │   ├── data/                   # Role specifications (roles.ts) and sample sports (sports.ts)
│   │   ├── navigation/             # AppNavigator.tsx and types.ts
│   │   ├── screens/                # WelcomeScreen.tsx, RoleSelectionScreen.tsx, RolePreviewScreen.tsx
│   │   └── theme/                  # Centralized locked design tokens
│   ├── App.tsx                     # Entry point mounting NavigationContainer & SafeAreaProvider
│   ├── app.json                    # Expo SDK 57 configuration
│   ├── package.json                # Mobile dependencies & scripts
│   └── tsconfig.json               # TypeScript configuration extending Expo base
├── admin/                          # Standalone Admin Website (React + Vite + TypeScript)
│   ├── public/                     # Static assets & favicons
│   ├── src/
│   │   ├── __tests__/              # Unit test suite
│   │   ├── components/             # NoticeBanner, Sidebar, Topbar
│   │   ├── pages/                  # Overview, CoachVerification, Users, Bookings, Finance
│   │   ├── theme/                  # Design tokens matching locked visual palette
│   │   ├── App.tsx                 # Main layout shell with reactive tab navigation
│   │   ├── index.css               # Clean vanilla CSS design system
│   │   └── main.tsx                # React 19 root mount
│   ├── index.html                  # HTML entry point with Inter font & SEO meta tags
│   ├── package.json                # Admin dependencies & scripts
│   ├── tsconfig.json               # TypeScript configuration
│   └── vite.config.ts              # Vite configuration
└── server/                         # Backend API Foundation (Node.js, Express, TypeScript, MongoDB)
    ├── .env.example                # Template with placeholder configuration
    ├── .gitignore                  # Server-specific ignore rules
    ├── README.md                   # Dedicated backend setup & operational guide
    ├── package.json                # Server dependencies & scripts
    ├── tsconfig.json               # TypeScript configuration
    ├── src/
    │   ├── config/                 # env.ts (validation) and db.ts (Mongoose lifecycle)
    │   ├── middleware/             # notFound.ts (404) and errorHandler.ts (error masking)
    │   ├── routes/                 # health.ts (GET /api/health)
    │   ├── app.ts                  # Express application factory and middleware setup
    │   ├── server.ts               # HTTP listener and graceful shutdown handling
    │   └── index.ts                # Server startup entry point
    └── tests/                      # Vitest + Supertest integration & unit test suite
```

---

## 3. Technology Choices & Styling Rationale

- **Expo & React Native (Mobile)**: Built with official, stable Expo SDK 57 (`~57.0.30`) and React Native `0.86.3` (aligned for full compatibility with the current Play Store Expo Go app).
- **Styling Architecture Assessment**: React Native `StyleSheet` with centralized design tokens was selected over NativeWind. React Native `StyleSheet` with centralized tokens provides 100% stability, zero build friction, full type safety, and is effortless for a beginner to maintain without destabilizing the project.
- **Vite & React (Admin)**: Standalone React + Vite + TypeScript app running completely decoupled from the mobile client. Uses vanilla CSS custom properties to implement the locked visual design tokens cleanly with zero third-party framework overhead.
- **Node.js & Express (Server)**: Clean, decoupled TypeScript API foundation with Mongoose for MongoDB, environment validation, explicit CORS, and production error masking.
- **Icons**: Lucide (`lucide-react-native` and `lucide-react`) across both platforms for a unified visual design language.

---

## 4. Setup & Running with Windows PowerShell

All commands should be executed from the project root (`c:\Users\samar\OneDrive\Desktop\AthleteConnect`) in Windows PowerShell.

### A. Run Available Checks (Typechecks, Lint, Tests)

From the project root:
```powershell
# Run all checks across mobile, admin, and server
npm run check:all

# Or run checks individually:
npm run typecheck:mobile   # Type checks mobile app with tsc --noEmit
npm run typecheck:admin    # Type checks admin website with tsc -b --noEmit
npm run typecheck:server   # Type checks server with tsc --noEmit
npm run lint:admin         # Runs oxlint on admin code
npm run test:admin         # Runs Vitest unit test suite for admin
npm run test:server        # Runs Vitest integration & unit tests for server
```

### B. Launch the Backend Server

From the project root:
```powershell
# 1. (First-time) Copy environment template:
Copy-Item server/.env.example server/.env

# 2. Start server in development mode with hot-reloading:
npm run dev:server
```
The server will start on port `5000` (or `PORT` specified in `.env`):
- Health check: **`http://localhost:5000/api/health`**

To compile and run the production build:
```powershell
npm run build:server
npm run start:server
```

### C. Launch the Admin Website

To start the Vite development server:
```powershell
npm run dev:admin
```
Then open your web browser to: **`http://localhost:5173`**

To build the production bundle for admin:
```powershell
npm run build:admin
```

### D. Launch the Mobile Application

To start the Expo development server:
```powershell
npm run start:mobile
```
- Press **`w`** in the terminal to view in a web browser.
- Press **`a`** to open in an Android Emulator.
- Scan the terminal QR code using the **Expo Go** mobile app on your iOS or Android device.

---

## 5. Security & Operational Boundary

- **Decoupled Apps**: The mobile app and admin website are not yet connected to the backend server in Phase 2A.
- **No Mock Auth / Admin Accounts**: There are no public admin registration routes, unauthenticated admin endpoints, or fake database seeding.
- **No Hardcoded Secrets**: Production requires explicit configuration in `.env`. Wildcard CORS `*` is rejected in production.
- **Graceful Shutdown**: Traps `SIGTERM` and `SIGINT` to cleanly close open HTTP connections and terminate the Mongoose connection before process exit.
