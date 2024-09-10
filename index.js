const path = require('path');
const { fs, log, selectors, util, actions } = require('vortex-api');

const STEAMAPP_ID = '2670630';
const GAME_ID = 'supermarketsimulator';
const BEPINMELON_MOD_ID = 9;
const BEPINEX_RELPATH = 'bepinex';
const BEPINEX_PATCHERS_RELPATH = path.join(BEPINEX_RELPATH, 'patchers');
const BEPINEX_PLUGINS_RELPATH = path.join(BEPINEX_RELPATH, 'plugins');
const BEPINEX_CONFIG_RELPATH = path.join(BEPINEX_RELPATH, 'config');
const TEXTUREREPLACER_RELPATH = path.join(BEPINEX_RELPATH, 'plugins', 'texturereplacer');
const MELONLOADER_RELPATH = 'MLLoader';
const MELONLOADER_PLUGINS_RELPATH = path.join(MELONLOADER_RELPATH, 'plugins');
const MELONLOADER_MODS_RELPATH = path.join(MELONLOADER_RELPATH, 'mods');
const MELONLOADER_CONFIG_RELPATH = path.join(MELONLOADER_RELPATH, 'userdata');

function main(context) {
    context.registerGame({
        id: GAME_ID,
        name: 'Supermarket Simulator',
        mergeMods: true,
        queryPath: findGame,
        supportedTools: [],
        queryModPath: () => '',
        logo: 'gameart.jpg',
        executable: () => 'Supermarket Simulator.exe',
        requiredFiles: [
            'Supermarket Simulator.exe',
        ],
        setup: (discovery) => prepareForModding(context.api, discovery),
        environment: {
            SteamAPPId: STEAMAPP_ID,
        },
        details: {
            steamAppId: STEAMAPP_ID,
        },
    });

    //Test for plugin mods before texturereplacer mods
    context.registerInstaller('supermarketsimulator-bepinmelonmod', 20, testSupportedPluginContent, installPluginMods(context.api));
    context.registerInstaller('supermarketsimulator-texturereplacermod', 25, testSupportedTextureReplacerContent, installTextureReplacerMods(context.api));

    return true;
}

function testSupportedPluginContent(files, gameId) {
    let supported = (gameId === GAME_ID) &&
        (files.find(file => path.extname(file).toLowerCase() === '.dll') !== undefined) &&
        (files.findIndex(file => file.toLowerCase().includes('winhttp.dll')) === -1)

    return Promise.resolve({
        supported,
        requiredFiles: [],
    });
}

