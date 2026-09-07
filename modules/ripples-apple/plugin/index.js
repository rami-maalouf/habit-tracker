const fs = require('node:fs/promises');
const path = require('node:path');
const { IOSConfig, withDangerousMod, withEntitlementsPlist, withInfoPlist, withXcodeProject } = require('expo/config-plugins');
const { generateImageAsync } = require('@expo/image-utils');

const alternateIcons = ['midnight', 'paper'];
const intentSourceName = 'RipplesApplicationIntents.swift';

function configureEntitlements(entitlements, bundleIdentifier, cloudKitEnvironment = 'Development') {
  if (!['Development', 'Production'].includes(cloudKitEnvironment)) {
    throw new Error('ripples-apple requires a Development or Production cloudkit environment');
  }
  return {
    ...entitlements,
    'com.apple.security.application-groups': [`group.${bundleIdentifier}`],
    'com.apple.developer.icloud-container-identifiers': [`iCloud.${bundleIdentifier}`],
    'com.apple.developer.icloud-services': ['CloudKit'],
    'com.apple.developer.icloud-container-environment': cloudKitEnvironment,
  };
}

function configureInfoPlist(infoPlist, bundleIdentifier) {
  return {
    ...infoPlist,
    RipplesAppGroupIdentifier: `group.${bundleIdentifier}`,
    RipplesCloudKitContainerIdentifier: `iCloud.${bundleIdentifier}`,
  };
}

async function writeAlternateIcons(projectRoot, catalogDirectory) {
  for (const name of alternateIcons) {
    const directory = path.join(catalogDirectory, `${name}.appiconset`);
    await fs.mkdir(directory, { recursive: true });
    const image = await generateImageAsync({ projectRoot, cacheType: `ripples-icon-${name}` }, {
      src: path.join(projectRoot, 'assets/images/alternate-icons', `${name}.png`),
      name: 'icon.png', width: 1024, height: 1024,
      resizeMode: 'cover', removeTransparency: true, backgroundColor: '#ffffff',
    });
    await fs.writeFile(path.join(directory, 'icon.png'), image.source);
    await fs.writeFile(path.join(directory, 'Contents.json'), JSON.stringify({
      images: [{ filename: 'icon.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }],
      info: { version: 1, author: 'xcode' },
    }, null, 2) + '\n');
  }
}

function withRipplesApple(config) {
  const bundleIdentifier = config.ios?.bundleIdentifier;
  if (!bundleIdentifier) throw new Error('ripples-apple requires ios.bundleIdentifier');

  config = withEntitlementsPlist(config, (mod) => {
    mod.modResults = configureEntitlements(mod.modResults, bundleIdentifier, process.env.RIPPLES_CLOUDKIT_ENVIRONMENT);
    return mod;
  });
  config = withInfoPlist(config, (mod) => {
    mod.modResults = configureInfoPlist(mod.modResults, bundleIdentifier);
    return mod;
  });
  config = withDangerousMod(config, ['ios', async (mod) => {
    const projectRoot = mod.modRequest.projectRoot;
    const projectName = mod.modRequest.projectName ?? IOSConfig.XcodeUtils.getProjectName(projectRoot);
    const applicationDirectory = path.join(mod.modRequest.platformProjectRoot, projectName);
    await writeAlternateIcons(projectRoot, path.join(applicationDirectory, 'Images.xcassets'));
    await fs.copyFile(path.join(__dirname, intentSourceName), path.join(applicationDirectory, intentSourceName));
    return mod;
  }]);
  config = withXcodeProject(config, (mod) => {
    const project = mod.modResults;
    const projectName = mod.modRequest.projectName;
    const { target, uuid } = IOSConfig.XcodeUtils.getApplicationNativeTarget({ project, projectName });
    for (const [, configuration] of IOSConfig.XcodeUtils.getBuildConfigurationsForListId(project, target.buildConfigurationList)) {
      // actool generates CFBundleAlternateIcons for iphone and ipad from these sets.
      configuration.buildSettings.ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES = '"' + alternateIcons.join(' ') + '"';
    }
    IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
      filepath: `${projectName}/${intentSourceName}`, groupName: projectName,
      project, targetUuid: uuid,
    });
    return mod;
  });
  return config;
}

module.exports = withRipplesApple;
module.exports.configureEntitlements = configureEntitlements;
module.exports.configureInfoPlist = configureInfoPlist;
module.exports.writeAlternateIcons = writeAlternateIcons;
