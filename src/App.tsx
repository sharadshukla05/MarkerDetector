/**
 * App.tsx — Root component
 * Sets up navigation, safe-area, and global providers.
 */
import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createStackNavigator} from '@react-navigation/stack';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {StatusBar, StyleSheet, View} from 'react-native';

import CameraScreen from './screens/CameraScreen';
import GalleryScreen from './screens/GalleryScreen';
import {MarkerStoreProvider} from './store/MarkerStore';

export type RootStackParamList = {
  Camera: undefined;
  Gallery: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

const App: React.FC = () => {
  return (
    <SafeAreaProvider>
      <MarkerStoreProvider>
        <NavigationContainer>
          <StatusBar
            barStyle="light-content"
            backgroundColor="#0a0a0f"
            translucent={false}
          />
          <Stack.Navigator
            initialRouteName="Camera"
            screenOptions={{
              headerStyle: styles.header,
              headerTintColor: '#e8e8ff',
              headerTitleStyle: styles.headerTitle,
              cardStyle: styles.card,
            }}>
            <Stack.Screen
              name="Camera"
              component={CameraScreen}
              options={{title: 'Marker Detector'}}
            />
            <Stack.Screen
              name="Gallery"
              component={GalleryScreen}
              options={{title: 'Captured Markers'}}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </MarkerStoreProvider>
    </SafeAreaProvider>
  );
};

const styles = StyleSheet.create({
  header: {
    backgroundColor: '#0a0a0f',
    elevation: 0,
    shadowOpacity: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e30',
  },
  headerTitle: {
    fontWeight: '700',
    fontSize: 18,
    letterSpacing: 0.5,
    color: '#e8e8ff',
  },
  card: {
    backgroundColor: '#0a0a0f',
  },
});

export default App;
