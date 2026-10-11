const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Expo Config Plugin to ensure activity-aliases and DynamicIconReceiver
 * are preserved across `npx expo prebuild` invocations.
 */
function withDynamicLauncherIcon(config) {
  return withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults.manifest;
    const application = androidManifest.application?.[0];
    if (!application) return config;

    // Ensure permissions
    if (!androidManifest['uses-permission']) {
      androidManifest['uses-permission'] = [];
    }
    const perms = androidManifest['uses-permission'];
    const hasBoot = perms.some(p => p.$?.['android:name'] === 'android.permission.RECEIVE_BOOT_COMPLETED');
    if (!hasBoot) {
      perms.push({
        $: { 'android:name': 'android.permission.RECEIVE_BOOT_COMPLETED' }
      });
    }

    // Strip category LAUNCHER from MainActivity so it does not collide with aliases
    const mainActivity = application.activity?.find(a => a.$?.['android:name'] === '.MainActivity');
    if (mainActivity && mainActivity['intent-filter']) {
      mainActivity['intent-filter'] = mainActivity['intent-filter'].filter(filter => {
        const hasLauncher = filter.category?.some(c => c.$?.['android:name'] === 'android.intent.category.LAUNCHER');
        return !hasLauncher;
      });
    }

    // Ensure activity-aliases
    if (!application['activity-alias']) {
      application['activity-alias'] = [];
    }
    const aliases = application['activity-alias'];

    const targetAliases = [
      { name: '.MainActivityDefault', icon: '@mipmap/ic_launcher', roundIcon: '@mipmap/ic_launcher_round', enabled: 'true' },
      { name: '.MainActivitySad', icon: '@mipmap/ic_launcher_sad', roundIcon: '@mipmap/ic_launcher_sad_round', enabled: 'false' },
      { name: '.MainActivityAngry', icon: '@mipmap/ic_launcher_angry', roundIcon: '@mipmap/ic_launcher_angry_round', enabled: 'false' },
      { name: '.MainActivityDramatic', icon: '@mipmap/ic_launcher_dramatic', roundIcon: '@mipmap/ic_launcher_dramatic_round', enabled: 'false' },
    ];

    for (const item of targetAliases) {
      const exists = aliases.some(a => a.$?.['android:name'] === item.name);
      if (!exists) {
        aliases.push({
          $: {
            'android:name': item.name,
            'android:targetActivity': '.MainActivity',
            'android:icon': item.icon,
            'android:roundIcon': item.roundIcon,
            'android:enabled': item.enabled,
            'android:exported': 'true',
          },
          'intent-filter': [
            {
              action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
              category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }],
            },
            {
              action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
              category: [
                { $: { 'android:name': 'android.intent.category.DEFAULT' } },
                { $: { 'android:name': 'android.intent.category.BROWSABLE' } },
              ],
              data: [{ $: { 'android:scheme': 'anyfetch' } }],
            },
            {
              action: [{ $: { 'android:name': 'android.intent.action.SEND' } }],
              data: [{ $: { 'android:mimeType': 'text/plain' } }],
              category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
            },
          ],
        });
      }
    }

    // Ensure receiver
    if (!application.receiver) {
      application.receiver = [];
    }
    const receivers = application.receiver;
    const hasReceiver = receivers.some(r => r.$?.['android:name'] === '.DynamicIconReceiver');
    if (!hasReceiver) {
      receivers.push({
        $: {
          'android:name': '.DynamicIconReceiver',
          'android:exported': 'true',
        },
        'intent-filter': [
          {
            action: [
              { $: { 'android:name': 'android.intent.action.BOOT_COMPLETED' } },
              { $: { 'android:name': 'com.abhishek.anyfetch.ACTION_UPDATE_DYNAMIC_ICON' } },
            ],
          },
        ],
      });
    }

    return config;
  });
}

module.exports = withDynamicLauncherIcon;