function installPluginMods(api) {
    return async (files, workingDir, gameId, progressDel, choices, unattended, archivePath) => {
        let destination = "";
        let isBepInEx = false;
        let isBepInExPatcher = false;
        let isMelonLoader = false;
        let isMelonLoaderPlugins = false;
        const variantSet = new Set();

        // Read the content of the DLL file to determine the mod type
        const dllPlugin = files.find(file => path.extname(file).toLowerCase() === '.dll');
        if (dllPlugin) {
            const content = fs.readFileSync(path.join(workingDir, dllPlugin), 'utf8');
            if (content.includes('BepInEx')) {
                isBepInEx = true;
                isBepInExPatcher = !content.includes('BaseUnityPlugin');
            } else if (content.includes('MelonLoader')) {
                isMelonLoader = true;
                isMelonLoaderPlugins = content.includes('MelonPlugin');
            }
        }

        const instructions = files.reduce((accum, iter) => {
            const ext = path.extname(iter).toLowerCase();
            try {
                const stats = fs.statSync(path.join(workingDir, iter));
                if (stats.isDirectory()) {
                    // Skip directories
                    return accum;
                }
            } catch (e) {
                api.sendNotification({
                    id: 'supermarketsimulator-staterror',
                    type: 'error',
                    message: 'Error while reading stats for the mod file',
                    allowSuppress: true,
                    actions: [
                        {
                            title: 'More',
                            action: dismiss => {
                                api.showDialog('error', 'Error while reading stats for the mod file', {
                                    bbcode: api.translate(`An error has occurred while reading stats for mod file:\n${iter}\n `
                                        + `Error:\n${e}\n\nPlease report this to the extension developer.`)
                                }, [
                                    { label: 'Close', action: () => api.suppressNotification('supermarketsimulator-staterror') }
                                ]);
                            },
                        },
                    ],
                });
                return accum;
            }

            const segments = iter.split(path.sep);
            const bepinexIdx = segments.map(seg => seg.toLowerCase()).indexOf('bepinex');
            const bepinexConfigIdx = segments.map(seg => seg.toLowerCase()).indexOf('config');
            const melonloaderIdx = segments.map(seg => seg.toLowerCase()).indexOf('mlloader');
            const melonloaderConfigIdx = segments.map(seg => seg.toLowerCase()).indexOf('userdata');

            if (bepinexIdx !== -1) {
                variantSet.add(segments.slice(0, bepinexIdx).join(path.sep));
                accum.push({
                    type: 'copy',
                    source: iter,
                    destination: path.join(destination, segments.slice(bepinexIdx).join(path.sep)),
                });
            } else if (bepinexConfigIdx !== -1) {
                const relPath = path.join(BEPINEX_CONFIG_RELPATH, segments.slice(bepinexConfigIdx + 1).join(path.sep));
                accum.push({
                    type: 'copy',
                    source: iter,
                    destination: path.join(destination, relPath),
                });
            } else if (melonloaderIdx !== -1) {
                variantSet.add(segments.slice(0, melonloaderIdx).join(path.sep));
                accum.push({
                    type: 'copy',
                    source: iter,
                    destination: path.join(destination, segments.slice(melonloaderIdx).join(path.sep)),
                });
            } else if (melonloaderConfigIdx !== -1) {
                const relPath = path.join(MELONLOADER_CONFIG_RELPATH, segments.slice(melonloaderConfigIdx + 1).join(path.sep));
                accum.push({
                    type: 'copy',
                    source: iter,
                    destination: path.join(destination, relPath),
                });
            } else if (ext === '.dll') {
                let relPath = '';
                const dllSegments = iter.split(path.sep);

                if (isBepInEx) {
                    relPath = isBepInExPatcher
                        ? path.join(BEPINEX_PATCHERS_RELPATH, dllSegments.slice(-2).join(path.sep))
                        : path.join(BEPINEX_PLUGINS_RELPATH, dllSegments.slice(-2).join(path.sep));
                } else if (isMelonLoader) {
                    relPath = isMelonLoaderPlugins
                        ? path.join(MELONLOADER_PLUGINS_RELPATH, dllSegments.slice(-2).join(path.sep))
                        : path.join(MELONLOADER_MODS_RELPATH, dllSegments.slice(-2).join(path.sep));
                }

                accum.push({
                    type: 'copy',
                    source: iter,
                    destination: path.join(destination, relPath),
                });
            } else if (!ext) {
                // Handle files without extensions
                let otherRelPath = '';
                const otherSegments = iter.split(path.sep);

                if (isMelonLoader) {
                    otherRelPath = path.join(MELONLOADER_MODS_RELPATH, otherSegments.slice(1).join(path.sep));
                }

                accum.push({
                    type: 'copy',
                    source: iter,
                    destination: path.join(destination, otherRelPath),
                });
            }

            return accum;
        }, []);

        if (variantSet.size > 1) {
            const variantModHandling = await api.showDialog('error', 'Variant mod detected', {
                bbcode: t('The author of the mod has packaged the mod files in such a way that users need to specifically choose which variant of the mods to install.[br][/br][br][/br]'
                    + `Variant mods are not supported by the game extension, and the mod author will need to repackage their mod.`),
                options: { order: ['bbcode'], wrap: true },
            }, [
                { label: 'Ok' },
                { label: 'Ignore' },
            ]);

            if (variantModHandling.action === 'Ok') {
                throw new util.UserCanceled();
            }

            api.sendNotification({
                type: 'warning', message: 'Variant mod detected.\n\nThe author of the mod has packaged the mod files in such a way that users need to specifically choose which variant of the mods to install.\n\nThe installed mod may not work as expected.',
            });
        }
        return Promise.resolve({ instructions });
    }
}

function testSupportedTextureReplacerContent(files, gameId) {
    const lowerCaseFiles = files.map(file => file.toLowerCase());

    const hasSupportedFile = (ext) => lowerCaseFiles.some(file => path.extname(file) === ext);
    const hasSupportedName = (name) => lowerCaseFiles.some(file => file === name.toLowerCase());

    const supported = gameId === GAME_ID && (
        // .txt files can be considered readme files so I'm excluding that
        hasSupportedFile('.png') ||
        hasSupportedFile('.obj') ||
        hasSupportedName('objects_textures') ||
        hasSupportedName('products_icons') ||
        hasSupportedName('products_names')
    );

    return Promise.resolve({
        supported,
        requiredFiles: [],
    });
}

