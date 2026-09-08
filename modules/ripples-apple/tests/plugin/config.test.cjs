const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { getPngInfo } = require('@expo/image-utils');
const { configureEntitlements, configureInfoPlist, writeAlternateIcons } = require('../../plugin');
const withRipplesApple = require('../../plugin');

const appDelegateFixture = `internal import Expo
import React

class AppDelegate: ExpoAppDelegate {
  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    initializeReactNative()
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  public override func application(_ app: UIApplication, open url: URL) -> Bool {
    return openExistingLink(url)
  }
}
`;

async function applyAppDelegateMod(contents, language = 'swift') {
  const config = withRipplesApple({ ios: { bundleIdentifier: 'studio.orbitlabs.habittracker' } });
  return config.mods.ios.appDelegate({
    ...config,
    modRequest: { platform: 'ios', modName: 'appDelegate' },
    modResults: { path: '/fixture/AppDelegate.swift', language, contents },
  });
}

test('native startup registers the three app shortcuts once across repeated prebuilds', async () => {
  const first = (await applyAppDelegateMod(appDelegateFixture)).modResults.contents;
  const second = (await applyAppDelegateMod(first)).modResults.contents;
  const call = 'RipplesApplicationShortcuts.updateAppShortcutParameters()';
  assert.equal(second, first);
  assert.equal(first.split(call).length - 1, 1);
  assert.equal(first.split('import AppIntents').length - 1, 1);
  assert.ok(first.indexOf(call) > first.indexOf('initializeReactNative()'));
  assert.ok(first.indexOf(call) < first.indexOf('return super.application(application, didFinishLaunchingWithOptions: launchOptions)'));
  assert.ok(first.includes('return openExistingLink(url)'));
  assert.ok(first.startsWith('import AppIntents\ninternal import Expo'));
});

test('shortcut startup registration fails closed when the native launch hook changes', async () => {
  await assert.rejects(applyAppDelegateMod(appDelegateFixture, 'objc'), /swift app delegate/);
  await assert.rejects(applyAppDelegateMod('import Expo\nclass AppDelegate {}'), /launch hook/);
  await assert.rejects(applyAppDelegateMod(appDelegateFixture + appDelegateFixture), /launch hook/);
});

test('shortcut registration rejects duplicate or misplaced executable calls', async () => {
  const call = 'RipplesApplicationShortcuts.updateAppShortcutParameters()';
  const registered = (await applyAppDelegateMod(appDelegateFixture)).modResults.contents;
  await assert.rejects(applyAppDelegateMod(registered.replace(call, `${call}\n    ${call}`)), /shortcut registration/);
  await assert.rejects(applyAppDelegateMod(appDelegateFixture.replace('return openExistingLink(url)', `${call}\n    return openExistingLink(url)`)), /shortcut registration/);
  await assert.rejects(applyAppDelegateMod(appDelegateFixture.replace('    initializeReactNative()', `    ${call}\n    initializeReactNative()`)), /shortcut registration/);
});

test('a commented registration example never suppresses the executable startup call', async () => {
  const call = 'RipplesApplicationShortcuts.updateAppShortcutParameters()';
  const source = `// ${call}\n${appDelegateFixture}`;
  const first = (await applyAppDelegateMod(source)).modResults.contents;
  assert.match(first, /\n    RipplesApplicationShortcuts\.updateAppShortcutParameters\(\)\n    return super/);
  assert.equal((await applyAppDelegateMod(first)).modResults.contents, first);
});

test('generated shortcut provider uses the statically linked intents without an external package dependency', async () => {
  const projectRoot = path.resolve(__dirname, '../../../..');
  const platformProjectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ripples-native-config-'));
  try {
    const config = withRipplesApple({ ios: { bundleIdentifier: 'studio.orbitlabs.habittracker' } });
    await config.mods.ios.dangerous({
      ...config,
      modRequest: { platform: 'ios', modName: 'dangerous', projectRoot, platformProjectRoot, projectName: 'fixture' },
      modResults: {},
    });
    const source = await fs.readFile(path.join(platformProjectRoot, 'fixture/RipplesApplicationIntents.swift'), 'utf8');
    assert.doesNotMatch(source, /:\s*AppIntentsPackage\b|includedPackages/);
    assert.match(source, /struct RipplesApplicationShortcuts: AppShortcutsProvider/);
    const intents = [...source.matchAll(/intent: (Ripples\w+Intent)\(\)/g)].map((match) => match[1]);
    assert.deepEqual(intents, ['RipplesCheckInIntent', 'RipplesRemoveLatestCheckInIntent', 'RipplesTodayCheckInsIntent']);
  } finally {
    await fs.rm(platformProjectRoot, { recursive: true, force: true });
  }
});

test('one bundle identifier drives app group, cloudkit and native lookup keys idempotently', () => {
  const bundle = 'studio.orbitlabs.habittracker';
  const entitlements = configureEntitlements({ 'aps-environment': 'development' }, bundle);
  assert.deepEqual(configureEntitlements(entitlements, bundle), entitlements);
  assert.equal(entitlements['aps-environment'], 'development');
  assert.deepEqual(entitlements['com.apple.security.application-groups'], [`group.${bundle}`]);
  assert.deepEqual(entitlements['com.apple.developer.icloud-container-identifiers'], [`iCloud.${bundle}`]);
  assert.deepEqual(entitlements['com.apple.developer.icloud-services'], ['CloudKit']);
  assert.equal(entitlements['com.apple.developer.icloud-container-environment'], 'Development');
  const plist = configureInfoPlist({ CFBundleDisplayName: 'Ripples' }, bundle);
  assert.deepEqual(configureInfoPlist(plist, bundle), plist);
  assert.equal(plist.RipplesAppGroupIdentifier, `group.${bundle}`);
  assert.equal(plist.RipplesCloudKitContainerIdentifier, `iCloud.${bundle}`);
  assert.equal(plist.CFBundleDisplayName, 'Ripples');
});

test('cloudkit release environment is explicit and rejects unknown values', () => {
  const bundle = 'studio.orbitlabs.habittracker';
  const environmentKey = 'com.apple.developer.icloud-container-environment';
  assert.equal(configureEntitlements({}, bundle, 'Production')[environmentKey], 'Production');
  assert.throws(() => configureEntitlements({}, bundle, 'production'), /cloudkit environment/);
  const profiles = require('../../../../eas.json').build;
  assert.equal(profiles.development.env.RIPPLES_CLOUDKIT_ENVIRONMENT, 'Development');
  assert.equal(profiles.production.env.RIPPLES_CLOUDKIT_ENVIRONMENT, 'Production');
});

test('alternate artwork produces opaque universal 1024px app icon sets on repeat prebuilds', async () => {
  const root = path.resolve(__dirname, '../../../..');
  const output = await fs.mkdtemp(path.join(os.tmpdir(), 'ripples-icons-'));
  try {
    await writeAlternateIcons(root, output);
    await writeAlternateIcons(root, output);
    for (const name of ['midnight', 'paper']) {
      const directory = path.join(output, `${name}.appiconset`);
      const contents = JSON.parse(await fs.readFile(path.join(directory, 'Contents.json'), 'utf8'));
      assert.deepEqual(contents.images, [{ filename: 'icon.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }]);
      const info = await getPngInfo(path.join(directory, 'icon.png'));
      assert.equal(info.width, 1024);
      assert.equal(info.height, 1024);
      assert.equal(info.bpp, 3);
    }
  } finally {
    await fs.rm(output, { recursive: true, force: true });
  }
});
