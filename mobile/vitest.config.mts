import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  define: {
    __DEV__: true,
  },
  resolve: {
    alias: {
      'react-native': path.resolve(__dirname, './src/__mocks__/react-native.ts'),
      'expo-secure-store': path.resolve(__dirname, './src/__mocks__/expo-secure-store.ts'),
      'react-native-safe-area-context': path.resolve(__dirname, './src/__mocks__/react-native-safe-area-context.ts'),
      'lucide-react-native': path.resolve(__dirname, './src/__mocks__/lucide-react-native.ts'),
      '@react-navigation/native-stack': path.resolve(__dirname, './src/__mocks__/react-navigation-native-stack.ts'),
      '@react-navigation/native': path.resolve(__dirname, './src/__mocks__/react-navigation-native.ts'),
      '@expo-google-fonts/inter': path.resolve(__dirname, './src/__mocks__/expo-google-fonts-inter.ts'),
      'expo-status-bar': path.resolve(__dirname, './src/__mocks__/expo-status-bar.ts'),
      'expo-location': path.resolve(__dirname, './src/__mocks__/expo-location.ts'),
    },
  },
});
