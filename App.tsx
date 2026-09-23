/**
 * App.tsx — anyfetch Expo entry point
 * Works in Expo Go on iOS and Android.
 */

import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import HomeScreen from './src/screens/HomeScreen';
import SettingsScreen from './src/screens/SettingsScreen';

export type RootStack = {
  Home: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStack>();

const NAV_THEME = {
  dark: true,
  colors: {
    primary: '#fff',
    background: '#000',
    card: '#000',
    text: '#fff',
    border: '#111',
    notification: '#fff',
  },
  fonts: {
    regular: { fontFamily: 'System', fontWeight: '400' as const },
    medium: { fontFamily: 'System', fontWeight: '500' as const },
    bold: { fontFamily: 'System', fontWeight: '700' as const },
    heavy: { fontFamily: 'System', fontWeight: '900' as const },
  },
};

export default function App() {
  return (
    <>
      <StatusBar style="light" />
      <NavigationContainer theme={NAV_THEME}>
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: '#000000' },
            headerTintColor: '#ffffff',
            headerTitleStyle: { fontWeight: '400', fontSize: 16 },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: '#000000' },
            animation: 'fade',
          }}>
          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={{ headerShown: false, contentStyle: { backgroundColor: '#000000' } }}
          />
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{ title: 'Settings', contentStyle: { backgroundColor: '#000000' } }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}

const s = StyleSheet.create({
  settingsBtn: { padding: 4 },
  settingsIcon: { fontSize: 18, color: '#666' },
});
