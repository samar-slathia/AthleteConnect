# AthleteConnect — Phase 1: Foundation

AthleteConnect is a multi-sided sports coaching platform connecting athletes, parents, and coaches across combat sports and athletic disciplines (such as Boxing, Wushu, and Kickboxing).

This repository contains the **Phase 1: Foundation Only** implementation. It establishes a clean, beginner-friendly monorepo consisting of:
- **`mobile/`**: React Native & Expo app with TypeScript for Parent/Guardian, Individual Customer, and Player/Coach.
- **`admin/`**: Standalone React + Vite operations dashboard with TypeScript.
- **No Backend**: Real authentication, databases, bookings, payment processing, OTP, notifications, and coach verification will be introduced in subsequent phases.

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
├── README.md                       # Architecture, setup guide, PowerShell commands, & Phase 1 documentation
├── package.json                    # Root scripts for running and checking both applications
├── mobile/                         # React Native / Expo application
│   ├── assets/                     # App icons and splash screens
│   ├── src/
│   │   ├── components/             # Reusable UI components
│   │   │   ├── Badge.tsx           # Status and category pill badges
│   │   │   ├── Button.tsx          # Lime-accented prominent action buttons
│   │   │   ├── Header.tsx          # AthleteConnect branding header
│   │   │   ├── NoticeBanner.tsx    # Phase 1 disclaimer notice
│   │   │   └── RoleCard.tsx        # Accessible role selection cards with check state
│   │   ├── data/
│   │   │   ├── roles.ts            # Role specifications (Parent, Individual, Coach)
│   │   │   └── sports.ts           # Demo categories (Boxing, Wushu, Kickboxing)
│   │   ├── navigation/
│   │   │   ├── AppNavigator.tsx    # Native stack navigator
│   │   │   └── types.ts            # Strongly typed screen parameters
│   │   ├── screens/
│   │   │   ├── RoleSelectionScreen.tsx  # Initial screen with 3 role choices
│   │   │   └── RolePreviewScreen.tsx    # Role detail and sports discovery preview
│   │   └── theme/
│   │       └── tokens.ts           # Centralized color, typography, spacing, and radius tokens
│   ├── App.tsx                     # Entry point mounting NavigationContainer & SafeAreaProvider
│   ├── app.json                    # Expo configuration
│   ├── package.json                # Mobile dependencies & scripts
│   └── tsconfig.json               # TypeScript configuration extending Expo base
└── admin/                          # Standalone Admin Website (React + Vite + TypeScript)
    ├── public/                     # Static assets
    ├── src/
    │   ├── __tests__/              # Unit tests
    │   │   └── foundation.test.ts  # Design tokens and navigation integrity test
    │   ├── components/
    │   │   ├── NoticeBanner.tsx    # Phase 1 preview banner
    │   │   ├── Sidebar.tsx         # Deep navy navigation sidebar
    │   │   └── Topbar.tsx          # Status bar and preview operator profile
    │   ├── pages/
    │   │   ├── BookingsPage.tsx    # Sample bookings schedule shell
    │   │   ├── CoachVerificationPage.tsx # Simulated accreditation queue shell
    │   │   ├── FinancePage.tsx     # Simulated GMV and payouts shell
    │   │   ├── OverviewPage.tsx    # Dashboard with sample KPI metrics & recent applications
    │   │   └── UsersPage.tsx       # Platform user breakdown shell
    │   ├── theme/
    │   │   └── tokens.ts           # Design tokens matching locked visual palette
    │   ├── App.tsx                 # Main layout shell with tab switching
    │   ├── index.css               # Clean vanilla CSS design system
    │   └── main.tsx                # React 19 root mount
    ├── index.html                  # HTML entry point with Inter font & SEO meta tags
    ├── package.json                # Admin dependencies & scripts
    ├── tsconfig.json               # TypeScript configuration
    └── vite.config.ts              # Vite configuration
```

---

## 3. Technology Choices & Styling Rationale

- **Expo & React Native (Mobile)**: Built with official, stable Expo SDK 57 (`~57.0.30`) and React Native `0.86.3` (aligned for full compatibility with the current Play Store Expo Go app).
- **Styling Architecture Assessment**: React Native `StyleSheet` with centralized design tokens was selected over NativeWind. NativeWind v4 requires experimental PostCSS and Metro babel plugins that are prone to version conflicts and Windows-specific path issues. React Native `StyleSheet` with centralized tokens (`colors.ts`, `spacing.ts`, etc.) provides 100% stability, zero build friction, full type safety, and is effortless for a beginner to maintain without destabilizing the project.
- **Vite & React (Admin)**: Standalone React + Vite + TypeScript app running completely decoupled from the mobile client. Uses vanilla CSS custom properties to implement the locked visual design tokens cleanly with zero third-party framework overhead.
- **Icons**: Lucide (`lucide-react-native` and `lucide-react`) across both platforms for a unified visual design language.

---

## 4. Setup & Running with Windows PowerShell

All commands should be executed from the project root (`c:\Users\samar\OneDrive\Desktop\AthleteConnect`) in Windows PowerShell.

### A. Run Available Checks (Typechecks, Lint, Tests)

From the project root:
```powershell
# Run all checks across both mobile and admin
npm run check:all