function installTextureReplacerMods(api) {
    return async (files, workingDir, gameId, progressDel, choices, unattended, archivePath) => {
        let destination = TEXTUREREPLACER_RELPATH;
        const variantSet = new Set();

        const instructions = files.reduce((accum, iter) => {
            const ext = path.extname(path.basename(iter));
            if (!ext) {
                // This is a folder, leave it alone.
                return accum;
            }
            const segments = iter.split(path.sep);
            const lowerSegments = segments.map((seg) => seg.toLowerCase());
            const textureReplacerIdx = lowerSegments.indexOf('texturereplacer');

            if (textureReplacerIdx !== -1) {
                variantSet.add(segments.slice(0, textureReplacerIdx).join(path.sep));
            }

            const variantDirs = ['bepinex', 'plugins', 'texturereplacer', 'object_textures', 'products_icons', 'products_names'];
            const variantIdx = lowerSegments.findIndex(seg => variantDirs.includes(seg));

            let relPath;
            if (variantIdx !== -1) {
                // If 'texturereplacer' is found, only include the path after it
                if (lowerSegments[variantIdx] === 'texturereplacer') {
                    relPath = segments.slice(variantIdx + 1).join(path.sep);
                } else {
                    relPath = segments.slice(variantIdx).join(path.sep);
                }
            } else {
                relPath = segments.join(path.sep);
            }

            const fullDest = path.join(destination, relPath);

            accum.push({
                type: 'copy',
                source: iter,
                destination: fullDest,
            });

            return accum;
        }, []);

        if (variantSet.size > 1) {
            const variantModHandling = await api.showDialog('error', 'Variant mod detected', {
                bbcode: t('The author of the mod has packaged the mod files in such a way that users need to specifically choose which variant of the mods to install.[br][/br][br][/br]'
                    + `Variant mods are not supported by the game extension, and the mod author will need to repackage their mod.`),
            }, [
                { label: 'Ok' },
                { label: 'Ignore' },
            ]);

            if (variantModHandling.action === 'Ok') {
                throw new util.UserCanceled();
            }

            api.sendNotification({
                type: 'warning',
                message: 'Variant mod detected.\n\nThe author of the mod has packaged the mod files in such a way that users need to specifically choose which variant of the mods to install.\n\nThe installed mod may not work as expected.',
            });
        }

        return Promise.resolve({ instructions });
    }
}

async function modloaderRequirement(api, discovery) {
    try {
        await fs.statAsync(path.join(discovery.path, BEPINEX_RELPATH, 'patchers/tobey/Tobey.BepInExMelonLoaderWizard.dll')); // Check if file exists
    } catch (err) {
        const modFiles = await api.ext.nexusGetModFiles(GAME_ID, BEPINMELON_MOD_ID);

        const fileTime = (input) => Number.parseInt(input.uploaded_time, 10);

        const file = modFiles
            .filter(file => file.category_id === 1)
            .sort((lhs, rhs) => fileTime(lhs) - fileTime(rhs))[0];

        if (!file) {
            throw new Error('Error, no BepInEx x Melonloader pack file found!'); //This should never happen but just in case
        }

        const dlInfo = {
            game: GAME_ID,
            name: 'BEPINMELONPACK',
        };

        const nxmUrl = `nxm://${GAME_ID}/mods/${BEPINMELON_MOD_ID}/files/${file.file_id}`;
        const dlId = await new Promise((resolve, reject) => {
            api.events.emit('start-download', [nxmUrl], dlInfo, undefined, (err, result) => {
                if (err) return reject(err);
                resolve(result);
            }, undefined, { allowInstall: false });
        });

        const modId = await new Promise((resolve, reject) => {
            api.events.emit('start-install-download', dlId, { allowAutoEnable: false }, (err, result) => {
                if (err) return reject(err);
                resolve(result);
            });
        });

        const profileId = selectors.lastActiveProfileForGame(api.getState(), GAME_ID);
        await actions.setModsEnabled(api, profileId, [modId], true, {
            allowAutoDeploy: true,
            installed: true,
        });
    }
}

function findGame() {
    return util.GameStoreHelper.findByAppId([STEAMAPP_ID])
        .then(game => game.gamePath);
}

async function prepareForModding(api, discovery) {
    const modPaths = [
        path.join(discovery.path, BEPINEX_RELPATH),
        path.join(discovery.path, MELONLOADER_RELPATH),
    ];
    try {
        await Promise.all(modPaths.map((m) => fs.ensureDirWritableAsync(m)));
        await modloaderRequirement(api, discovery);
        return Promise.resolve();
    } catch (err) {
        log('error', 'Failed to prepare for modding', err);
        return Promise.reject(err);
    }
}

module.exports = {
    default: main,
};
