/**
 * App.tsx — anyfetch Expo entry point
 * Works in Expo Go on iOS and Android.
 */

import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { StyleSheet, AppState } from 'react-native';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { recordAppUsage } from './src/services/dynamicLauncherIcon';

import HomeScreen from './src/screens/HomeScreen';
import WhatsNewScreen from './src/screens/WhatsNewScreen';
import DownloadsScreen from './src/screens/DownloadsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import ThemeScreen from './src/screens/ThemeScreen';
import AboutScreen from './src/screens/AboutScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import { AppThemeProvider } from './src/theme/ThemeContext';
import { FONTS } from './src/theme/typography';
import { CustomAlertProvider } from './src/components/common/CustomAlert';
import {
  CascadeTransitionProvider,
  navigationRef,
} from './src/components/navigation/CascadePageTransition';
import { shouldShowWhatsNew } from './src/services/whatsNewService';

// Keep native splash screen visible while fonts load & startup gate resolves
SplashScreen.preventAutoHideAsync().catch(() => {});

export type RootStack = {
  WhatsNew: undefined;
  Home: undefined;
  Downloads: undefined;
  History: undefined;
  Settings: undefined;
  Theme: undefined;
  About: undefined;
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
    regular: { fontFamily: FONTS.sans, fontWeight: '400' as const },
    medium: { fontFamily: FONTS.sans, fontWeight: '500' as const },
    bold: { fontFamily: FONTS.sans, fontWeight: '700' as const },
    heavy: { fontFamily: FONTS.display, fontWeight: '900' as const },
  },
};

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    'Gambetta-Regular': require('./assets/fonts/Gambetta-Regular.ttf'),
    'GeneralSans-Semibold': require('./assets/fonts/GeneralSans-Semibold.ttf'),
  });

  const [initialRoute, setInitialRoute] = useState<'Home' | 'WhatsNew' | null>(null);

  // Evaluate What's New startup gate before any screen renders
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const decision = await shouldShowWhatsNew();
        if (mounted) {
          setInitialRoute(decision.shouldShow ? 'WhatsNew' : 'Home');
        }
      } catch (err) {
        if (mounted) setInitialRoute('Home');
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const isReady = (fontsLoaded || fontError) && initialRoute !== null;

  useEffect(() => {
    if (isReady) {
      SplashScreen.hideAsync().catch(() => {});
      recordAppUsage().catch(() => {});
    }
  }, [isReady]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        recordAppUsage().catch(() => {});
      }
    });
    return () => subscription.remove();
  }, []);

  if (!isReady || !initialRoute) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <AppThemeProvider>
        <StatusBar style="light" />
        <CascadeTransitionProvider>
          <NavigationContainer ref={navigationRef} theme={NAV_THEME}>
            <Stack.Navigator
              initialRouteName={initialRoute}
              screenOptions={{
                headerStyle: { backgroundColor: '#000000' },
                headerTintColor: '#ffffff',
                headerTitleStyle: { fontFamily: FONTS.sans, fontSize: 16 },
                headerShadowVisible: false,
                contentStyle: { backgroundColor: '#000000' },
                animation: 'fade',
                animationDuration: 260,
                gestureEnabled: true,
              }}>
              <Stack.Screen
                name="WhatsNew"
                component={WhatsNewScreen}
                options={{
                  headerShown: false,
                  gestureEnabled: false,
                  contentStyle: { backgroundColor: '#000000' },
                }}
              />
              <Stack.Screen
                name="Home"
                component={HomeScreen}
                options={{ headerShown: false, contentStyle: { backgroundColor: '#000000' } }}
              />
              <Stack.Screen
                name="Downloads"
                component={DownloadsScreen}
                options={{ headerShown: false, contentStyle: { backgroundColor: '#09090b' } }}
              />
              <Stack.Screen
                name="History"
                component={HistoryScreen}
                options={{ headerShown: false, contentStyle: { backgroundColor: '#000000' } }}
              />
              <Stack.Screen
                name="Settings"
                component={SettingsScreen}
                options={{ headerShown: false, contentStyle: { backgroundColor: '#000000' } }}
              />
              <Stack.Screen
                name="Theme"
                component={ThemeScreen}
                options={{ headerShown: false, contentStyle: { backgroundColor: '#000000' } }}
              />
              <Stack.Screen
                name="About"
                component={AboutScreen}
                options={{ headerShown: false, contentStyle: { backgroundColor: '#000000' } }}
              />
            </Stack.Navigator>
          </NavigationContainer>
        </CascadeTransitionProvider>
        <CustomAlertProvider />
      </AppThemeProvider>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  settingsBtn: { padding: 4 },
  settingsIcon: { fontSize: 18, color: '#666' },
});
