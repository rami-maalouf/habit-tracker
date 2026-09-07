const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { getPngInfo } = require('@expo/image-utils');
const { configureEntitlements, configureInfoPlist, writeAlternateIcons } = require('../../plugin');

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
