const path = require('path');
const { fs, log, selectors, util, actions } = require('vortex-api');

const STEAMAPP_ID = '2670630';
const GAME_ID = 'supermarketsimulator';
const userProfile = path.join(process.env.USERPROFILE, 'AppData', 'LocalLow', 'Nokta Games', 'Supermarket Simulator');
const BEPINMELON_MOD_ID = 9;
const BEPINEX_RELPATH = 'bepinex';
const BEPINEX_PATCHERS_RELPATH = path.join(BEPINEX_RELPATH, 'patchers');
const BEPINEX_PLUGINS_RELPATH = path.join(BEPINEX_RELPATH, 'plugins');
const BEPINEX_CONFIG_RELPATH = path.join(BEPINEX_RELPATH, 'config');
const MELONLOADER_RELPATH = 'mlloader';
const MELONLOADER_PLUGINS_RELPATH = path.join(MELONLOADER_RELPATH, 'plugins');
const MELONLOADER_MODS_RELPATH = path.join(MELONLOADER_RELPATH, 'mods');
const MELONLOADER_CONFIG_RELPATH = path.join(MELONLOADER_RELPATH, 'userdata');
const TEXTUREREPLACER_RELPATH = path.join(BEPINEX_RELPATH, 'plugins', 'texturereplacer');
const MOREPRODUCTS_RELPATH = path.join(BEPINEX_RELPATH, 'plugins', 'moreproducts');

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

    context.registerAction('mod-icons', 2424, 'changelog', {}, 'Open Save Folder',
        () => { util.opn(userProfile) },
        () => {
            //Only show the action for SMS.
            const state = context.api.store.getState();
            const gameMode = selectors.activeGameId(state);
            return (gameMode === GAME_ID);
        });

    context.registerAction('mod-icons', 2425, 'import', {}, 'Open Log Folder',
        () => {
            const state = context.api.getState();
            const discovery = selectors.discoveryByGame(state, GAME_ID);
            util.opn(path.join(discovery.path, 'bepinex'))
        },
        () => {
            //Only show the action for SMS. 
            const state = context.api.store.getState();
            const gameMode = selectors.activeGameId(state);
            return (gameMode === GAME_ID);
        });


    //Test for plugin mods then moreproducts mods then texturereplacer mods.
    context.registerInstaller('supermarketsimulator-bepinmelonmod', 15, testSupportedPluginContent, installPluginMods(context.api));
    context.registerInstaller('supermarketsimulator-moreproductsmod', 20, testSupportedMoreProductsContent, installMoreProductsMods(context.api));
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
        files.forEach(file => {
            if (path.extname(file).toLowerCase() === '.dll') {
                const content = fs.readFileSync(path.join(workingDir, file), 'utf8');

                if (content.includes('BepInEx')) {
                    isBepInEx = true;
                    isBepInExPatcher = !content.includes('BaseUnityPlugin');
                } else if (content.includes('MelonLoader')) {
                    isMelonLoader = true;
                    isMelonLoaderPlugins = content.includes('MelonPlugin');
                }
            }
        });

        if (isBepInEx && isMelonLoader) {
            const mixedModHandling = await api.showDialog('error', 'Mixed mod detected', {
                bbcode: t('Vortex has detected that the mod package has bepinex and melonloader mod on the archive.[br][/br][br][/br]'
                    + `Mixed mods are not support by the game extension and the mod author will need to repackage their mod.`),
                //message: description,
                options: { order: ['bbcode'], wrap: true },
            }, [
                { label: 'Ok' }
            ]);
            if (mixedModHandling.action === 'Ok') {
                throw new util.UserCanceled();
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
            const bepinexPluginsIdx = segments.map(seg => seg.toLowerCase()).indexOf('plugins');
            const bepinexPatchersIdx = segments.map(seg => seg.toLowerCase()).indexOf('patchers');
            const melonloaderIdx = segments.map(seg => seg.toLowerCase()).indexOf('mlloader');
            const melonloaderConfigIdx = segments.map(seg => seg.toLowerCase()).indexOf('userdata');

            if (bepinexIdx !== -1) {
                variantSet.add(segments.slice(0, bepinexIdx).join(path.sep));
                accum.push({
                    type: 'copy',
                    source: iter,
                    destination: path.join(destination, segments.slice(bepinexIdx).join(path.sep)),
                });
            } else if (bepinexPluginsIdx !== -1) {
                const relPath = path.join(BEPINEX_PLUGINS_RELPATH, segments.slice(bepinexPluginsIdx + 1).join(path.sep));
                accum.push({
                    type: 'copy',
                    source: iter,
                    destination: path.join(destination, relPath),
                });
            } else if (bepinexPatchersIdx !== -1) {
                const relPath = path.join(BEPINEX_PATCHERS_RELPATH, segments.slice(bepinexPatchersIdx + 1).join(path.sep));
                accum.push({
                    type: 'copy',
                    source: iter,
                    destination: path.join(destination, relPath),
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
                        ? path.join(MELONLOADER_PLUGINS_RELPATH, path.basename(iter)) //hardcoded to mlloader/plugins
                        : path.join(MELONLOADER_MODS_RELPATH, path.basename(iter));   //hardcoded to mlloader/mods
                }

                accum.push({
                    type: 'copy',
                    source: iter,
                    destination: path.join(destination, relPath),
                });
            } else if (!ext) {
                // Handle asset files without extensions
                let otherRelPath = '';
                const otherSegments = iter.split(path.sep);

                if (isMelonLoader) {
                    otherRelPath = path.join(MELONLOADER_MODS_RELPATH, otherSegments.slice(1).join(path.sep));
                }
                else if (isBepInEx)
                    otherRelPath = path.join(BEPINEX_PLUGINS_RELPATH, otherSegments.slice(1).join(path.sep));

                accum.push({
                    type: 'copy',
                    source: iter,
                    destination: path.join(destination, otherRelPath),
                });
            } else { //Handle other asset files
                let otherRelPath = '';
                const otherSegments = iter.split(path.sep);

                if (isMelonLoader) {
                    otherRelPath = path.join(MELONLOADER_MODS_RELPATH, otherSegments.slice(1).join(path.sep));
                }
                else if (isBepInEx)
                    otherRelPath = path.join(BEPINEX_PLUGINS_RELPATH, otherSegments.slice(1).join(path.sep));

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
                bbcode: api.translate('The author of the mod has packaged the mod files in such a way that users need to specifically choose which variant of the mods to install.[br][/br][br][/br]'
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

function testSupportedMoreProductsContent(files, gameId) {

    const supported = (gameId) === GAME_ID && (files.findIndex(file => file.toLowerCase().includes('products.json')) !== -1)

    return Promise.resolve({
        supported,
        requiredFiles: [],
    });
}

function installMoreProductsMods(api) {
    return async (files, workingDir, gameId, progressDel, choices, unattended, archivePath) => {
        let destination = MOREPRODUCTS_RELPATH;
        const variantSet = new Set();

        const instructions = files.reduce((accum, iter) => {
            const ext = path.extname(path.basename(iter));
            if (!ext) {
                // This is a folder, leave it alone.
                return accum;
            }
            const segments = iter.split(path.sep);
            const lowerSegments = segments.map((seg) => seg.toLowerCase());

            const pluginsIdx = lowerSegments.indexOf('plugins');
            const moreProductsIdx = lowerSegments.indexOf('moreproducts');
            const bepinexVariantIdx = segments.map((seg) => seg.toLowerCase()).indexOf('bepinex');
            const moreProductsVariantIdx = segments.map((seg) => seg.toLowerCase()).indexOf('moreproducts');

            //Variant mod detection
            if (moreProductsVariantIdx !== -1)
                variantSet.add(segments.slice(0, moreProductsVariantIdx).join(path.sep));
            else if (bepinexVariantIdx !== -1)
                variantSet.add(segments.slice(0, bepinexVariantIdx).join(path.sep));

            let relPath;

            if (moreProductsIdx !== -1) {
                relPath = segments.slice(moreProductsIdx + 1).join(path.sep);
            } else if (pluginsIdx !== -1) {
                relPath = path.join('moreproducts', segments.slice(pluginsIdx + 1).join(path.sep));
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
                bbcode: api.translate('The author of the mod has packaged the mod files in such a way that users need to specifically choose which variant of the mods to install.[br][/br][br][/br]'
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

function testSupportedTextureReplacerContent(files, gameId) {
    const lowerCaseFiles = files.map(file => file.toLowerCase());

    const hasSupportedFileExt = (ext) => lowerCaseFiles.some(file => path.extname(file) === ext);
    const hasSupportedFolderName = (name) => lowerCaseFiles.some(file => file === name.toLowerCase());

    const supported = gameId === GAME_ID && (
        // .txt files can be considered readme files so I'm excluding that
        hasSupportedFileExt('.png') ||
        hasSupportedFileExt('.obj') ||
        hasSupportedFolderName('objects_textures') ||
        hasSupportedFolderName('products_icons') ||
        hasSupportedFolderName('products_names')
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
            const textureReplacerVariantIdx = segments.map((seg) => seg.toLowerCase()).indexOf('texturereplacer');
            const bepinexVariantIdx = segments.map((seg) => seg.toLowerCase()).indexOf('bepinex');

            if (textureReplacerVariantIdx !== -1)
                variantSet.add(segments.slice(0, textureReplacerVariantIdx).join(path.sep));
            else if (bepinexVariantIdx !== -1)
                variantSet.add(segments.slice(0, bepinexVariantIdx).join(path.sep));

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
                bbcode: api.translate('The author of the mod has packaged the mod files in such a way that users need to specifically choose which variant of the mods to install.[br][/br][br][/br]'
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

        //Todo
        /* 
        api.sendNotification({
            id: 'supermarketsimulator-bepinmelonpacknotinstalled',
            type: 'warning',
            message: `Tobey's BepInEx x MelonLoader Pack not deployed`,
            allowSuppress: true,
            actions: [
                {
                    title: 'More',
                    action: dismiss => {
                        api.showDialog('warning', `Tobey's BepInEx x MelonLoader Pack not deployed`, {
                            bbcode: api.translate(`Vortex has detected that Tobey's BepInEx x MelonLoader Pack is installed but not deployed`
                                + `Deployment is required to ensure that the mod is working as expected`)
                        }, [
                            { label: 'Deploy', action: () => api.suppressNotification('supermarketsimulator-bepinmelonpacknotinstalled') },
                            { label: 'Close', action: () => api.suppressNotification('supermarketsimulator-bepinmelonpacknotinstalled') }
                        ]);
                    },
                },
            ],
        });
    */

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
