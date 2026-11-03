import React from 'react';

export const Platform = {
  OS: 'ios' as 'ios' | 'android' | 'web',
  select: <T>(obj: { ios?: T; android?: T; web?: T; default?: T }): T => {
    return (obj[Platform.OS] ?? obj.default) as T;
  },
};

export const StyleSheet = {
  create: <T extends Record<string, any>>(styles: T): T => styles,
  flatten: (style: any) => (Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style || {}),
};

const createMockComponent = (name: string) => {
  const Component = React.forwardRef(({ children, ...props }: any, ref: any) => {
    return React.createElement(name, { ...props, ref }, children);
  });
  Component.displayName = name;
  return Component;
};

export const View = createMockComponent('View');
export const Text = createMockComponent('Text');
export const TextInput = createMockComponent('TextInput');
export const TouchableOpacity = createMockComponent('TouchableOpacity');
export const ScrollView = createMockComponent('ScrollView');
export const ActivityIndicator = createMockComponent('ActivityIndicator');
export const KeyboardAvoidingView = createMockComponent('KeyboardAvoidingView');
export const SafeAreaView = createMockComponent('SafeAreaView');
export const Modal = createMockComponent('Modal');

export const Linking = {
  canOpenURL: (_url: string): Promise<boolean> => Promise.resolve(true),
  openURL: (_url: string): Promise<void> => Promise.resolve(),
};

export const Animated = {
  Value: class {
    value: number;
    constructor(v: number) {
      this.value = v;
    }
    setValue(v: number) {
      this.value = v;
    }
    interpolate(_config: any) {
      return this.value;
    }
  },
  timing: () => ({
    start: (cb?: any) => cb && cb({ finished: true }),
    stop: () => {},
  }),
  spring: () => ({
    start: (cb?: any) => cb && cb({ finished: true }),
    stop: () => {},
  }),
  parallel: () => ({
    start: (cb?: any) => cb && cb({ finished: true }),
    stop: () => {},
  }),
  View: createMockComponent('Animated.View'),
};

export const PanResponder = {
  create: (config: any) => ({
    panHandlers: {},
    ...config,
  }),
};

export const AccessibilityInfo = {
  isReduceMotionEnabled: () => Promise.resolve(false),
};

type AppStateStatus = 'active' | 'background' | 'inactive';
type AppStateListener = (state: AppStateStatus) => void;
const appStateListeners = new Set<AppStateListener>();

export const AppState = {
  currentState: 'active' as AppStateStatus,
  addEventListener: (_type: string, listener: AppStateListener) => {
    appStateListeners.add(listener);
    return {
      remove: () => {
        appStateListeners.delete(listener);
      },
    };
  },
  _simulateStateChange: (newState: AppStateStatus) => {
    AppState.currentState = newState;
    appStateListeners.forEach((l) => l(newState));
  },
  _resetListeners: () => {
    appStateListeners.clear();
    AppState.currentState = 'active';
  },
};

export default {
  Platform,
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  SafeAreaView,
  Modal,
  Linking,
  Animated,
  PanResponder,
  AccessibilityInfo,
  AppState,
};
