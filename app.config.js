export default {
  expo: {
    name: 'timetomoto',
    slug: 'timetomoto',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'dark',
    scheme: 'timetomoto',
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#0D0D0D',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.timetomoto.app',
      infoPlist: {
        UIBackgroundModes: ['location', 'fetch'],
        NSLocationWhenInUseUsageDescription:
          'Time to Moto uses your location to show your position on the map, record rides, and provide navigation.',
        NSLocationAlwaysAndWhenInUseUsageDescription:
          'Time to Moto shares your live location with your emergency contacts during rides.',
        NSLocationAlwaysUsageDescription:
          'Time to Moto shares your live location with your emergency contacts during rides.',
        NSMotionUsageDescription:
          'Time to Moto uses motion sensors to detect potential crashes and alert your emergency contacts.',
        NSContactsUsageDescription:
          'Time to Moto uses your contacts to make it easy to add emergency contacts for your rides.',
        NSSpeechRecognitionUsageDescription:
          'Time to Moto uses speech recognition for hands-free voice commands while riding.',
        NSMicrophoneUsageDescription:
          'Time to Moto uses the microphone for voice commands with Scout, your riding assistant.',
      },
    },
    android: {
      package: 'com.timetomoto.app',
      permissions: ['READ_CONTACTS'],
      adaptiveIcon: {
        backgroundColor: '#0D0D0D',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
    },
    web: {
      favicon: './assets/favicon.png',
      bundler: 'metro',
    },
    plugins: [
      'expo-router',
      'expo-secure-store',
      [
        'expo-location',
        {
          locationAlwaysAndWhenInUsePermission:
            'timetomoto uses your location to share your ride with emergency contacts and detect crashes.',
          isIosBackgroundLocationEnabled: true,
          isAndroidBackgroundLocationEnabled: true,
        },
      ],
      [
        'expo-notifications',
        {
          iosDisplayInForeground: true,
        },
      ],
      'expo-sensors',
      '@rnmapbox/maps',
      'expo-sharing',
      'expo-image',
      'expo-web-browser',
    ],
    experiments: {
      typedRoutes: true,
    },
  },
};
