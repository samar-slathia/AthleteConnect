import React from 'react';

export const useSafeAreaInsets = () => ({ top: 0, bottom: 0, left: 0, right: 0 });

export const SafeAreaProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return React.createElement(React.Fragment, null, children);
};

export const SafeAreaView: React.FC<{ children: React.ReactNode; style?: any }> = ({ children, style }) => {
  return React.createElement('div', { style }, children);
};

export default {
  useSafeAreaInsets,
  SafeAreaProvider,
  SafeAreaView,
};