# Or run checks individually:
npm run typecheck:mobile   # Type checks mobile app with tsc --noEmit
npm run typecheck:admin    # Type checks admin website with tsc -b --noEmit
npm run lint:admin         # Runs oxlint on admin code
npm run test:admin         # Runs Vitest unit test suite
```

### B. Launch the Admin Website

To start the Vite development server:
```powershell
npm run dev:admin
```
Then open your web browser to:
```
http://localhost:5173
```

To build the production bundle for admin:
```powershell
npm run build:admin
```

### C. Launch the Mobile Application

To start the Expo development server:
```powershell
npm run start:mobile
```
This will launch the Expo CLI interactive terminal:
- Press **`w`** to open in the web browser (requires `@expo/metro-runtime` which Expo prompts to install if requested).
- Press **`a`** to open in an Android Emulator.
- Scan the displayed QR code with the **Expo Go** app on your physical iOS or Android mobile device.

Alternatively, launch platform targets directly:
```powershell
npm run mobile:android   # Launch directly targeting Android emulator/device
npm run mobile:ios       # Launch directly targeting iOS simulator (macOS only)
```

---

## 5. How to Test the Role-Selection Flow (Mobile App)

1. Launch the mobile app (`npm run start:mobile`).
2. On initial load, you will be greeted by the **Role Selection Screen**:
   - AthleteConnect branding and logo badge.
   - Welcome headline and subtitle.
   - Three selectable role cards:
     1. **Parent / Guardian**: *"Find trusted coaches for your child, manage their training, and track their progress."*
     2. **Individual Customer**: *"Discover coaches and build your skills at your own pace."*
     3. **Player / Coach**: *"Explore coaching opportunities and manage your coaching profile."*
3. **Select any role**: Tapping a card highlights it with a navy border, checked indicator, and subtle background accent. The floating **Continue button** updates dynamically to display the selected role title.
4. **Tap Continue**: The app smoothly navigates to the **Role Preview Screen** (`RolePreview`):
   - Clearly displays the active role and planned features.
   - Displays the **Sports Discovery (Sample Preview)** with demo categories: **Boxing**, **Wushu**, and **Kickboxing**.
   - Displays sample coach listing stubs with ratings and demo rates.
5. **Tap "Change Role" or "Return to Role Selection"**: You are returned to the initial screen to test another selection.

---

## 6. How to Test the Admin Dashboard Shell

1. Launch the admin dashboard (`npm run dev:admin`) and open `http://localhost:5173`.
2. Inspect the **Deep Navy Sidebar** and **AthleteConnect** header.
3. Observe the prominent **Phase 1 Foundation Preview** notice banner at the top of every view.
4. Click through each sidebar navigation tab:
   - **Overview**: Displays 4 demo KPI metric cards (Sample Athletes, Sample Coaches, Completed Sessions, Platform Volume), the Coach Verification Queue sample table, and Initial Sports preview.
   - **Coach Verification**: Review the simulated coach accreditation queue, document check indicators, and Phase 2 stub notice.
   - **Users**: View the distribution of accounts across Parents, Individual Customers, and Coaches.
   - **Bookings**: Inspect the scheduled sessions demo table.
   - **Finance**: View simulated gross booking volume, coach payout share, and platform commission breakdown.

---

## 7. Current Limitations & Phase 1 Boundary

- **No Backend**: No database, server, REST/GraphQL API, or webhooks are present. All metrics and listings are static demonstration fixtures.
- **No Authentication**: Login, signup, password hashing, and session management are not implemented. The Admin dashboard is a development preview shell and must not be exposed to the public internet until server-side authentication and role-based access control (RBAC) are added in Phase 2.
- **No Data Persistence**: Role selections and navigation actions are in-memory client state. No personal data is requested or stored.
- **No Live Payments**: Financial metrics and coach rates are strictly demonstration stubs. No payment gateways (Stripe, PayPal, etc.) or banking details are configured.
